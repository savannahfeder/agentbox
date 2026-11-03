// A PICTURE A DOCUMENT NAMES IS FOUND IN FILES BY ITS VERSION.
//
// Dev: the copy picks document drew "missing image: group-seat-picker-v3.png" where
// Sofia's picture should be, while the same picture drew fine from Files. The
// document's picture was looked for by that exact name on disk, and the third
// version had been sent under another name (group-seat-picker-v2.png), so no
// file of that name existed anywhere.
//
// What must NOT match: a picture of another family, or a version the file
// does not have.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appFilesPlace } from '../main/files-place.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'picture-by-version-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function aPlace(names) {
  const dir = fs.mkdtempSync(path.join(root, 'p-'));
  for (const n of names) fs.writeFileSync(path.join(dir, n), n);
  const product = { slug: 'lumen', name: 'Lumen app', dir };
  const lines = names.map((n, i) => ({ ts: i + 1, source: 'agent', patch: { result: `[${n}](${n})` } }));
  const store = {
    listProducts: () => [product],
    listAllWorkItems: () => [{ id: 'w-1', product: 'lumen', title: 'Seat picker', updatedAt: 1 }],
    readHistory: () => lines,
    teammates: { dir: () => dir },
  };
  return { place: appFilesPlace({ store, team: null, accountRoot: dir, storeRoot: dir }), dir };
}

describe('a picture named by a version', () => {
  const { place, dir } = aPlace(['group-seat-picker.png', 'group-seat-picker-v2.png', 'group-seat-picker-final.png']);

  it('is the version its number says, whatever that version is called on disk', async () => {
    expect(await place.pictureNamed('group-seat-picker-v3.png')).toBe(path.join(dir, 'group-seat-picker-final.png'));
  });

  it('is the version of that name when there is one', async () => {
    expect(await place.pictureNamed('designs/old/group-seat-picker-v2.png')).toBe(path.join(dir, 'group-seat-picker-v2.png'));
  });

  it('is nothing for a version the file does not have, or a file Files does not hold', async () => {
    expect(await place.pictureNamed('group-seat-picker-v9.png')).toBeNull();
    expect(await place.pictureNamed('seat-map-v2.png')).toBeNull();
  });
});

describe('the app', () => {
  it('asks Files for a picture the paths could not find', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
    expect(ipc).toMatch(/zero:open-artifact[\s\S]{0,1500}pictureNamed/);
  });
});
