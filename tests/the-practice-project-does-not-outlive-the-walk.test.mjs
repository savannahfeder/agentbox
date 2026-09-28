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
// tests/the-practice-project-is-the-whole-app.test.mjs, which owns the practice
// project's own contract and now owns its removal and the three refusals that
// keep it from ever being pointed at real work.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { PRACTICE_ROWS, PRACTICE_SLUG } from '../shared/first-run-practice.mjs';
import { needsStaging, walkStageKey } from '../renderer/src/walk-staging.ts';
import { practiceRemembered, rememberProject, rememberedProject, resolveProject } from '../renderer/src/compose-project.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const supervisorSrc = fs.readFileSync(path.join(root, 'main/supervisor.mjs'), 'utf8');

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

  it('hands the slot back to her own project when the walk ends', () => {
    // The walk writes the practice slug into the slot on purpose, so the beats
    // that file into Practice do. `finishRun` is the moment that stops being
    // true, and it hands it to the project the walk made rather than clearing it.
    const fin = app.slice(app.indexOf('const finishRun'), app.indexOf('const finishRun') + 900);
    expect(fin).toMatch(/rememberProject\(runRef\.current\?\.product \?\? null\)/);
    // Every write to the slot goes through the one helper now. It was spelled
    // out by hand in five places in this file and read in two more.
    expect(app).not.toMatch(/localStorage\.setItem\('zero\.lastProduct'/);
    // Five places that used to spell the key out, plus the hand-back above and
    // the one that puts an already-wrong install right.
    expect(app.match(/rememberProject\(/g) ?? []).toHaveLength(7);
  });

  it('also puts right an install where the slot is ALREADY wrong', () => {
    // The founder's own is one. So is anybody who quit the walk halfway or shut
    // the app in the middle of one: none of those ever reaches `finishRun`.
    expect(app).toMatch(/practiceRemembered\(snap\.products, slug, \{ practiceSlug: PRACTICE_SLUG \}\)/);
    // AND ONLY WHEN NO WALK IS RUNNING. During one the slot is SUPPOSED to say
    // Practice; that is what makes beat nine's task land there.
    const guard = app.slice(
      app.indexOf('const slug = rememberedProject();') - 400,
      app.indexOf('const slug = rememberedProject();') + 200,
    );
    expect(guard).toMatch(/if \(run \|\| !snap\) return;/);
  });
});

/* ------------------------------------------------------------------ C ----- */

describe('C: a second walk gets all of its beats', () => {
  it('stages once per walk, and a SECOND walk stages again', () => {
    // THE BUG, DRIVEN. `staging` was a boolean ref, so this is the sequence the
    // founder drove from ⌘K and what it used to produce.
    let seen = null;
    const stage = (run, opened) => {
      const key = walkStageKey(run, opened);
      if (!needsStaging(seen, key)) return false;
      seen = key;
      return true;
    };

    // Walk one, arriving at beat twelve with the task still open.
    expect(stage({ step: 'answer', item: 'w-aaa111' }, true)).toBe(false);
    // She presses E and the row closes: the four waiting rows are let through.
    expect(stage({ step: 'answer', item: 'w-aaa111' }, false)).toBe(true);
    // And not a second time on a re-render of the same beat.
    expect(stage({ step: 'answer', item: 'w-aaa111' }, false)).toBe(false);
    // The walk runs on and ends.
    expect(stage({ step: 'note', item: 'w-aaa111' }, false)).toBe(false);
    expect(stage(null, false)).toBe(false);

    // ⌘K, "Run the onboarding again". Same window, same component, NEW walk,
    // new task. This returned false before the fix, and everything after beat
    // twelve — the sidebar note, snoozing, unblocking a stopped agent — never
    // happened.
    expect(stage({ step: 'answer', item: 'w-bbb222' }, false)).toBe(true);
    // Third walk too. It is not a "twice" fix.
    expect(stage({ step: 'answer', item: 'w-ccc333' }, false)).toBe(true);
  });

  it('is off on every beat but the one it is for', () => {
    for (const step of ['welcome', 'make', 'task', 'working', 'open', 'note', 'clear', 'done']) {
      expect(walkStageKey({ step, item: 'w-aaa111' }, false), step).toBe(null);
    }
    expect(walkStageKey(null, false)).toBe(null);
    // The beat is REACHED with the row open — that is how it was reached — so it
    // waits for the keypress the beat is about.
    expect(walkStageKey({ step: 'answer', item: 'w-aaa111' }, true)).toBe(null);
    // A walk with no task behind it still stages exactly once rather than never.
    expect(walkStageKey({ step: 'answer', item: null }, false)).toBe('no-task');
  });

  it('is not a boolean ref any more, in the file it actually runs in', () => {
    expect(app).toMatch(/const staging = useRef<string \| null>\(null\);/);
    expect(app).not.toMatch(/const staging = useRef\(false\)/);
    expect(app).toMatch(/needsStaging\(staging\.current, stageKey\)/);
  });

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
    // deleted (w-d19d6d387c, 2026-09-22), which had one of its own.
    expect(supervisorSrc.match(/worksHere\(/g) ?? []).toHaveLength(5);
    // And the refusal is before the plan is built, because a plan for a practice
    // project already carries a working directory that is not a repository.
    const spawn = supervisorSrc.slice(supervisorSrc.indexOf('  spawnWorker(item, {'));
    expect(spawn.indexOf('if (!this.worksHere(product))'))
      .toBeLessThan(spawn.indexOf('const plan = this.spawnPlan('));
  });
});
