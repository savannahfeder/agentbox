// A PRO PLAN'S OLD FILMS LEAVE THE MAC, AND COME BACK WHEN OPENED.
//
// Agents' films and pictures filled people's disks (w-439393243c): one
// founder's Documents held 200 GB, its biggest files 600 MB films. Nothing in
// the app could take a file off the Mac and keep it. Now, on a plan that keeps
// files, every file Files lists is saved to the cloud, and a film or picture
// nobody has opened for the chosen days leaves the Mac until it is opened.
// Measured on main/files-cloud.mts with a real folder and a cloud in memory.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { filesKeeper, type KeptVersion } from '../main/files-cloud.mts';

const DAY = 24 * 60 * 60_000;
const sha = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-cloud-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

function cloud() {
  const held = new Map<string, Buffer>();
  const puts: string[] = [];
  return {
    held, puts,
    storage: {
      async putFile(key: string, file: string) { puts.push(key); held.set(key, fs.readFileSync(file)); },
      async getToFile(key: string, file: string) { const b = held.get(key); if (!b) return false; fs.writeFileSync(file, b); return true; },
      async exists(key: string) { return held.has(key); },
      async del(key: string) { held.delete(key); },
    },
  };
}

function world({ cap = 100 * 2 ** 30, on = true, days = 30 }: { cap?: number | null; on?: boolean; days?: number } = {}) {
  let t = Date.UTC(2026, 10, 10);
  const c = cloud();
  const settings = { on, offAfterDays: days };
  const account = { cap: cap as number | null };
  const keeper = filesKeeper({
    dir: path.join(root, 'store'),
    storage: async () => c.storage,
    account: async () => (account.cap == null ? null : { bytes: [...c.held.values()].reduce((s, b) => s + b.length, 0), cap: account.cap, full: false }),
    settings: () => settings,
    now: () => t,
  });
  const file = (name: string, body: string, kind: KeptVersion['kind'] = 'film', at = t): KeptVersion => {
    const p = path.join(root, 'docs', 'designs', name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
    return { hash: sha(body), size: Buffer.byteLength(body), paths: [p], kind, at, name, movable: true };
  };
  return { keeper, c, settings, account, file, later: (ms: number) => { t += ms; }, now: () => t };
}

describe('on a plan that keeps files', () => {
  it('saves every file to the cloud under its bytes\' hash, and leaves it on the Mac while it is fresh', async () => {
    const w = world();
    const film = w.file('launch.mp4', 'film bytes');
    const doc = w.file('plan.md', '# plan', 'markdown');
    await w.keeper.pass([film, doc]);
    expect(w.c.puts.sort()).toEqual([`files/${film.hash}`, `files/${doc.hash}`].sort());
    expect(fs.existsSync(film.paths[0])).toBe(true);
    expect(w.keeper.isUp(film.hash)).toBe(true);
  });

  it('takes a film off the Mac once nobody has opened it for the chosen days, and not a day before', async () => {
    const w = world({ days: 30 });
    const film = w.file('launch.mp4', 'film bytes');
    await w.keeper.pass([film]);
    w.later(30 * DAY - 60_000);
    await w.keeper.pass([film]);
    expect(fs.existsSync(film.paths[0])).toBe(true);
    w.later(2 * 60_000);
    await w.keeper.pass([film]);
    expect(fs.existsSync(film.paths[0])).toBe(false);
    expect(w.keeper.off(film.hash)).toMatchObject({ size: film.size, name: 'launch.mp4' });
  });

  it('never takes a document, a table or code off the Mac, however old', async () => {
    const w = world({ days: 7 });
    const kept = [w.file('plan.md', '# plan', 'markdown'), w.file('leads.csv', 'a,b', 'table'), w.file('app.ts', 'x', 'code')];
    await w.keeper.pass(kept);
    w.later(400 * DAY);
    await w.keeper.pass(kept);
    for (const v of kept) expect(fs.existsSync(v.paths[0])).toBe(true);
  });

  it('never takes a file that is not Files\' own to move, such as one in a code folder', async () => {
    const w = world({ days: 7 });
    const film = { ...w.file('demo.mp4', 'film'), movable: false };
    await w.keeper.pass([film]);
    w.later(60 * DAY);
    await w.keeper.pass([film]);
    expect(fs.existsSync(film.paths[0])).toBe(true);
  });

  it('an opening resets the days', async () => {
    const w = world({ days: 30 });
    const film = w.file('launch.mp4', 'film bytes');
    await w.keeper.pass([film]);
    w.later(20 * DAY);
    w.keeper.opened(film.hash);
    w.later(20 * DAY);
    await w.keeper.pass([film]);
    expect(fs.existsSync(film.paths[0])).toBe(true);
  });

  it('"never" keeps everything on the Mac, though it is still saved to the cloud', async () => {
    const w = world({ days: 0 });
    const film = w.file('launch.mp4', 'film bytes');
    await w.keeper.pass([film]);
    w.later(365 * DAY);
    await w.keeper.pass([film]);
    expect(fs.existsSync(film.paths[0])).toBe(true);
    expect(w.keeper.isUp(film.hash)).toBe(true);
  });

  it('a file whose bytes changed since it was listed is neither saved under the old hash nor taken off', async () => {
    const w = world({ days: 1 });
    const film = w.file('launch.mp4', 'first cut');
    fs.writeFileSync(film.paths[0], 'second cut');
    await w.keeper.pass([film]);
    expect(w.c.puts).toEqual([]);
    w.later(5 * DAY);
    await w.keeper.pass([film]);
    expect(fs.readFileSync(film.paths[0], 'utf8')).toBe('second cut');
  });

  it('a film the cloud lost is not taken off the Mac', async () => {
    const w = world({ days: 1 });
    const film = w.file('launch.mp4', 'film bytes');
    await w.keeper.pass([film]);
    w.c.held.clear();
    w.later(5 * DAY);
    await w.keeper.pass([film]);
    expect(fs.existsSync(film.paths[0])).toBe(true);
  });
});

describe('a film that left the Mac', () => {
  it('comes back to every place it was, byte for byte, when it is opened', async () => {
    const w = world({ days: 1 });
    const film = w.file('launch.mp4', 'film bytes');
    const kept = path.join(root, 'store', 'version-bytes', film.hash, 'launch.mp4');
    fs.mkdirSync(path.dirname(kept), { recursive: true });
    fs.copyFileSync(film.paths[0], kept);
    const both = { ...film, paths: [film.paths[0], kept] };
    await w.keeper.pass([both]);
    w.later(2 * DAY);
    await w.keeper.pass([both]);
    expect(fs.existsSync(kept)).toBe(false);
    expect(await w.keeper.bringBack(film.hash)).toBe(true);
    expect(fs.readFileSync(film.paths[0], 'utf8')).toBe('film bytes');
    expect(fs.readFileSync(kept, 'utf8')).toBe('film bytes');
    expect(w.keeper.off(film.hash)).toBeNull();
  });

  it('is not written over its place when the cloud gives back other bytes', async () => {
    const w = world({ days: 1 });
    const film = w.file('launch.mp4', 'film bytes');
    await w.keeper.pass([film]);
    w.later(2 * DAY);
    await w.keeper.pass([film]);
    w.c.held.set(`files/${film.hash}`, Buffer.from('something else'));
    expect(await w.keeper.bringBack(film.hash)).toBe(false);
    expect(fs.existsSync(film.paths[0])).toBe(false);
    expect(w.keeper.off(film.hash)).not.toBeNull();
  });
});

describe('the cap', () => {
  it('a file past the cap stays on the Mac and is not sent, and nothing is said in a pop-up', async () => {
    const w = world({ cap: 12, days: 1 });
    const small = w.file('a.png', '1234567890', 'image');
    const big = w.file('b.png', 'abcdefghijklmnop', 'image');
    await w.keeper.pass([small, big]);
    expect(w.c.puts).toEqual([`files/${small.hash}`]);
    expect(w.keeper.status().full).toBe(true);
    w.later(5 * DAY);
    await w.keeper.pass([small, big]);
    expect(fs.existsSync(big.paths[0])).toBe(true);
    expect(fs.existsSync(small.paths[0])).toBe(false);
  });
});

describe('when the plan stops keeping files', () => {
  it('everything that left comes back down first, and only then is the cloud copy deleted', async () => {
    const w = world({ days: 1 });
    const film = w.file('launch.mp4', 'film bytes');
    const pic = w.file('hero.png', 'picture', 'image');
    await w.keeper.pass([film, pic]);
    w.later(2 * DAY);
    await w.keeper.pass([film, pic]);
    expect(fs.existsSync(film.paths[0])).toBe(false);
    w.account.cap = 0;
    await w.keeper.pass([film, pic]);
    expect(fs.readFileSync(film.paths[0], 'utf8')).toBe('film bytes');
    expect(fs.readFileSync(pic.paths[0], 'utf8')).toBe('picture');
    expect(w.c.held.size).toBe(0);
    expect(w.keeper.isUp(film.hash)).toBe(false);
  });

  it('an account that cannot be read, signed out or offline, deletes nothing and sends nothing', async () => {
    const w = world({ days: 1 });
    const film = w.file('launch.mp4', 'film bytes');
    await w.keeper.pass([film]);
    w.later(2 * DAY);
    await w.keeper.pass([film]);
    w.account.cap = null;
    const other = w.file('next.mp4', 'next');
    await w.keeper.pass([film, other]);
    expect(w.c.held.size).toBe(1);
    expect(w.c.puts).toHaveLength(1);
    expect(w.keeper.off(film.hash)).not.toBeNull();
  });

  it('switched off in Settings, nothing new is sent or taken off, and what left still comes back when opened', async () => {
    const w = world({ days: 1 });
    const film = w.file('launch.mp4', 'film bytes');
    await w.keeper.pass([film]);
    w.later(2 * DAY);
    await w.keeper.pass([film]);
    w.settings.on = false;
    const pic = w.file('hero.png', 'picture', 'image');
    await w.keeper.pass([film, pic]);
    w.later(5 * DAY);
    await w.keeper.pass([film, pic]);
    expect(w.c.puts).toHaveLength(1);
    expect(fs.existsSync(pic.paths[0])).toBe(true);
    expect(await w.keeper.bringBack(film.hash)).toBe(true);
  });
});

describe('a computer with no plan for files', () => {
  it('is never asked to weigh its files: only a plan that keeps them, switched on, wants them', async () => {
    const w = world();
    expect(await w.keeper.wantsVersions()).toBe(true);
    w.settings.on = false;
    expect(await w.keeper.wantsVersions()).toBe(false);
    w.settings.on = true;
    w.account.cap = 0;
    expect(await w.keeper.wantsVersions()).toBe(false);
    w.account.cap = null;
    expect(await w.keeper.wantsVersions()).toBe(false);
  });
});

describe('what it remembers', () => {
  it('survives a restart', async () => {
    const w = world({ days: 1 });
    const film = w.file('launch.mp4', 'film bytes');
    await w.keeper.pass([film]);
    w.later(2 * DAY);
    await w.keeper.pass([film]);
    const again = filesKeeper({ dir: path.join(root, 'store'), storage: async () => w.c.storage, account: async () => null, settings: () => w.settings, now: w.now });
    expect(again.off(film.hash)).toMatchObject({ name: 'launch.mp4' });
    expect(again.isUp(film.hash)).toBe(true);
  });
});
