// THE PRACTICE PROJECT DOES NOT OUTLIVE THE WALK.
//
// The founder sat with a tester, a non-technical user, through the onboarding.
// The practice project leaked out of the tutorial
//
// A. B. / "She forgot she was in practice mode." C. D.
//
// MEASURED ON HER OWN MAC before any of it was written, because three of the
// four had a visible fingerprint sitting there:
//
//   * `<accountRoot>/practice` existed, created 2026-08-28T01:40:19.223Z, with
//     `pinned.md` and `project.json` in it and NO `archived` key in the project.
//     `endPractice` had run on it at some point in five earlier walks and every
//     trace of that was gone, because `createPractice` rewrote the same file
//     from scratch at the start of the next one.
//   * its machinery, under `$ASTRAL_HOME/projects/<escaped path>/`, held 168
//     ledger lines and 29 session traces: six walks, four waiting rows and one
//     task each, going back to 08-24. Deleting only the folder she can see would
//     have left every one of them.
//
// The delete itself is pinned next door, in
// tests/the-practice-project-is-the-whole-app.test.mts, which owns the practice
// project's own contract and now owns its removal and the three refusals that
// keep it from ever being pointed at real work.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mts';
import { Supervisor } from '../main/supervisor.mts';
import { PRACTICE_ROWS, PRACTICE_SLUG } from '../shared/first-run-practice.mts';
import { practiceRemembered, rememberProject, rememberedProject, resolveProject } from '../renderer/src/compose-project.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const supervisorSrc = fs.readFileSync(path.join(root, 'main/supervisor.mts'), 'utf8');

async function freshStore() {
  const account = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-outlive-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-outlive-home-'));
  process.env.ASTRAL_HOME = home;
  const store = new Store({ accountRoot: account, products: [], personalProducts: [] });
  await store.init();
  store.watch = () => {};
  return { store, account, home };
}

/* ------------------------------------------------------------------ A ----- */

describe('A: the folder does not survive the tutorial', () => {
  it('leaves nothing of the practice project anywhere, folder or machinery', async () => {
    const { store, account, home } = await freshStore();
    store.createPractice();
    store.stagePracticeRows(PRACTICE_SLUG);
    const machinery = path.dirname(store.machineryFile(PRACTICE_SLUG, 'work-items.jsonl'));

    // Everything she would see, and everything she would not.
    expect(fs.existsSync(path.join(account, PRACTICE_SLUG, 'project.json'))).toBe(true);
    expect(fs.existsSync(path.join(account, PRACTICE_SLUG, 'pinned.md'))).toBe(true);
    expect(fs.existsSync(path.join(machinery, 'work-items.jsonl'))).toBe(true);

    expect(store.sweepPractice()).toEqual({ removed: 1 });

    expect(fs.existsSync(path.join(account, PRACTICE_SLUG))).toBe(false);
    expect(fs.existsSync(machinery)).toBe(false);
    // The account root and the app's home are both still standing. This is the
    // only code in the app that removes a directory from her store, and what it is
    // allowed to reach is exactly one path.
    expect(fs.existsSync(account)).toBe(true);
    expect(fs.existsSync(home)).toBe(true);
  });

  it('survives a walk that was quit, and a walk that ended twice', async () => {
    // Her practice project.json carried no `archived` key at all, five walks
    // after the first one ended, because the old end wrote a flag and the next
    // start rewrote the file over it. Nothing here is a flag, so there is
    // nothing for a later walk to quietly undo.
    const { store, account } = await freshStore();
    store.createPractice();
    expect(store.endPractice().removed).toBe(true);
    // A second end is a no-op that says so rather than throwing.
    expect(store.endPractice().removed).toBe(false);
    // And a walk started after an end is a fresh one, not a resurrection.
    store.createPractice();
    const project = JSON.parse(
      fs.readFileSync(path.join(account, PRACTICE_SLUG, 'project.json'), 'utf8'),
    );
    expect(project.archived).toBeUndefined();
    expect(store.listProducts().filter((p) => p.practice)).toHaveLength(1);
  });

  it('never throws, whatever it finds where the practice project should be', async () => {
    const { store, account } = await freshStore();
    // A file rather than a directory.
    fs.writeFileSync(path.join(account, PRACTICE_SLUG), 'not a project\n');
    expect(() => store.endPractice()).not.toThrow();
    expect(() => store.sweepPractice()).not.toThrow();
    expect(store.removePractice().removed).toBe(false);
    expect(fs.existsSync(path.join(account, PRACTICE_SLUG))).toBe(true);
    fs.rmSync(path.join(account, PRACTICE_SLUG));
    // And nothing there at all, which is the ordinary case on every launch.
    expect(store.sweepPractice()).toEqual({ removed: 0 });
  });
});

/* ------------------------------------------------------------------ B ----- */

// A localStorage that is a plain object, because these helpers are the only
// thing in the renderer that touches the slot and the point is to drive them.
function fakeStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  return map;
}

describe('B: the app stops sending her back into Practice', () => {
  it('forgets a remembered practice project, and keeps a real one', () => {
    const products = [
      { slug: 'orbit', name: 'Orbit' },
      { slug: PRACTICE_SLUG, name: 'Practice', practice: true },
    ];
    expect(practiceRemembered(products, PRACTICE_SLUG)).toBe(true);
    expect(practiceRemembered(products, 'orbit')).toBe(false);
    expect(practiceRemembered(products, null)).toBe(false);
    // The practice project is DELETED at the end of the walk now, so the slot
    // outlives the project it names. A leftover string is worth forgetting
    // rather than leaving for whatever takes that name later.
    expect(practiceRemembered([{ slug: 'orbit', name: 'Orbit' }], PRACTICE_SLUG)).toBe(true);
    // A slug naming nothing else is LEFT ALONE: resolveProject already falls
    // back for it, and a missing project may be a symlinked one that is back
    // tomorrow.
    expect(practiceRemembered([{ slug: 'orbit', name: 'Orbit' }], 'moved-away')).toBe(false);
  });

  it('never resolves the card to a practice project once the slot is forgotten', () => {
    const map = fakeStorage();
    const real = { slug: 'orbit', name: 'Orbit' };
    const practice = { slug: PRACTICE_SLUG, name: 'Practice', practice: true };
    rememberProject(PRACTICE_SLUG);
    expect(rememberedProject()).toBe(PRACTICE_SLUG);
    // What the compose card did before any of this: opened on Practice.
    expect(resolveProject([real, practice], [real, practice], rememberedProject())).toBe(practice);
    // And what it does after the slot is put right, whether or not the project
    // is still on disk.
    rememberProject(null);
    expect(map.has('zero.lastProduct')).toBe(false);
    expect(resolveProject([real, practice], [real, practice], rememberedProject())).toBe(real);
    expect(resolveProject([real], [real], rememberedProject())).toBe(real);
    // Archived projects never appear in the list at all (`listProducts` skips
    // them), so "never an archived one" is the same fallback.
    expect(resolveProject([real], [real], 'archived-last-week')).toBe(real);
  });

  it('puts right an install where the slot is ALREADY wrong', () => {
    // Anybody who quit a walk halfway or shut the app in the middle of one.
    expect(app).toMatch(/practiceRemembered\(snap\.products, slug, \{ practiceSlug: PRACTICE_SLUG \}\)/);
    const guard = app.slice(
      app.indexOf('const slug = rememberedProject();') - 200,
      app.indexOf('const slug = rememberedProject();') + 200,
    );
    expect(guard).toMatch(/if \(!snap\) return;/);
    // Every write to the slot goes through the one helper.
    expect(app).not.toMatch(/localStorage\.setItem\('zero\.lastProduct'/);
  });

});

/* ------------------------------------------------------------------ C ----- */

describe('C: a second practice project gets its own rows', () => {

  it('is not fixed by the folder going away, and the store proves it', async () => {
    // Worth stating out loud: A does NOT subsume C. Even with the practice
    // project deleted at the end of every walk, the store hands a second walk
    // exactly the four rows it should, and it always did. The second walk's
    // missing beats were never a store problem.
    const { store } = await freshStore();
    const one = store.createPractice();
    const first = store.stagePracticeRows(one.slug);
    expect(first.ids).toHaveLength(PRACTICE_ROWS.length);
    store.endPractice();
    const two = store.createPractice();
    const second = store.stagePracticeRows(two.slug);
    expect(second.ids).toHaveLength(PRACTICE_ROWS.length);
    expect(store.listItems().filter((i) => i.product === PRACTICE_SLUG))
      .toHaveLength(PRACTICE_ROWS.length);
    // Nothing of walk one is in walk two's inbox.
    expect(second.ids.some((id) => first.ids.includes(id))).toBe(false);
  });
});

/* ------------------------------------------------------------------ D ----- */

describe('D: an agent can never run in a practice project', () => {
  it('refuses at the one door every spawn path goes through', async () => {
    const { store, account } = await freshStore();
    store.createPractice();
    const rows = store.stagePracticeRows(PRACTICE_SLUG);
    const supervisor = new Supervisor(
      { accountRoot: account, storeRoot: account, personalProducts: [], claudeBin: '/bin/false' },
      store, root, root,
    );
    const practice = store.listProducts().find((p) => p.slug === PRACTICE_SLUG);
    const real = { slug: 'orbit', name: 'Orbit', practice: false };
    expect(supervisor.worksHere(practice)).toBe(false);
    expect(supervisor.worksHere(real)).toBe(true);
    // A product this process cannot find is not worked in either.
    expect(supervisor.worksHere(null)).toBe(false);
    expect(supervisor.worksHere(undefined)).toBe(false);

    // AND THE REFUSAL IS REAL: spawnWorker starts nothing and leaves no session
    // behind. This is the path her user reached — a task filed into Practice,
    // accepted, and then Nothing running, Queued, Working, forever.
    const before = supervisor.sessions.size;
    supervisor.spawnWorker({ id: rows.ids[0], product: PRACTICE_SLUG, title: 'x', status: 'open' });
    supervisor.spawnWorker(
      { id: rows.ids[0], product: PRACTICE_SLUG, title: 'x', status: 'open' },
      { continuation: true },
    );
    expect(supervisor.sessions.size).toBe(before);
  });

  it('says it once, so a fifth caller cannot be added without it', () => {
    // It was four `if (product.practice) continue` lines in four loops. Four
    // copies of a safety rule is four chances for a new path to miss one, and
    // the path that mattered — spawnWorker, which every other one funnels into
    // — had none of them.
    expect(supervisorSrc).not.toMatch(/if \(product\.practice\) continue;/);
    // One definition and four uses. It was five until the drive loop was
    // deleted (w-d19d6d387c, 2026-09-22), which had one of its own. Five uses
    // since a sleeping Mac hands repeating tasks to the cloud (`_repeatsAhead`).
    // Six since a pass that stops early counts the rows it held (`_noteWaitingRows`).
    expect(supervisorSrc.match(/worksHere\(/g) ?? []).toHaveLength(7);
    // And the refusal is before the plan is built, because a plan for a practice
    // project already carries a working directory that is not a repository.
    const spawn = supervisorSrc.slice(supervisorSrc.indexOf('  spawnWorker(item'));
    expect(spawn.indexOf('if (!this.worksHere(product))'))
      .toBeLessThan(spawn.indexOf('const plan = this.spawnPlan('));
  });
});
