// FILES IN THE CLOUD SCALE TO EVERY OLD FILE ON THE MAC.
//
// The keeper was built for the files threads name: on the founder's Mac on
// 2026-11-22 that was 5,844 files, while the pictures, films and sound in her
// projects' folders were about 60,000 (45 GB). Taking all of them meant three
// limits had to go. The whole record (1.16 MB at 5,844 files, so about 15 MB
// at 60,000) was rewritten after every file sent. Two versions with the same
// bytes overwrote each other's places when they left, so one came back to only
// half of them. And a thread's folder came back as one download per file, all
// at once. Measured on main/files-cloud.mts with real folders and a cloud in memory.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesKeeper, type KeptVersion } from '../main/files-cloud.mts';

const DAY = 24 * 60 * 60_000;
const sha = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-cloud-scale-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function world({ days = 7, getDelayMs = 0 }: { days?: number; getDelayMs?: number } = {}) {
  let t = Date.UTC(2026, 10, 22);
  const held = new Map<string, Buffer>();
  const puts: string[] = [];
  let fetching = 0;
  let mostAtOnce = 0;
  const storage = {
    async putFile(key: string, file: string) { puts.push(key); held.set(key, fs.readFileSync(file)); },
    async getToFile(key: string, file: string) {
      fetching += 1;
      mostAtOnce = Math.max(mostAtOnce, fetching);
      try {
        if (getDelayMs) await new Promise((r) => setTimeout(r, getDelayMs));
        const b = held.get(key);
        if (!b) return false;
        fs.writeFileSync(file, b);
        return true;
      } finally { fetching -= 1; }
    },
    async exists(key: string) { return held.has(key); },
    async del(key: string) { held.delete(key); },
  };
  const dir = path.join(root, 'keeper');
  const make = () => filesKeeper({
    dir,
    storage: async () => storage,
    account: async () => ({ bytes: 0, cap: 2 ** 40, full: false }),
    settings: () => ({ on: true, offAfterDays: days }),
    now: () => t,
  });
  const file = (rel: string, body: string, more: Partial<KeptVersion> = {}): KeptVersion => {
    const p = path.join(root, 'docs', rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
    return { hash: sha(body), size: Buffer.byteLength(body), paths: [p], kind: 'film', at: t, name: path.basename(rel), movable: true, ...more };
  };
  return { make, dir, held, puts, file, later: (ms: number) => { t += ms; }, now: () => t, mostAtOnce: () => mostAtOnce };
}

describe('the record of what is in the cloud', () => {
  it('is kept across a restart: what left the Mac is still known to be in the cloud and comes back', async () => {
    const w = world({ days: 1 });
    const film = w.file('designs/w-a/cut.mp4', 'film bytes');
    let keeper = w.make();
    await keeper.pass([film]);
    w.later(2 * DAY);
    await keeper.pass([film]);
    expect(fs.existsSync(film.paths[0])).toBe(false);

    keeper = w.make();
    expect(keeper.off(film.hash)).toMatchObject({ name: 'cut.mp4' });
    expect(keeper.isUp(film.hash)).toBe(true);
    expect(await keeper.bringBack(film.hash)).toBe(true);
    expect(fs.readFileSync(film.paths[0], 'utf8')).toBe('film bytes');
    expect(w.make().off(film.hash)).toBeNull();
  });

  it('survives a last line cut short by a crash', async () => {
    const w = world({ days: 1 });
    const film = w.file('designs/w-a/cut.mp4', 'film bytes');
    const keeper = w.make();
    await keeper.pass([film]);
    w.later(2 * DAY);
    await keeper.pass([film]);
    const log = fs.readdirSync(w.dir).find((n) => n.endsWith('.jsonl'));
    expect(log).toBeTruthy();
    fs.appendFileSync(path.join(w.dir, log!), '{"up":"abc","si');
    expect(w.make().off(film.hash)).not.toBeNull();
  });

  it('is not rewritten whole for every file sent', async () => {
    const w = world({ days: 30 });
    const files = Array.from({ length: 300 }, (_, i) => w.file(`designs/w-a/frame-${i}.png`, `frame ${i}`, { kind: 'image' }));
    const keeper = w.make();
    const whole = path.join(w.dir, 'files-cloud.json');
    let rewrites = 0;
    const was = fs.renameSync;
    const spy = (from: fs.PathLike, to: fs.PathLike) => { if (String(to) === whole) rewrites += 1; return was(from, to); };
    (fs as { renameSync: typeof fs.renameSync }).renameSync = spy;
    try { await keeper.pass(files); } finally { (fs as { renameSync: typeof fs.renameSync }).renameSync = was; }
    expect(w.puts).toHaveLength(300);
    expect(rewrites).toBeLessThanOrEqual(1);
    for (const f of files) expect(w.make().isUp(f.hash)).toBe(true);
  });
});

describe('two copies of the same bytes', () => {
  it('leave together and come back to every place either was', async () => {
    const w = world({ days: 1 });
    const a = w.file('designs/w-a/logo.png', 'same picture', { kind: 'image' });
    const b = w.file('designs/w-b/logo.png', 'same picture', { kind: 'image', loose: true });
    const keeper = w.make();
    await keeper.pass([a, b]);
    w.later(2 * DAY);
    await keeper.pass([a, b]);
    expect(fs.existsSync(a.paths[0])).toBe(false);
    expect(fs.existsSync(b.paths[0])).toBe(false);
    expect(await keeper.bringBack(a.hash)).toBe(true);
    expect(fs.readFileSync(a.paths[0], 'utf8')).toBe('same picture');
    expect(fs.readFileSync(b.paths[0], 'utf8')).toBe('same picture');
  });
});

describe('a file no thread names', () => {
  it('is sent only once it is old enough to leave, and then leaves in the same pass', async () => {
    const w = world({ days: 7 });
    const fresh = w.file('designs/w-a/new.png', 'new', { kind: 'image', loose: true, at: w.now() - 6 * DAY });
    const old = w.file('designs/w-a/old.png', 'old', { kind: 'image', loose: true, at: w.now() - 8 * DAY });
    const keeper = w.make();
    await keeper.pass([fresh, old]);
    expect(w.puts).toEqual([`files/${old.hash}`]);
    expect(fs.existsSync(old.paths[0])).toBe(false);
    expect(fs.existsSync(fresh.paths[0])).toBe(true);
  });

  it('that stays, being in an open thread\'s folder, is never sent and never leaves', async () => {
    const w = world({ days: 7 });
    const take = w.file('designs/w-open/take.mp4', 'take', { loose: true, stays: true, at: w.now() - 90 * DAY });
    const keeper = w.make();
    await keeper.pass([take]);
    w.later(30 * DAY);
    await keeper.pass([take]);
    expect(w.puts).toEqual([]);
    expect(fs.existsSync(take.paths[0])).toBe(true);
  });

  it('is never sent while the setting keeps everything on the Mac', async () => {
    const w = world({ days: 0 });
    const old = w.file('designs/w-a/old.mp4', 'old', { loose: true, at: w.now() - 400 * DAY });
    await w.make().pass([old]);
    expect(w.puts).toEqual([]);
    expect(fs.existsSync(old.paths[0])).toBe(true);
  });

  it('a sound file leaves like a film; a document never does', async () => {
    const w = world({ days: 7 });
    const sound = w.file('designs/w-a/voice.wav', 'voice', { kind: 'sound', loose: true, at: w.now() - 8 * DAY });
    const page = w.file('designs/w-a/cut.html', '<p>', { kind: 'page', loose: true, at: w.now() - 8 * DAY });
    await w.make().pass([sound, page]);
    expect(fs.existsSync(sound.paths[0])).toBe(false);
    expect(fs.existsSync(page.paths[0])).toBe(true);
    expect(w.puts).toEqual([`files/${sound.hash}`]);
  });
});

describe('a thread\'s folder coming back', () => {
  it('names every file that left from under a folder, and nothing outside it', async () => {
    const w = world({ days: 1 });
    const inside = [w.file('designs/w-a/a.png', 'a', { kind: 'image' }), w.file('designs/w-a/deep/b.png', 'b', { kind: 'image' })];
    const outside = [w.file('designs/w-ab/c.png', 'c', { kind: 'image' }), w.file('designs/w-b/d.png', 'd', { kind: 'image' })];
    const keeper = w.make();
    await keeper.pass([...inside, ...outside]);
    w.later(2 * DAY);
    await keeper.pass([...inside, ...outside]);
    expect(keeper.offUnder(path.join(root, 'docs', 'designs', 'w-a')).sort()).toEqual(inside.map((v) => v.hash).sort());
  });

  it('fetches at most four files at a time', async () => {
    const w = world({ days: 1, getDelayMs: 5 });
    const files = Array.from({ length: 20 }, (_, i) => w.file(`designs/w-a/frame-${i}.png`, `frame ${i}`, { kind: 'image' }));
    const keeper = w.make();
    await keeper.pass(files);
    w.later(2 * DAY);
    await keeper.pass(files);
    const back = await Promise.all(files.map((f) => keeper.bringBack(f.hash)));
    expect(back.every(Boolean)).toBe(true);
    expect(w.mostAtOnce()).toBeLessThanOrEqual(4);
    expect(w.mostAtOnce()).toBeGreaterThan(1);
    for (const f of files) expect(fs.existsSync(f.paths[0])).toBe(true);
  });
});
