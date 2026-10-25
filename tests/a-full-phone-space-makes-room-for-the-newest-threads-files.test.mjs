// A FULL PHONE SPACE MAKES ROOM FOR THE NEWEST THREAD'S FILES.
//
// On 2026-10-22 the phone app showed no pictures for any new thread. Measured
// that evening: this Mac had sent 1,268 files, 943.7 MB, against its 900 MB
// budget (UPLOAD_LIMITS.totalBytes), and had turned down every new file since
// 2026-10-21 04:26 UTC with only a log line, "the space for files is full".
// A file only left once no thread had named it for three days, and every
// thread from the last week still named its files, so the space stayed full
// and the newest work, the part a person opens on a phone, was what stayed
// behind. Now a file from a newer thread takes the place of the oldest
// threads' files; a file never pushes out one of a thread as new as its own.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createPhoneUploads, UPLOAD_LIMITS } from '../main/phone-uploads.mjs';

const T = Date.UTC(2026, 9, 22, 18, 0);
const MIN = 60_000;
let home; let docs;
const put = (name, bytes) => { const file = path.join(docs, name); fs.writeFileSync(file, crypto.randomBytes(bytes)); return file; };
const snap = (id, text, updatedAt) => ({ v: 3, item: { id, result: text, updatedAt }, history: [] });

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-room-')));
  docs = path.join(home, 'Zero', 'accounts', 'a', 'proj');
  fs.mkdirSync(docs, { recursive: true });
});

function uploader({ totalBytes = 10 } = {}) {
  const stored = new Map();
  const dropped = [];
  const lines = [];
  const state = {};
  let now = T;
  const up = createPhoneUploads({
    backend: {
      async putPhoneFile({ name, data }) { stored.set(name, data.length); },
      async dropPhoneFiles({ names }) { for (const n of names) { stored.delete(n); dropped.push(n); } },
    },
    owner: 'o', device: 'a1b2c3d4e5f6', state, save() {}, home, now: () => now, log: (l) => lines.push(l),
    limits: { fileBytes: 1e9, threadBytes: 1e9, totalBytes, files: 60, days: 7 },
  });
  const list = (id, text, updatedAt) => up.manifest(id, snap(id, text, updatedAt), { dir: docs, updatedAt, base: text });
  return { up, stored, dropped, lines, state, list, tick: (ms) => { now += ms; } };
}

describe('when the space is full', () => {
  it('the oldest thread\'s files make room for a newer thread\'s', async () => {
    put('old-1.png', 4); put('old-2.png', 4); put('new.png', 4);
    const u = uploader({ totalBytes: 10 });
    u.list('w-old', 'old-1.png old-2.png', T - 3 * 24 * 60 * MIN);
    await u.up.kick();
    expect(u.stored.size).toBe(2);
    u.tick(6 * MIN);
    u.list('w-new', 'new.png', T);
    await u.up.kick();
    expect([...u.stored.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10);
    expect(u.stored.size).toBe(2);
    expect(u.dropped).toHaveLength(1);
    expect(u.up.manifest('w-new', snap('w-new', 'new.png', T), { dir: docs, updatedAt: T, base: 'x' }).files['new.png'].n).toMatch(/\.png$/);
  });

  it('takes only as many as it needs, the oldest first', async () => {
    put('a.png', 3); put('b.png', 3); put('c.png', 3); put('new.png', 3);
    const u = uploader({ totalBytes: 9 });
    u.list('w-a', 'a.png', T - 3000 * MIN);
    u.list('w-b', 'b.png', T - 2000 * MIN);
    u.list('w-c', 'c.png', T - 1000 * MIN);
    await u.up.kick();
    expect(u.stored.size).toBe(3);
    u.tick(6 * MIN);
    u.list('w-new', 'new.png', T);
    await u.up.kick();
    expect(u.dropped.map((n) => n.slice(-4))).toEqual(['.png']);
    expect(u.dropped).toHaveLength(1);
    const left = Object.keys(u.state.uploaded);
    expect(left).toHaveLength(3);
    expect(u.up.manifest('w-b', snap('w-b', 'b.png', T - 2000 * MIN), { dir: docs, updatedAt: T - 2000 * MIN, base: 'y' }).files['b.png'].n).toBeTruthy();
    expect(u.up.manifest('w-a', snap('w-a', 'a.png', T - 3000 * MIN), { dir: docs, updatedAt: T - 3000 * MIN, base: 'y' })).toBe(null);
  });

  it('a file an old and a new thread both name counts as new', async () => {
    put('shared.png', 4); put('old.png', 4); put('new.png', 4);
    const u = uploader({ totalBytes: 10 });
    u.list('w-old', 'shared.png old.png', T - 3000 * MIN);
    await u.up.kick();
    u.tick(6 * MIN);
    u.list('w-mid', 'shared.png', T - 10 * MIN);
    u.list('w-new', 'new.png', T);
    await u.up.kick();
    const shared = Object.entries(u.state.uploaded).find(([n]) => u.stored.has(n) && u.state.uploaded[n].rank === T - 10 * MIN);
    expect(shared).toBeTruthy();
    expect(u.dropped).toHaveLength(1);
  });
});

describe('what never happens', () => {
  it('a file never pushes out one of a thread as new as its own, or newer', async () => {
    put('new-1.png', 4); put('new-2.png', 4); put('older.png', 4);
    const u = uploader({ totalBytes: 8 });
    u.list('w-new', 'new-1.png new-2.png', T);
    await u.up.kick();
    u.tick(6 * MIN);
    u.list('w-same', 'older.png', T);
    u.list('w-older', 'older.png', T - 60 * MIN);
    await u.up.kick();
    expect(u.dropped).toEqual([]);
    expect(u.stored.size).toBe(2);
  });

  it('nothing is taken before every thread has said how new its files are', async () => {
    put('kept.png', 4); put('new.png', 4);
    const u = uploader({ totalBytes: 6 });
    u.state.uploaded = {};
    u.list('w-kept', 'kept.png', T - 3000 * MIN);
    await u.up.kick();
    const [name] = Object.keys(u.state.uploaded);
    delete u.state.uploaded[name].rank;
    const fresh = createPhoneUploads({
      backend: { async putPhoneFile() {}, async dropPhoneFiles({ names }) { u.dropped.push(...names); } },
      owner: 'o', device: 'a1b2c3d4e5f6', state: u.state, save() {}, home, now: () => T, log: () => {},
      limits: { fileBytes: 1e9, threadBytes: 1e9, totalBytes: 6, files: 60, days: 7 },
    });
    fresh.manifest('w-new', snap('w-new', 'new.png', T), { dir: docs, updatedAt: T, base: '1' });
    await fresh.kick();
    expect(u.dropped).toEqual([]);
  });

  // Codex's review of the first cut (2026-10-22): it took the old files off
  // before the new one was up, so a refused upload left the phone with neither.
  it('takes nothing off the phone when the new file does not go up', async () => {
    put('old.png', 4); put('new.png', 4);
    const u = uploader({ totalBytes: 6 });
    u.list('w-old', 'old.png', T - 3000 * MIN);
    await u.up.kick();
    u.tick(6 * MIN);
    let clock = T + 12 * MIN;
    const refusing = createPhoneUploads({
      backend: { async putPhoneFile() { throw new Error('offline'); }, async dropPhoneFiles({ names }) { u.dropped.push(...names); } },
      owner: 'o', device: 'a1b2c3d4e5f6', state: u.state, save() {}, home, now: () => clock, log: () => {},
      limits: { fileBytes: 1e9, threadBytes: 1e9, totalBytes: 6, files: 60, days: 7 },
    });
    clock += 6 * MIN;
    refusing.manifest('w-new', snap('w-new', 'new.png', T), { dir: docs, updatedAt: T, base: '1' });
    await refusing.kick();
    expect(u.dropped).toEqual([]);
    expect(Object.keys(u.state.uploaded)).toHaveLength(1);
  });

  it('says once that the space is full, not on every pass', async () => {
    put('big-new.png', 8); put('later.png', 4);
    const u = uploader({ totalBytes: 10 });
    u.list('w-new', 'big-new.png', T);
    await u.up.kick();
    for (let i = 0; i < 3; i++) {
      u.tick(6 * MIN);
      u.list('w-same-age', `later.png ${i}`, T);
      await u.up.kick();
    }
    expect(u.lines.filter((l) => /full/.test(l))).toHaveLength(1);
  });
});

// THE ROOM ITSELF. 900 MiB was sized for Supabase's free plan (1 GB); the
// account is on Pro, 100 GB shared across the organization's projects
// (supabase.com/pricing, read 2026-10-22). Codex's review suggested 10 GB a
// Mac: enough for a week of this Mac's work many times over (943.7 MB), and a
// tenth of the plan, so other projects and a second Mac keep their room.
describe('how much room a Mac takes', () => {
  it('is 10 GB, well inside the plan the account is on', () => {
    expect(UPLOAD_LIMITS.totalBytes).toBe(10 * 1024 ** 3);
    expect(UPLOAD_LIMITS.totalBytes).toBeLessThan(100e9 / 5);
    expect(UPLOAD_LIMITS.fileBytes).toBe(25 * 1024 * 1024);
  });
});
