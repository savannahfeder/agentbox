// FILES SAYS WHAT EACH FILE TAKES, AND MOVES OLD ONES TO THE TRASH.
//
// A founder ran out of disk (w-439393243c) and had to find agents' films in
// the Mac's own Storage settings: Files said nothing about size, and had no
// way to delete. Now each file carries its newest version's size, what all its
// versions take, and what Move to the Trash would move; moving sends every
// copy, the version line's kept one too, to the computer's Trash. Measured on
// appFilesPlace over a real store, with a Trash that is a folder.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mts';

async function aMac({ repo = false, refuse = false, says = false } = {}) {
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
    // `says`: a Trash that answers where the file went, as Linux's does; Electron's does not.
    trashItem: async (p) => {
      if (refuse) throw new Error('no Trash here');
      binned.push(p);
      const to = path.join(trash, `${binned.length}-${path.basename(p)}`);
      fs.renameSync(p, to);
      return says ? to : undefined;
    },
  });
  const put = (rel: string, bytes: string, at = dir) => { const f = path.join(at, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); return f; };
  const thread = async (title: string, ...notes: string[]) => {
    const t = store.composeItem('app', { title, body: 'x' });
    for (const note of notes) await disk.updateWorkItem(dir, t.id, { note }, { source: 'agent' });
    return t;
  };
  return { place, put, thread, dir, repoPath, trash, binned, storeRoot };
}
// APFS makes a clone that takes no space; ext4 cannot, and there only a Trash that says where it put the file can be undone.
const clones = (() => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-'));
  try {
    fs.writeFileSync(path.join(d, 'a'), 'a');
    if (process.platform === 'darwin') execFileSync('/bin/cp', ['-c', path.join(d, 'a'), path.join(d, 'b')], { stdio: 'ignore' });
    else fs.copyFileSync(path.join(d, 'a'), path.join(d, 'b'), fs.constants.COPYFILE_FICLONE_FORCE);
    return true;
  } catch { return false; } finally { fs.rmSync(d, { recursive: true, force: true }); }
})();
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

  // Finder leaves a 6,148-byte .DS_Store in a folder it trashes from. Two
  // testers' pictures came back as "Not on this computer yet · 6 KB", that
  // .DS_Store read as the kept copy, and could never be moved (power test, 2026-11-13).
  it('a .DS_Store Finder leaves where the kept copy was is not the file come back', async () => {
    const m = await aMac();
    m.put('designs/film.mp4', 'first cut');
    await m.thread('Film', '[film.mp4](designs/film.mp4)');
    await m.place.list();
    m.put('designs/film.mp4', 'final cut');
    const film = named(await m.place.list(), 'film.mp4');
    const kept = execFileSync('find', [m.storeRoot, '-type', 'd', '-name', 'version-bytes'], { encoding: 'utf8' }).trim();
    expect(kept).not.toBe('');
    await m.place.trash({ keys: [film.key] });
    for (const d of fs.readdirSync(kept)) fs.writeFileSync(path.join(kept, d, '.DS_Store'), 'd'.repeat(6148));
    m.put('.DS_Store', 'd'.repeat(6148), path.join(m.dir, 'designs'));
    expect(named(await m.place.list(), 'film.mp4')).toBeUndefined();
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

  // A tester moved a picture to the Trash, pressed Z, and nothing came back (power test, 2026-11-13).
  for (const says of [true, false]) {
    it.runIf(says || clones)(`Z puts every version back where it was${says ? ', from a Trash that says where it put them' : ', from a clone made first'}`, async () => {
      const m = await aMac({ says });
      const at = m.put('designs/film.mp4', 'first cut');
      await m.thread('Film', '[film.mp4](designs/film.mp4)');
      await m.place.list();
      m.put('designs/film.mp4', 'final cut');
      const film = named(await m.place.list(), 'film.mp4');
      const out = await m.place.trash({ keys: [film.key] }) as { undo?: string };
      expect(out.undo).toBeTruthy();
      expect(fs.existsSync(at)).toBe(false);
      expect(await m.place.untrash(out.undo!)).toMatchObject({ ok: true });
      expect(fs.readFileSync(at, 'utf8')).toBe('final cut');
      // From a clone, the Trash keeps its copies; emptying it later leaves what came back alone.
      if (says) expect(fs.readdirSync(m.trash)).toEqual([]);
      expect(named(await m.place.list(), 'film.mp4')).toMatchObject({ versions: 2 });
      // Nothing is held once it is back: a clone left behind would keep the space after the Trash is emptied.
      const held = execFileSync('find', [m.storeRoot, '-path', '*undo/*', '-type', 'f'], { encoding: 'utf8' }).trim();
      expect(held).toBe('');
    });
  }

  it('Z never writes over a file made at the same place since', async () => {
    const m = await aMac({ says: true });
    const at = m.put('designs/hero.png', 'old hero');
    await m.thread('Hero', '[hero.png](designs/hero.png)');
    const hero = named(await m.place.list(), 'hero.png');
    const out = await m.place.trash({ keys: [hero.key] }) as { undo?: string };
    m.put('designs/hero.png', 'new hero');
    expect(await m.place.untrash(out.undo!)).toMatchObject({ ok: true });
    expect(fs.readFileSync(at, 'utf8')).toBe('new hero');
    expect(fs.readdirSync(m.trash).some((n) => n.endsWith('-hero.png'))).toBe(true);
  });

  it('a Z after the files left for good says where they are', async () => {
    const m = await aMac({ says: true });
    m.put('designs/hero.png', 'hero');
    await m.thread('Hero', '[hero.png](designs/hero.png)');
    const hero = named(await m.place.list(), 'hero.png');
    await m.place.trash({ keys: [hero.key] });
    const out = await m.place.untrash('gone-long-ago');
    expect(out).toMatchObject({ ok: false });
    expect((out as { error: string }).error).toMatch(/Trash/);
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
