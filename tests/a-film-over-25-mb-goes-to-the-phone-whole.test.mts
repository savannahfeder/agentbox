// A FILM OVER 25 MB GOES TO THE PHONE WHOLE, UP TO ITS OWN BOUND.
//
// What broke (2026-11-09): a finished cut an agent named, agent-docs-cut3-v7.mp4,
// opened on the phone as "This file is too big for your phone. Open it on your
// computer." The computer sent the phone nothing over 25 MB and no more than
// 100 MB a thread, so every finished film was listed as too big.
//
// Now a film may be up to 500 MB and does not count against the thread's
// budget; anything else keeps the 25 MB bound. When storage still turns one
// away for its size, it is listed as too big and the uploader carries on with
// the next file, rather than resting for half an hour as it does when offline.
// Sizes here are scaled down through `limits`.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPhoneUploads, UPLOAD_LIMITS } from '../main/phone-uploads.mts';
import { isTooBig } from '../main/team/supabase-backend.mts';

const T = Date.UTC(2026, 10, 9, 0, 20);
const LIMITS = { fileBytes: 1024, filmBytes: 4096, threadBytes: 1500, totalBytes: 1e9, files: 60, days: 7 };
let home: string; let docs: string;
const put = (name: string, bytes: number) => { const f = path.join(docs, name); fs.writeFileSync(f, Buffer.alloc(bytes, name.length)); return f; };
const snap = (text: string): any => ({ v: 3, item: { id: 'w-aaaaaaaaaa', result: text, updatedAt: T }, history: [] });

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-films-')));
  docs = path.join(home, 'Zero', 'accounts', 'a', 'proj');
  fs.mkdirSync(docs, { recursive: true });
});

function uploader({ refuseOver = Infinity } = {}) {
  const stored = new Map<string, number>();
  const logs: string[] = [];
  let now = T;
  const up = createPhoneUploads({
    backend: {
      async putPhoneFile({ name, data }: { name: string; data: Buffer }) {
        if (data.length > refuseOver) throw Object.assign(new Error('The object exceeded the maximum allowed size'), { tooBig: true });
        stored.set(name, data.length);
      },
      async dropPhoneFiles() {},
    },
    owner: 'o', device: 'a1b2c3d4e5f6', state: {}, save() {}, home, now: () => now, limits: LIMITS, log: (m: string) => logs.push(m),
  } as any);
  const list = async (text: string): Promise<Record<string, any>> => {
    up.manifest('t', snap(text), { dir: docs, updatedAt: T, base: '1' });
    await up.kick();
    now += 6 * 60_000;
    return up.manifest('t', snap(text), { dir: docs, updatedAt: T, base: '1' })?.files ?? {};
  };
  return { up, stored, logs, list };
}

describe('a film on its way to the phone', () => {
  it('the real bounds: a film up to 500 MB, anything else up to 25 MB', () => {
    expect(UPLOAD_LIMITS.filmBytes).toBe(500 * 1024 * 1024);
    expect(UPLOAD_LIMITS.fileBytes).toBe(25 * 1024 * 1024);
  });

  it('a film past the file bound goes up, in each film kind', async () => {
    for (const name of ['cut.mp4', 'cut.mov', 'cut.m4v', 'cut.webm']) put(name, 2048);
    const { list, stored } = uploader();
    const files = await list('cut.mp4 cut.mov cut.m4v cut.webm');
    for (const name of ['cut.mp4', 'cut.mov', 'cut.m4v', 'cut.webm']) expect(files[name].n, name).toMatch(/^[0-9a-f]{64}\./);
    expect(stored.size).toBe(4);
  });

  it('a film exactly at its bound goes; one byte over is too big', async () => {
    put('at.mp4', 4096); put('over.mp4', 4097);
    const { list } = uploader();
    const files = await list('at.mp4 over.mp4');
    expect(files['at.mp4'].n).toBeTruthy();
    expect(files['over.mp4']).toEqual({ s: 4097, big: true });
  });

  it('a picture past the file bound is still too big', async () => {
    put('huge.png', 2048);
    const { list, stored } = uploader();
    expect((await list('huge.png'))['huge.png']).toEqual({ s: 2048, big: true });
    expect(stored.size).toBe(0);
  });

  it('a film does not use up the thread\'s budget for its pictures', async () => {
    put('cut.mp4', 3000); put('a.png', 800); put('b.png', 800);
    const { list } = uploader();
    const files = await list('cut.mp4 a.png b.png');
    expect(files['cut.mp4'].n).toBeTruthy();
    expect(files['a.png'].n).toBeTruthy();
    expect(files['b.png']).toEqual({ s: 800, big: true });
  });

  it('a film storage turns away for its size is listed as too big, and the next file still goes', async () => {
    put('cut.mp4', 3000); put('a.png', 500);
    const { list, stored, logs } = uploader({ refuseOver: 2000 });
    const files = await list('cut.mp4 a.png');
    expect(files['cut.mp4']).toEqual({ s: 3000, big: true });
    expect(files['a.png'].n).toBeTruthy();
    expect(stored.size).toBe(1);
    expect(logs.join('\n')).toMatch(/turned away/);
    expect(logs.join('\n')).not.toMatch(/trying again in half an hour/);
  });
});

describe('what reads as storage refusing a file for its size', () => {
  it('a 413, or the words storage uses for it', () => {
    expect(isTooBig({ statusCode: '413', message: 'Payload too large' })).toBe(true);
    expect(isTooBig({ status: 413 })).toBe(true);
    expect(isTooBig({ statusCode: '400', message: 'The object exceeded the maximum allowed size' })).toBe(true);
  });

  it('not a refusal for anything else', () => {
    expect(isTooBig({ statusCode: '403', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isTooBig({ statusCode: '404', message: 'Bucket not found' })).toBe(false);
    expect(isTooBig(null)).toBe(false);
  });
});
