// FILES SAYS WHAT EACH FILE TAKES, AND MOVES OLD ONES TO THE TRASH.
//
// A founder ran out of disk (w-439393243c) and had to find agents' films in
// the Mac's own Storage settings: Files said nothing about size, and had no
// way to delete. Now each file carries its newest version's size, what all its
// versions take, and what Move to the Trash would move; moving sends every
// copy, the version line's kept one too, to the computer's Trash. Measured on
// appFilesPlace over a real store, with a Trash that is a folder.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';

async function aMac({ repo = false, refuse = false } = {}) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sizes-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  const dir = path.join(accountRoot, 'app');
  const repoPath = path.join(storeRoot, 'code', 'app');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(repoPath, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'app', name: 'App', ...(repo ? { repoPath } : {}) }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const trash = path.join(storeRoot, 'Trash');
  fs.mkdirSync(trash);
  const binned: string[] = [];
  const place = appFilesPlace({
    store, accountRoot, storeRoot,
    trashItem: async (p) => { if (refuse) throw new Error('no Trash here'); binned.push(p); fs.renameSync(p, path.join(trash, `${binned.length}-${path.basename(p)}`)); },
  });
  const put = (rel: string, bytes: string, at = dir) => { const f = path.join(at, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); return f; };
  const thread = async (title: string, ...notes: string[]) => {
    const t = store.composeItem('app', { title, body: 'x' });
    for (const note of notes) await disk.updateWorkItem(dir, t.id, { note }, { source: 'agent' });
    return t;
  };
  return { place, put, thread, dir, repoPath, trash, binned };
}
const named = (list: { files: Array<{ name: string }> }, name: string) => list.files.find((f) => f.name === name) as unknown as Record<string, unknown> & { key: string; versions: number };

describe('the size of a file', () => {
  it('is its newest version\'s, and all its versions together are what it takes', async () => {
    const m = await aMac();
    m.put('designs/film.mp4', 'x'.repeat(100));
    await m.thread('Film', '[film.mp4](designs/film.mp4)');
    await m.place.list();
    m.put('designs/film.mp4', 'y'.repeat(250));
    const film = named(await m.place.list(), 'film.mp4');
    expect(film.versions).toBe(2);
    expect(film).toMatchObject({ bytes: 250, onMac: 350, older: 100, movable: 350 });
  });

  it('a file in a code folder is counted but is never Files\' to move', async () => {
    const m = await aMac({ repo: true });
    m.put('shots/a.png', 'p'.repeat(40), m.repoPath);
    await m.thread('Shot', `[a.png](${path.join(m.repoPath, 'shots/a.png')})`);
    const shot = named(await m.place.list(), 'a.png');
    expect(shot).toMatchObject({ bytes: 40, onMac: 40, movable: 0 });
    expect((await m.place.trash({ keys: [shot.key] }))).toMatchObject({ ok: true, moved: 0 });
    expect(fs.existsSync(path.join(m.repoPath, 'shots/a.png'))).toBe(true);
  });
});

describe('Move older versions to the Trash', () => {
  it('moves the old bytes and leaves the newest exactly where and as it was', async () => {
    const m = await aMac();
    const at = m.put('designs/film.mp4', 'first cut');
    await m.thread('Film', '[film.mp4](designs/film.mp4)');
    await m.place.list();
    m.put('designs/film.mp4', 'final cut');
    const film = named(await m.place.list(), 'film.mp4');
    const out = await m.place.trash({ keys: [film.key], older: true });
    expect(out).toMatchObject({ ok: true, moved: 1, bytes: 'first cut'.length });
    expect(fs.readFileSync(at, 'utf8')).toBe('final cut');
    expect(m.binned.every((p) => p !== at)).toBe(true);
    const after = named(await m.place.list(), 'film.mp4');
    expect(after).toMatchObject({ versions: 1, onMac: 'final cut'.length, older: 0 });
  });

  it('moves nothing from a file with one version', async () => {
    const m = await aMac();
    m.put('designs/one.png', 'only');
    await m.thread('One', '[one.png](designs/one.png)');
    const one = named(await m.place.list(), 'one.png');
    expect(await m.place.trash({ keys: [one.key], older: true })).toMatchObject({ ok: true, moved: 0 });
    expect(fs.existsSync(path.join(m.dir, 'designs/one.png'))).toBe(true);
  });
});

describe('Move to the Trash', () => {
  it('moves every version, the file leaves Files, and put back from the Trash it is there again', async () => {
    const m = await aMac();
    const at = m.put('designs/hero.png', 'hero');
    await m.thread('Hero', '[hero.png](designs/hero.png)');
    const hero = named(await m.place.list(), 'hero.png');
    expect(await m.place.trash({ keys: [hero.key] })).toMatchObject({ ok: true, moved: 1 });
    expect(fs.existsSync(at)).toBe(false);
    expect(named(await m.place.list(), 'hero.png')).toBeUndefined();
    const back = fs.readdirSync(m.trash).find((n) => n.endsWith('hero.png'))!;
    fs.renameSync(path.join(m.trash, back), at);
    expect(named(await m.place.list(), 'hero.png')).toBeDefined();
  });

  it('a file nobody moved is left alone', async () => {
    const m = await aMac();
    m.put('designs/a.png', 'a');
    m.put('designs/b.png', 'b');
    await m.thread('Two', '[a.png](designs/a.png) and [b.png](designs/b.png)');
    const a = named(await m.place.list(), 'a.png');
    await m.place.trash({ keys: [a.key] });
    expect(fs.readFileSync(path.join(m.dir, 'designs/b.png'), 'utf8')).toBe('b');
    expect(named(await m.place.list(), 'b.png')).toBeDefined();
  });

  it('a Trash that refuses says so, and the file stays', async () => {
    const m = await aMac({ refuse: true });
    m.put('designs/a.png', 'a');
    await m.thread('A', '[a.png](designs/a.png)');
    const a = named(await m.place.list(), 'a.png');
    const out = await m.place.trash({ keys: [a.key] });
    expect(out).toMatchObject({ ok: false, moved: 0 });
    expect((out as { error: string }).error).toMatch(/no Trash here/);
    expect(named(await m.place.list(), 'a.png')).toBeDefined();
  });
});
