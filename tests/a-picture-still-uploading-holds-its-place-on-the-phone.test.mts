// A PICTURE STILL GOING UP SAID "MISSING IMAGE" ON THE PHONE (2026-11-16).
//
// A message named a picture made a minute before, and the phone app drew
// "missing image: designs/…/agentcloud-feed-7-v5.png" while the six older
// pictures in the same message drew. The file was on the computer. Its upload
// was queued, and a queued file was left out of the thread's list of files
// altogether, so the phone read it as a file it would never have.
//
// Now a queued file is listed as coming (`soon`), with its shape, so the
// phone holds its place and fills it once the upload lands.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPhoneUploads } from '../main/phone-uploads.mts';
import { cloudPlaces } from '../renderer/src/cloud-files';
import { fileOnPhone } from '../renderer/src/phone-links';
import { pictureLink, pictureShapeOf } from '../mobile/src/lib/files';

const T = Date.UTC(2026, 10, 16, 3, 50);
const DEVICE = 'a1b2c3d4e5f6';
let home: string; let docs: string;

function png(w: number, h: number) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  b[24] = 8; b[25] = 6;
  return Buffer.concat([b, Buffer.alloc(100)]);
}
const put = (name: string, data: Buffer | string) => { const f = path.join(docs, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const snap = (text: string) => ({ item: { id: 'w-aaaaaaaaaa', result: text, updatedAt: T }, history: [] });
const placesOf = (files: Record<string, unknown>) => cloudPlaces(
  [{ device: DEVICE, project: 'proj', snapshot: { item: { updatedAt: T }, attached: { dir: '~/Zero/accounts/a/proj', files } } }],
  (d, p) => `${p}@${d}`,
);
const P = `proj@${DEVICE}`;

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-soon-')));
  docs = path.join(home, 'Zero', 'accounts', 'a', 'proj');
  fs.mkdirSync(docs, { recursive: true });
});

function uploader(putPhoneFile: () => Promise<unknown> = async () => {}) {
  return createPhoneUploads({
    backend: { putPhoneFile, async dropPhoneFiles() {} },
    owner: 'o', device: DEVICE, state: { uploaded: {} }, save() {}, home, now: () => T,
  });
}

describe('a picture whose upload has not finished', () => {
  it('is listed as coming, with its shape, before the upload runs', () => {
    put('designs/feed-7-v5.png', png(1179, 2556));
    const files = uploader().manifest('t', snap('designs/feed-7-v5.png'), { dir: docs, updatedAt: T, base: '1' })?.files;
    expect(files?.['designs/feed-7-v5.png']).toEqual({ s: 133, soon: true, w: 1179, h: 2556 });
  });

  it('is listed by its name online once the upload lands', async () => {
    put('designs/feed-7-v5.png', png(10, 20));
    const up = uploader();
    up.manifest('t', snap('designs/feed-7-v5.png'), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    const entry = up.manifest('t', snap('designs/feed-7-v5.png'), { dir: docs, updatedAt: T, base: '2' })?.files['designs/feed-7-v5.png'];
    expect(entry?.n).toMatch(/^[0-9a-f]{64}\.png$/);
    expect(entry).not.toHaveProperty('soon');
  });

  it('holds its place on the phone rather than reading as missing', () => {
    const places = placesOf({ 'designs/feed-7-v5.png': { s: 133, soon: true, w: 1179, h: 2556 } });
    expect(pictureLink(places, new Map(), P, 'designs/feed-7-v5.png')).toBeUndefined();
    expect(pictureShapeOf(places, P, 'designs/feed-7-v5.png')).toEqual({ w: 1179, h: 2556 });
    expect(fileOnPhone(places, new Map(), P, 'designs/feed-7-v5.png')).toMatchObject({ ok: false, waiting: true });
  });

  it('a file no list names still reads as on the computer', () => {
    const places = placesOf({ 'designs/other.png': { s: 1, soon: 'yes' } });
    expect(pictureLink(places, new Map(), P, 'designs/feed-7-v5.png')).toBeNull();
    expect(pictureLink(places, new Map(), P, 'designs/other.png')).toBeNull();
  });
});
