// A BIG PASTED SCREENSHOT IS NOT "TOO BIG".
//
// The constraint was ours and it was in the wrong place. `collectFiles` carried
// a pasted screenshot as base64, the draft carried that into localStorage, and
// localStorage holds about 5 MB for the whole app — MEASURED at 5,241,856
// characters in this Chromium. Seven of the ninety-one screenshots in her store
// are over that line; the largest is 6,081,616 bytes.
//
// The number could never have reached her bar. Claude takes 10 MB of base64 per
// image at up to 8000x8000, which is about 7.5 MB of file — more than the whole
// localStorage quota. So the bytes go to disk at paste time and the draft keeps
// a path, which it already stored for free.
//
// These pin the two halves of that: the paste stages, and a staged paste of any
// size survives the draft untouched.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectFiles } from '../renderer/src/attachments';
import {
  readDraftAttachments, saveDraftAttachments, COMPOSE_DRAFT_MAX_BYTES,
} from '../renderer/src/drafts';

const ITEM = { product: 'agentbox', id: 'w-4fd9e60efb' };

function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

// The clipboard hands over a File with no path. Enough of one for collectFiles:
// it reads .name and .type, and FileReader reads the blob.
const clipboardFile = (bytes) => new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' });

// This suite runs in node, which has File and Blob but no FileReader, and
// `blobToBase64` uses one. The shim is the real thing's contract and nothing
// more: read the blob, hand back a data URL. What is under test is which branch
// `collectFiles` takes, not how a browser turns bytes into base64.
class ShimFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
      this.onload?.();
    }, (e) => this.onerror?.(e));
  }
}

let staged;
beforeEach(() => {
  globalThis.FileReader = globalThis.FileReader ?? ShimFileReader;
  staged = [];
  globalThis.window = globalThis.window ?? {};
  window.zero = {
    pathForFile: () => null,                       // clipboard data has no path
    // Bytes for a paste, a path for a drag. The stub takes both, because a stub
    // that throws on one of them turns a real change into a green test: this
    // one did, until the drop case below was written.
    stageAttachment: async ({ name, dataBase64, srcPath }) => {
      staged.push(srcPath ? { name, from: srcPath } : { name, chars: dataBase64.length });
      return { path: `/Users/you/Zero/.staging/abc-${name}` };
    },
  };
});
afterEach(() => { delete window.zero; });

// 6,081,616 bytes: msz7jy51-pasted-26280.png, the largest she has really pasted.
const HER_BIGGEST = 6_081_616;

describe('a pasted screenshot, at the size she actually pastes', () => {
  it('goes to disk instead of into the draft', async () => {
    const [a] = await collectFiles([clipboardFile(1024)]);
    expect(staged.length).toBe(1);
    expect(a.srcPath).toMatch(/\.staging\//);
    expect(a.dataBase64).toBeUndefined();
    expect(a.image).toBe(true);
  });

  it('survives the draft at 6 MB, which the old budget dropped', async () => {
    const [shot] = await collectFiles([clipboardFile(HER_BIGGEST)]);

    // The bytes really were past the old ceiling: this is the failure she saw.
    const asBytesWould = JSON.stringify([{ ...shot, srcPath: undefined, dataBase64: 'A'.repeat(Math.ceil(HER_BIGGEST / 3) * 4) }]);
    expect(asBytesWould.length).toBeGreaterThan(COMPOSE_DRAFT_MAX_BYTES);

    const store = fakeStore();
    const { kept, dropped } = saveDraftAttachments(ITEM, [shot], store);
    expect(dropped).toEqual([]);                   // nothing is "too big" any more
    expect(kept.length).toBe(1);
    expect(readDraftAttachments(ITEM, store)[0].srcPath).toBe(shot.srcPath);
  });

  it('costs the draft a path, not a picture', async () => {
    const [shot] = await collectFiles([clipboardFile(HER_BIGGEST)]);
    const store = fakeStore();
    saveDraftAttachments(ITEM, [shot], store);
    // What the store now holds is a filename, not six megabytes of image.
    const written = JSON.stringify(readDraftAttachments(ITEM, store));
    expect(written.length).toBeLessThan(500);
  });

  it('still keeps the screenshot when staging is not available', async () => {
    // An older main process, or a build with no bridge. Losing her paste would
    // be a worse failure than the budget, so the bytes remain the fallback.
    window.zero.stageAttachment = undefined;
    const [a] = await collectFiles([clipboardFile(64)]);
    expect(a.srcPath).toBeUndefined();
    expect(typeof a.dataBase64).toBe('string');
    expect(a.dataBase64.length).toBeGreaterThan(0);
  });

  it('still keeps the screenshot when staging throws', async () => {
    window.zero.stageAttachment = async () => { throw new Error('disk full'); };
    const [a] = await collectFiles([clipboardFile(64)]);
    expect(a.srcPath).toBeUndefined();
    expect(typeof a.dataBase64).toBe('string');
  });

  // A PICTURE SHE DRAGS IN IS COPIED INSIDE.
  //
  // A dropped file keeps its own path, and the window may only draw pictures
  // the app owns, so her `fun-mode.png` off the Desktop was a broken thumbnail
  // in the reply box while a pasted screenshot was fine. The copy is what
  // makes it drawable.
  it('copies a dropped picture into the staging folder', async () => {
    window.zero.pathForFile = () => '/Users/you/Desktop/shot.png';
    const [a] = await collectFiles([clipboardFile(64)]);
    expect(staged).toEqual([{ name: 'image.png', from: '/Users/you/Desktop/shot.png' }]);
    expect(a.srcPath).toBe('/Users/you/Zero/.staging/abc-image.png');
  });

  it('leaves a dropped file that is not a picture alone', async () => {
    window.zero.pathForFile = () => '/Users/you/Desktop/notes.pdf';
    const pdf = new File([new Uint8Array(64)], 'notes.pdf', { type: 'application/pdf' });
    const [a] = await collectFiles([pdf]);
    expect(staged).toEqual([]);                    // no thumbnail, nothing to gain
    expect(a.srcPath).toBe('/Users/you/Desktop/notes.pdf');
  });

  // The thumbnail is worth a copy. It is not worth her attachment.
  it('keeps a dropped picture at its own path when staging fails', async () => {
    window.zero.pathForFile = () => '/Users/you/Desktop/shot.png';
    window.zero.stageAttachment = async () => { throw new Error('disk full'); };
    const [a] = await collectFiles([clipboardFile(64)]);
    expect(a.srcPath).toBe('/Users/you/Desktop/shot.png');
    expect(a.image).toBe(true);
  });
});
