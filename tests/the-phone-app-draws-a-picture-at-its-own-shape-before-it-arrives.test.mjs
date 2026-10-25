// THE PHONE APP DRAWS A PICTURE AT ITS OWN SHAPE BEFORE IT ARRIVES.
//
// "It's a little spacy when I try to scroll. It almost shakes sometimes,
// especially right at the beginning when I first load the app and things are
// still loading" (2026-10-23, the phone app in Expo Go). The phone website
// fixed the same jump on 2026-10-14 by asking the Mac for a picture's width
// and height first (tests/a-picture-the-phone-has-never-seen-gets-its-shape-
// before-it-arrives). The app reads its files from the account with the Mac
// shut, so it had no one to ask: it drew a 4:3 box, fetched the whole picture
// to measure it (Image.getSize), then fetched it again to draw it, and every
// picture above the reader grew when it landed. The account's log for one
// opening of a thread on 2026-10-22 shows 39 downloads for its 12 pictures.
//
// Now the Mac writes each picture's width and height into the thread's list
// of files, read off the file's first bytes (main/picture-shape.mjs), and the
// app draws the picture's box at that shape at once and fetches it once.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPhoneUploads } from '../main/phone-uploads.mjs';
import { cloudPlaces } from '../renderer/src/cloud-files';
import { pictureShapeOf } from '../mobile/src/lib/files';

const T = Date.UTC(2026, 9, 23, 18, 0);
let home; let docs;

// A PNG's signature and IHDR chunk: enough for its width and height.
function png(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  b[24] = 8; b[25] = 6;
  return b;
}
const put = (name, data) => { const f = path.join(docs, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const snap = (text) => ({ v: 3, item: { id: 'w-aaaaaaaaaa', result: text, updatedAt: T }, history: [] });

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-shape-')));
  docs = path.join(home, 'Zero', 'accounts', 'a', 'proj');
  fs.mkdirSync(docs, { recursive: true });
});

async function listed(text) {
  const state = {};
  const up = createPhoneUploads({
    backend: { async putPhoneFile() {}, async dropPhoneFiles() {} },
    owner: 'o', device: 'a1b2c3d4e5f6', state, save() {}, home, now: () => T,
  });
  up.manifest('t', snap(text), { dir: docs, updatedAt: T, base: '1' });
  await up.kick();
  return up.manifest('t', snap(text), { dir: docs, updatedAt: T, base: '2' }).files;
}

describe('the list of a thread\'s files', () => {
  it('carries a picture\'s width and height', async () => {
    put('designs/shot.png', Buffer.concat([png(1179, 2556), Buffer.alloc(200)]));
    const files = await listed('designs/shot.png');
    expect(files['designs/shot.png']).toMatchObject({ w: 1179, h: 2556 });
  });

  it('carries none for what is not a picture, or a picture cut short', async () => {
    put('notes.md', '# Notes');
    put('broken.png', png(10, 10).subarray(0, 12));
    const files = await listed('notes.md broken.png');
    expect(files['notes.md']).not.toHaveProperty('w');
    expect(files['broken.png'] ?? {}).not.toHaveProperty('w');
  });
});

describe('the phone app', () => {
  const N = `${'a'.repeat(64)}.png`;
  const places = cloudPlaces([{ device: 'a1b2c3d4e5f6', project: 'proj', snapshot: { item: { updatedAt: T }, attached: { dir: '~/Zero/accounts/a/proj', files: {
    'designs/shot.png': { n: N, s: 200, w: 1179, h: 2556 },
    'designs/old.png': { n: `${'b'.repeat(64)}.png`, s: 200 },
    'designs/bad.png': { n: `${'c'.repeat(64)}.png`, s: 200, w: 0, h: 'x' },
  } } } }], (d, p) => `${p}@${d}`);

  it('knows a listed picture\'s shape by any way a message names it', () => {
    expect(pictureShapeOf(places, 'proj@a1b2c3d4e5f6', 'designs/shot.png')).toEqual({ w: 1179, h: 2556 });
    expect(pictureShapeOf(places, 'proj@a1b2c3d4e5f6', '~/Zero/accounts/a/proj/designs/shot.png')).toEqual({ w: 1179, h: 2556 });
    expect(pictureShapeOf(places, 'proj@a1b2c3d4e5f6', 'shot.png')).toEqual({ w: 1179, h: 2556 });
  });

  it('knows none for a picture listed without one, a shape that is not one, or a file it does not have', () => {
    expect(pictureShapeOf(places, 'proj@a1b2c3d4e5f6', 'designs/old.png')).toBeNull();
    expect(pictureShapeOf(places, 'proj@a1b2c3d4e5f6', 'designs/bad.png')).toBeNull();
    expect(pictureShapeOf(places, 'proj@a1b2c3d4e5f6', 'designs/nowhere.png')).toBeNull();
  });

  it('draws the picture at that shape at once, and measures it only when it has no shape', () => {
    const md = fs.readFileSync(new URL('../mobile/src/ui/Markdown.tsx', import.meta.url), 'utf8');
    const picture = md.slice(md.indexOf('function Picture('), md.indexOf('// MentionIcon'));
    expect(picture).toMatch(/files\??\.shape\??\.\(src\)/);
    expect(picture).toMatch(/if \(!uri \|\| known\) return;/);
  });
});
