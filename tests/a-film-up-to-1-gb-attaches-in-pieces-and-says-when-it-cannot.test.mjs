// A FILM UP TO 1 GB ATTACHES IN PIECES, AND THE BOX SAYS WHEN IT CANNOT.
//
// Sofia: 17 and 24 MB films sent; 34, 68 and 75 MB were refused the
// moment they were attached with "One pasted image is too big to save. Closing
// the card loses it."; Send then did nothing, or sent the message without the
// film and said nothing. Measured: a file from a browser tab has no path, so its
// bytes went to the computer whole, as base64, in one request, and the server
// takes 32 MB at most (main/serve.mjs), about a 24 MB file. The staging failed,
// the box kept the whole film as base64 in its draft, the draft could not hold
// it, and a send dropped it.
//
// Now such a file crosses in pieces of 4 MB, in order, and becomes a path like a
// dropped file's. A file over the limit (1 GB since 2026-11) is not read at all, and a box holding one,
// or one that failed, says so in words and does not send.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stageAttachmentPart } from '../main/stage-attachment.mjs';
import { PIECE_BYTES, attachProblem, collectFiles, persistAttachments } from '../renderer/src/attachments.ts';

const MB = 1024 * 1024;
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete globalThis.window; });

const b64 = (s) => Buffer.from(s).toString('base64');

describe('the computer puts the pieces together', () => {
  it('in order, into one file', () => {
    stageAttachmentPart(dir, { id: 'abcdef1234', name: 'cut.mp4', at: 0, dataBase64: b64('one-') });
    const out = stageAttachmentPart(dir, { id: 'abcdef1234', name: 'cut.mp4', at: 4, dataBase64: b64('two') });
    expect(fs.readFileSync(out.path, 'utf8')).toBe('one-two');
    expect(out.size).toBe(7);
  });

  it('refuses a piece out of order, or one whose start is gone', () => {
    stageAttachmentPart(dir, { id: 'abcdef1234', name: 'cut.mp4', at: 0, dataBase64: b64('one-') });
    expect(() => stageAttachmentPart(dir, { id: 'abcdef1234', name: 'cut.mp4', at: 9, dataBase64: b64('x') })).toThrow(/went missing/);
    expect(() => stageAttachmentPart(dir, { id: 'ffffff0000', name: 'cut.mp4', at: 4, dataBase64: b64('x') })).toThrow(/Attach it again/);
  });

  it('takes a piece that ends exactly at 1 GB', () => {
    const first = stageAttachmentPart(dir, { id: 'abcdef1234', name: 'raw.mov', at: 0, dataBase64: b64('x') });
    fs.truncateSync(first.path, 1024 * MB - 1);
    expect(stageAttachmentPart(dir, { id: 'abcdef1234', name: 'raw.mov', at: 1024 * MB - 1, dataBase64: b64('y') }).size).toBe(1024 * MB);
  });

  it('stops one byte past 1 GB and keeps nothing', () => {
    const first = stageAttachmentPart(dir, { id: 'abcdef1234', name: 'raw.mov', at: 0, dataBase64: b64('x') });
    fs.truncateSync(first.path, 1024 * MB);
    expect(() => stageAttachmentPart(dir, { id: 'abcdef1234', name: 'raw.mov', at: 1024 * MB, dataBase64: b64('y') })).toThrow(/over the 1 GB/);
    expect(fs.existsSync(first.path)).toBe(false);
  });

  it('keeps the file inside the staging folder whatever it is called', () => {
    const out = stageAttachmentPart(dir, { id: 'abcdef1234', name: '../../evil.mp4', at: 0, dataBase64: b64('x') });
    expect(path.dirname(out.path)).toBe(dir);
    expect(() => stageAttachmentPart(dir, { id: '../x', name: 'a.mp4', at: 0, dataBase64: '' })).toThrow();
  });

  it('a piece fits in one request with room to spare', () => {
    expect(Math.ceil(PIECE_BYTES / 3) * 4).toBeLessThan(32 * MB / 2);
  });
});

describe('a box in a tab, where a file has no path', () => {
  let calls;
  const zero = (more = {}) => {
    calls = { parts: [], whole: 0 };
    globalThis.window = { zero: {
      stageAttachmentPart: async (p) => { calls.parts.push(p.at); return stageAttachmentPart(dir, p); },
      stageAttachment: async () => { calls.whole += 1; return { path: path.join(dir, 'small') }; },
      saveAttachments: async ({ files }) => files.map((f) => ({ rel: `attachments/x-${f.name}`, name: f.name, image: false })),
      ...more,
    } };
  };
  const film = (mb, name = 'film-60mb.mp4') => new File([new Uint8Array(mb * MB).fill(7)], name, { type: 'video/mp4' });

  it('sends a film over one piece across in pieces and keeps its path, with how far it got', async () => {
    zero();
    const seen = [];
    const [got] = await collectFiles([film(9)], (now) => seen.push(now.map((a) => a.done)));
    expect(calls.parts).toEqual([0, 4 * MB, 8 * MB]);
    expect(calls.whole).toBe(0);
    expect(got.dataBase64).toBeUndefined();
    expect(fs.statSync(got.srcPath).size).toBe(9 * MB);
    expect(got.size).toBe(9 * MB);
    expect(seen.flat()).toContain(4 * MB);
    expect(seen.at(-1)).toEqual([]);
    expect(attachProblem([got])).toBeNull();
  });

  it('a small one still goes the old way', async () => {
    zero();
    await collectFiles([film(1, 'still.mp4')]);
    expect(calls.parts).toEqual([]);
    expect(calls.whole).toBe(1);
  });

  it('a file over 1 GB is not read, and the box says why', async () => {
    zero();
    const huge = { name: 'master-1.2gb.mov', size: 1.2 * 1024 * MB, type: 'video/quicktime', slice: () => { throw new Error('read'); } };
    const [got] = await collectFiles([huge]);
    expect(calls.parts).toEqual([]);
    expect(got.srcPath).toBeUndefined();
    expect(attachProblem([got])).toBe('master-1.2gb.mov is 1.2 GB, over the 1 GB a message can send.');
  });

  it('a piece the computer refuses leaves the film out and says so', async () => {
    zero({ stageAttachmentPart: async () => { throw new Error('The disk is full.'); } });
    const [got] = await collectFiles([film(5)]);
    expect(got.srcPath).toBeUndefined();
    expect(attachProblem([got])).toBe('film-60mb.mp4 could not be attached: The disk is full.');
  });

  it('never saves a message without a file it could not attach', async () => {
    zero();
    await expect(persistAttachments('p', [{ name: 'cut.mp4', image: false, size: 5 * MB, failed: 'cut.mp4 could not be attached: no.' }])).rejects.toThrow(/could not be attached/);
    await expect(persistAttachments('p', [{ name: 'raw.mov', image: false, size: 1024 * MB + 1 }])).rejects.toThrow(/over the 1 GB/);
  });
});
