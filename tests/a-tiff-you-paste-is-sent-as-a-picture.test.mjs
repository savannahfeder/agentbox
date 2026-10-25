// A TIFF YOU PASTE IS SENT AS A PICTURE.
//
// On 2026-10-22 a message to a teammate carried two pictures. One was drawn;
// the other came out as the bare name `file-3674d0dea94a72e6b8c93fc8e9cf731c.tiff`,
// and the sender, unable to tell whether it had gone, sent it again as a PNG.
// The clipboard had handed over a TIFF. `saveAttachments` counts only png, jpg,
// gif and webp as pictures, so the message linked it as a file, and the window
// could not have drawn it anyway. MEASURED in Playwright's Chromium
// 156.0.8078.4: the 40x30 TIFF below (Pillow reads it) fails to load in an
// <img>, and the same picture as a PNG loads. A TIFF can also be uncompressed:
// 2000x2000 RGBA is 16 MB, past the 10 MB a file may be to reach a teammate
// (main/team/sync.mjs), which then never sends it.
//
// So a TIFF or HEIC is turned into a PNG or JPEG the moment it enters a reply
// box, by the Mac's own `sips`. Where that cannot happen (not a Mac, sips
// fails) it stays the file it was, as before, and is never drawn as a broken
// picture.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { turnedName } from '../shared/picture-formats.mjs';
import { stageAttachment, turnIntoPicture } from '../main/stage-attachment.mjs';
import { saveAttachments } from '../main/save-attachments.mjs';
import { collectFiles } from '../renderer/src/attachments';
import { tinyTiff } from './helpers/tiny-tiff.mjs';

const HERS = 'file-3674d0dea94a72e6b8c93fc8e9cf731c.tiff';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('which pictures are turned into ones the window draws', () => {
  it('turns the TIFF that was sent into a PNG of the same name', () => {
    expect(turnedName(HERS)).toBe('file-3674d0dea94a72e6b8c93fc8e9cf731c.png');
  });

  it('turns .tif and any case of the extension', () => {
    expect(turnedName('scan.tif')).toBe('scan.png');
    expect(turnedName('SCAN.TIFF')).toBe('SCAN.png');
  });

  it('turns a photo from a phone into a JPEG', () => {
    expect(turnedName('IMG_0042.HEIC')).toBe('IMG_0042.jpg');
    expect(turnedName('burst.heif')).toBe('burst.jpg');
  });

  it('leaves pictures the window already draws alone', () => {
    for (const n of ['shot.png', 'photo.jpg', 'photo.jpeg', 'loop.gif', 'a.webp']) expect(turnedName(n)).toBeNull();
  });

  it('leaves a file that only mentions tiff alone', () => {
    for (const n of ['tiff-notes.txt', 'scan.tiff.zip', 'tiff', 'notes.pdf', '']) expect(turnedName(n)).toBeNull();
  });
});

describe('staging a pasted or dropped file', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  // Stands in for sips: writes a PNG beside the file, the way sips --out does.
  const fakeSips = (calls) => async (file) => {
    calls.push(file);
    const out = file.replace(/\.[^.]+$/, '.png');
    fs.writeFileSync(out, PNG_SIGNATURE);
    return out;
  };

  it('hands back a PNG, under the pasted name with .png, for a pasted TIFF', async () => {
    const calls = [];
    const got = await stageAttachment(path.join(dir, '.staging'), { name: HERS, dataBase64: tinyTiff(4, 3).toString('base64') }, { turn: fakeSips(calls) });
    expect(calls).toHaveLength(1);
    expect(got.name).toBe('file-3674d0dea94a72e6b8c93fc8e9cf731c.png');
    expect(got.path).toMatch(/file-3674d0dea94a72e6b8c93fc8e9cf731c\.png$/);
    expect(fs.readFileSync(got.path).subarray(0, 8)).toEqual(PNG_SIGNATURE);
    // The TIFF it came from is not left behind as a second file.
    expect(fs.readdirSync(path.join(dir, '.staging'))).toEqual([path.basename(got.path)]);
  });

  it('turns a dropped TIFF without touching the one on the disk', async () => {
    const theirs = path.join(dir, 'scan.tiff');
    fs.writeFileSync(theirs, tinyTiff(4, 3));
    const got = await stageAttachment(path.join(dir, '.staging'), { name: 'scan.tiff', srcPath: theirs }, { turn: fakeSips([]) });
    expect(got.name).toBe('scan.png');
    expect(fs.readFileSync(theirs)).toEqual(tinyTiff(4, 3));
  });

  it('does not run sips for a PNG', async () => {
    const calls = [];
    const got = await stageAttachment(path.join(dir, '.staging'), { name: 'pasted-1.png', dataBase64: PNG_SIGNATURE.toString('base64') }, { turn: fakeSips(calls) });
    expect(calls).toEqual([]);
    expect(got.name).toBeUndefined();
    expect(got.path).toMatch(/pasted-1\.png$/);
  });

  it('keeps the TIFF as it was when it cannot be turned', async () => {
    const got = await stageAttachment(path.join(dir, '.staging'), { name: HERS, dataBase64: tinyTiff(4, 3).toString('base64') }, { turn: async () => null });
    expect(got.name).toBeUndefined();
    expect(got.path).toMatch(/\.tiff$/);
    expect(fs.existsSync(got.path)).toBe(true);
  });

  it('keeps the TIFF when turning it throws', async () => {
    const got = await stageAttachment(path.join(dir, '.staging'), { name: HERS, dataBase64: tinyTiff(4, 3).toString('base64') }, { turn: async () => { throw new Error('sips died'); } });
    expect(got.path).toMatch(/\.tiff$/);
  });

  it('is turned into nothing off a Mac, where there is no sips', async () => {
    const file = path.join(dir, HERS);
    fs.writeFileSync(file, tinyTiff(4, 3));
    let ran = false;
    expect(await turnIntoPicture(file, { platform: 'linux', run: async () => { ran = true; } })).toBeNull();
    expect(ran).toBe(false);
  });

  it('asks sips for a PNG beside the TIFF, and a JPEG for a HEIC', async () => {
    const asked = [];
    const run = async (args) => { asked.push(args); fs.writeFileSync(args[args.length - 1], PNG_SIGNATURE); };
    const tiff = path.join(dir, 'a.tiff');
    const heic = path.join(dir, 'b.heic');
    expect(await turnIntoPicture(tiff, { platform: 'darwin', run })).toBe(path.join(dir, 'a.png'));
    expect(await turnIntoPicture(heic, { platform: 'darwin', run })).toBe(path.join(dir, 'b.jpg'));
    expect(asked).toEqual([
      ['-s', 'format', 'png', tiff, '--out', path.join(dir, 'a.png')],
      ['-s', 'format', 'jpeg', heic, '--out', path.join(dir, 'b.jpg')],
    ]);
  });

  it('answers nothing when sips writes nothing', async () => {
    expect(await turnIntoPicture(path.join(dir, 'a.tiff'), { platform: 'darwin', run: async () => {} })).toBeNull();
  });

  // The real thing, on a Mac: GitHub's macOS runner and the push hook there.
  it.runIf(process.platform === 'darwin')('turns a real TIFF into a real PNG with sips', async () => {
    const file = path.join(dir, HERS);
    fs.writeFileSync(file, tinyTiff(40, 30, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255])));
    const out = await turnIntoPicture(file);
    expect(out).toBe(path.join(dir, 'file-3674d0dea94a72e6b8c93fc8e9cf731c.png'));
    const png = fs.readFileSync(out);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([40, 30]);
  });
});

describe('the TIFF in the reply box and in the message', () => {
  let staged;
  beforeEach(() => {
    globalThis.FileReader = globalThis.FileReader ?? class {
      readAsDataURL(blob) {
        blob.arrayBuffer().then((buf) => { this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`; this.onload?.(); });
      }
    };
    staged = [];
    globalThis.window = globalThis.window ?? {};
    window.zero = {
      pathForFile: () => null,
      stageAttachment: async ({ name, srcPath }) => {
        staged.push(srcPath ? { name, from: srcPath } : { name });
        const as = turnedName(name);
        return as ? { path: `/Users/you/Zero/.staging/abc-${as}`, name: as } : { path: `/Users/you/Zero/.staging/abc-${name}` };
      },
    };
  });
  afterEach(() => { delete window.zero; });

  const tiffFile = () => new File([tinyTiff(4, 3)], HERS, { type: 'image/tiff' });

  it('is a picture in the box once it has been turned', async () => {
    const [a] = await collectFiles([tiffFile()]);
    expect(a).toEqual({ name: 'file-3674d0dea94a72e6b8c93fc8e9cf731c.png', srcPath: '/Users/you/Zero/.staging/abc-file-3674d0dea94a72e6b8c93fc8e9cf731c.png', image: true });
  });

  it('is a file, not a broken picture, when it could not be turned', async () => {
    window.zero.stageAttachment = async ({ name }) => ({ path: `/Users/you/Zero/.staging/abc-${name}` });
    const [a] = await collectFiles([tiffFile()]);
    expect(a.name).toBe(HERS);
    expect(a.image).toBe(false);
  });

  it('is copied in to be turned when it is dropped from the disk', async () => {
    window.zero.pathForFile = () => '/Users/you/Desktop/scan.tiff';
    const [a] = await collectFiles([new File([tinyTiff(4, 3)], 'scan.tiff', { type: 'image/tiff' })]);
    expect(staged).toEqual([{ name: 'scan.tiff', from: '/Users/you/Desktop/scan.tiff' }]);
    expect(a).toEqual({ name: 'scan.png', srcPath: '/Users/you/Zero/.staging/abc-scan.png', image: true });
  });

  it('still leaves a dropped PDF where it is', async () => {
    window.zero.pathForFile = () => '/Users/you/Desktop/notes.pdf';
    const [a] = await collectFiles([new File([new Uint8Array(8)], 'notes.pdf', { type: 'application/pdf' })]);
    expect(staged).toEqual([]);
    expect(a).toEqual({ name: 'notes.pdf', srcPath: '/Users/you/Desktop/notes.pdf', image: false });
  });

  it('goes into the message as a picture, not a link', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-'));
    try {
      const src = path.join(dir, 'staged.png');
      fs.writeFileSync(src, PNG_SIGNATURE);
      const [saved] = saveAttachments(dir, [{ name: 'file-3674d0dea94a72e6b8c93fc8e9cf731c.png', srcPath: src }]);
      expect(saved.image).toBe(true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
