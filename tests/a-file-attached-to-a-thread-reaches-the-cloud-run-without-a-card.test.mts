// A FILE ATTACHED TO A THREAD REACHES THE CLOUD RUN WITHOUT A CARD (w-15a6531bf9).
//
// A reply carried a 3-minute recording, `[loom-recording.mov](attachments/…-loom-recording.mov)`.
// The cloud run said it was too big to reach the machine and asked for it
// again with a file card, which the person then had to approve. Attaching it
// was already the consent. Measured against `filesNamedIn` before the fix: it
// returned nothing for that reply, for two reasons. The link scan only knew the
// extensions of documents and pictures, so a `.mov` link was never read; and any
// file over 25 MB was left behind, while the card sends up to 1 GB.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesNamedIn } from '../main/cloud/run.mts';
import { SENT_FILE_MAX } from '../shared/cloud-sent-files.mts';

const MB = 1024 * 1024;
let tmp; let store; let docs; let cwd;

// Sparse, so a file of any size costs no disk.
const fileOf = (p, bytes) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, ''); fs.truncateSync(p, bytes); return p; };

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'attached-')));
  store = path.join(tmp, 'store');
  docs = path.join(store, 'acct', 'product');
  cwd = path.join(tmp, 'repo');
  fs.mkdirSync(cwd, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const film = () => fileOf(path.join(docs, 'attachments', 'mw8tsbsb-d4pmep-loom-recording.mov'), 300 * MB);
const reply = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });

describe('a file attached to a thread', () => {
  it('goes with the reply that links it, a film over 25 MB included', () => {
    const f = film();
    const line = reply('Here is the recording\n[loom-recording.mov](attachments/mw8tsbsb-d4pmep-loom-recording.mov)');
    expect(filesNamedIn(line, { cwd, roots: [store], docs })).toEqual([f]);
  });

  it('goes when it is named by its full path, in the input or in the brief', () => {
    const f = film();
    expect(filesNamedIn(`see ${f}`, { cwd, roots: [store], docs })).toEqual([f]);
    expect(filesNamedIn(`The files this task carries:\n- ${f}\n`, { cwd, roots: [store], docsFolder: docs })).toEqual([f]);
  });

  it('goes at exactly 1 GB, and not a byte over, which is the most the card sends either', () => {
    const at = fileOf(path.join(docs, 'attachments', 'a-at.mp4'), SENT_FILE_MAX);
    const over = fileOf(path.join(docs, 'attachments', 'a-over.mp4'), SENT_FILE_MAX + 1);
    expect(filesNamedIn(`[at](attachments/a-at.mp4) [over](attachments/a-over.mp4)`, { cwd, roots: [store], docs })).toEqual([at]);
  });

  it('a link with a full stop after it still finds the file', () => {
    const f = fileOf(path.join(docs, 'attachments', 'x-notes.key'), 2 * MB);
    expect(filesNamedIn('the deck is attachments/x-notes.key.', { cwd, roots: [store], docs })).toEqual([f]);
  });
});

describe('what still stays behind', () => {
  it('a big file elsewhere in the store keeps the 25 MB limit', () => {
    const big = fileOf(path.join(docs, 'exports', 'dump.mov'), 30 * MB);
    const small = fileOf(path.join(docs, 'exports', 'clip.mov'), 2 * MB);
    expect(filesNamedIn(`${big} and ${small}`, { cwd, roots: [store], docs })).toEqual([small]);
  });

  it('a big file in another product\'s attachments keeps the 25 MB limit', () => {
    const other = fileOf(path.join(store, 'acct', 'other', 'attachments', 'b-film.mov'), 30 * MB);
    expect(filesNamedIn(`see ${other}`, { cwd, roots: [store], docs })).toEqual([]);
  });

  it('a link to an attachment that is not on disk sends nothing', () => {
    fs.mkdirSync(path.join(docs, 'attachments'), { recursive: true });
    expect(filesNamedIn('[gone.mov](attachments/gone.mov)', { cwd, roots: [store], docs })).toEqual([]);
  });

  it('a link that climbs out of the attachments folder sends nothing', () => {
    fileOf(path.join(tmp, 'secret.mov'), MB);
    fs.mkdirSync(path.join(docs, 'attachments'), { recursive: true });
    expect(filesNamedIn('[x](attachments/../../../../secret.mov)', { cwd, roots: [store], docs })).toEqual([]);
  });
});
