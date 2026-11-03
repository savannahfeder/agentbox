// Side by side on a film drew black boxes at 0:00 / 0:00 and Play did nothing,
// while the same film played alone. A tab has six connections to the app. A paused
// film on an open ended range keeps one for as long as it stays paused: measured in Chrome with
// a real 6.3 MB film, four films loaded and the fifth to eighth stayed at readyState 0.
// The tab door now answers a film in pieces, so each piece ends and frees its connection.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { mediaResponse, MEDIA_PIECE_BYTES } from '../main/img-scheme.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'film-piece-'));
const film = path.join(dir, 'film.mp4');
const SIZE = MEDIA_PIECE_BYTES * 3 + 10;
fs.writeFileSync(film, Buffer.alloc(SIZE, 7));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const piece = { piece: MEDIA_PIECE_BYTES };

describe('a film over the tab door', () => {
  it('answers an open ended range with one piece and says the true size', async () => {
    const res = await mediaResponse(film, 'bytes=0-', piece);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-${MEDIA_PIECE_BYTES - 1}/${SIZE}`);
    expect((await res.arrayBuffer()).byteLength).toBe(MEDIA_PIECE_BYTES);
  });

  it('gives the rest from wherever the player asks next, to the last byte', async () => {
    const res = await mediaResponse(film, `bytes=${MEDIA_PIECE_BYTES * 3}-`, piece);
    expect(res.headers.get('content-range')).toBe(`bytes ${MEDIA_PIECE_BYTES * 3}-${SIZE - 1}/${SIZE}`);
    expect((await res.arrayBuffer()).byteLength).toBe(10);
  });

  it('stays a range when the player asks with no range at all', async () => {
    const res = await mediaResponse(film, null, piece);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-${MEDIA_PIECE_BYTES - 1}/${SIZE}`);
    await res.arrayBuffer();
  });

  it('leaves alone a range smaller than a piece', async () => {
    const res = await mediaResponse(film, 'bytes=5-9', piece);
    expect(res.headers.get('content-range')).toBe(`bytes 5-9/${SIZE}`);
    expect((await res.arrayBuffer()).byteLength).toBe(5);
  });

  it('answers a film smaller than a piece whole', async () => {
    const small = path.join(dir, 'small.mp4');
    fs.writeFileSync(small, Buffer.alloc(100, 1));
    const res = await mediaResponse(small, null, piece);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });
});

describe('the desktop window, which has no six connection limit', () => {
  it('still gets the whole of what it asked for', async () => {
    const res = await mediaResponse(film, 'bytes=0-');
    expect(res.headers.get('content-range')).toBe(`bytes 0-${SIZE - 1}/${SIZE}`);
    expect((await res.arrayBuffer()).byteLength).toBe(SIZE);
  });
});
