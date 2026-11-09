// A VIDEO TOO BIG TO SEND IS REFUSED BEFORE THE PHONE READS IT.
//
// A file sent from the phone may be 25 MB at most (renderer/src/phone-sends-files.ts),
// but the phone read every picked photo, video or file whole into memory as
// base64 before anything checked its size, so a long video could end the app.
// Found by a mock App Store reviewer on the app review board (2026-11-08): a
// reviewer who attaches a video and sees the app close rejects it (2.1). Now
// the picker's own size is checked first, and a file over the limit is refused
// with the same words a send uses, without reading it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { tooBigToSend } from '../mobile/src/lib/attach';
import { SEND_MAX_BYTES } from '../renderer/src/phone-sends-files';

describe('the size check', () => {
  it('refuses a file over the send limit, saying the limit', () => {
    expect(tooBigToSend('trip.mov', SEND_MAX_BYTES + 1)).toBe('trip.mov is too big to send from your phone (25 MB at most).');
  });
  it('lets a file at the limit through', () => {
    expect(tooBigToSend('trip.mov', SEND_MAX_BYTES)).toBeNull();
  });
  it('lets a file of unknown size through, to be checked when it is sent', () => {
    expect(tooBigToSend('trip.mov', undefined)).toBeNull();
    expect(tooBigToSend('trip.mov', null)).toBeNull();
  });
});

describe('the pickers', () => {
  const pick = fs.readFileSync(new URL('../mobile/src/platform/pick.ts', import.meta.url), 'utf8');
  it('check before they read, for photos and videos', () => {
    const photos = pick.slice(pick.indexOf('export async function pickPhotos'), pick.indexOf('export async function pickFiles'));
    expect(photos.indexOf('tooBigToSend(name, a.fileSize)')).toBeGreaterThan(-1);
    expect(photos.indexOf('tooBigToSend(name, a.fileSize)')).toBeLessThan(photos.indexOf('.base64()'));
  });
  it('and for files', () => {
    const files = pick.slice(pick.indexOf('export async function pickFiles'));
    expect(files.indexOf('tooBigToSend(a.name, a.size)')).toBeGreaterThan(-1);
    expect(files.indexOf('tooBigToSend(a.name, a.size)')).toBeLessThan(files.indexOf('base64Of(a)'));
  });
  it('no longer asks the photo picker to read every file as base64 itself', () => {
    expect(pick).not.toMatch(/base64: true/);
  });
});
