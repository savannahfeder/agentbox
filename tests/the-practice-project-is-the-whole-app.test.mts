// THE PRACTICE PROJECT.
//
// Round two drew the practice app as a smaller Agentbox inset over the real one,
// and she rejected that page in one sentence:
//
// And on the shape, earlier the same evening:
//
// So the practice project is not drawn, it is MADE: a real project in the real
// store that the whole app is scoped to. What this file pins is the half of
// that which can go silently wrong — the flag, the emptiness of it, the fact
// that nothing may ever run in it, and that it leaves again at the end.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { machineryPath } from '../main/store/home.mts';
import { traceLines } from '../shared/trace-lines.mts';
import {
  PRACTICE_ANSWER, PRACTICE_FLAG, PRACTICE_NAME, PRACTICE_ROWS, PRACTICE_SLUG, PRACTICE_TASK,
} from '../shared/first-run-practice.mts';

async function freshStore() {
  const account = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-practice-'));
  // AND ITS OWN APP HOME, because that is where the ledger and the session
  // traces really live now (main/store/home.mts) and because these tests delete
  // things.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-practice-home-'));
  process.env.ASTRAL_HOME = home;
  const store = new Store({ accountRoot: account, products: [], personalProducts: [] });
  await store.init();
  // The watcher is real and this test does not want one running after it.
  store.watch = () => {};
  return { store, account, home };
}

describe('making it', () => {
  it('is a real project in the real store, and it says so about itself', async () => {
    const { store, account } = await freshStore();
    const { slug } = store.createPractice();
    expect(slug).toBe(PRACTICE_SLUG);
    const project = JSON.parse(fs.readFileSync(path.join(account, slug, 'project.json'), 'utf8'));
    expect(project[PRACTICE_FLAG]).toBe(true);
    expect(project.name).toBe(PRACTICE_NAME);
    // READ OFF THE FILE AND NOT OFF THE NAME. "Practice" is a name somebody
    // could reasonably give a real project of their own, and the things that
    // turn on this flag must never happen to real work.
    const listed = store.listProducts().find((p) => p.slug === slug);
    expect(listed.practice).toBe(true);
    expect(store.listProducts().every((p) => p.slug === slug || !p.practice)).toBe(true);
  });

  it('points at no folder, so nothing on the disk can be touched from inside it', async () => {
    const { store } = await freshStore();
    store.createPractice();
    expect(store.listProducts().find((p) => p.slug === PRACTICE_SLUG).repoPath).toBe(null);
  });

  it('holds only the rows the walk stages, and nothing a real project brings', async () => {
    const { store } = await freshStore();
    // The practice inbox is written by stagePracticeRows and by nothing else.
    // Making a real project alongside it files no rows at all since, and it
    // must not reach in here either way.
    store.createProduct({ name: 'Their Own Thing', repoPath: null });
    store.createPractice();
    const mine = store.listItems().filter((i) => i.product === PRACTICE_SLUG);
    expect(mine).toEqual([]);
  });

  it('is reused rather than refused when the walk is run a second time', async () => {
    // ⌘K has "Run the onboarding again" and she uses it on purpose. A second
    // walk that died on `already exists` would be a walk with no practice
    // project in it at all.
    const { store } = await freshStore();
    store.createPractice();
    expect(() => store.createPractice()).not.toThrow();
    expect(store.listProducts().filter((p) => p.practice)).toHaveLength(1);
  });
});

describe('what is already waiting in it', () => {
  it('is the four Claude Code shaped rows, and they are really in her inbox', async () => {
    const { store } = await freshStore();
    store.createPractice();
    const { ids } = store.stagePracticeRows(PRACTICE_SLUG);
    // FOUR SINCE 2026-08-24, when the snooze beat went in.
    expect(ids).toHaveLength(PRACTICE_ROWS.length);
    const rows = store.listItems().filter((i) => i.product === PRACTICE_SLUG);
    expect(rows.map((r) => r.title).sort()).toEqual(PRACTICE_ROWS.map((r) => r.title).sort());
    for (const row of rows) {
      // THE AGENT'S HALF HAS TO BE LATER THAN HERS or the row is real and
      // simply never drawn: `answeredHerAsk` in renderer/src/list-rules.ts is
      // what puts a row in an inbox. Same trick as the old three; see
      // shared/first-run-examples.mts.
      expect(row.wrote.result.source).toBe('agent');
      expect(row.wrote.result.ts).toBeGreaterThan(row.wrote.title.ts);
      // The walk's own label, which is what stops the supervisor treating any
      // of them as fresh work even before the practice rule below.
      expect(row.labels).toContain('first-run');
    }
  });

  it('reads like an agent reporting back, not like lorem', () => {
    // The three shapes are what an inbox actually holds: finished work, a call
    // made without her, and the one thing that stopped for a human. FOUR SHAPES
    // SINCE 2026-08-24: two finished, one that is real work and not for today,
    // and one an agent is stopped on. Each one is right for exactly one of E, S
    // and answering, which is what makes the three beats that clear them teach
    // three different things rather than one key three times.
    expect(PRACTICE_ROWS).toHaveLength(4);
    expect(PRACTICE_ROWS.some((r) => r.kind === 'question')).toBe(true);
    expect(PRACTICE_ROWS.filter((r) => r.waiting)).toHaveLength(1);
    expect(PRACTICE_ROWS.filter((r) => r.later)).toHaveLength(1);
    // AND NO ROW IS BOTH. Which key is right for which row is the whole lesson.
    expect(PRACTICE_ROWS.filter((r) => r.waiting && r.later)).toHaveLength(0);
    for (const row of PRACTICE_ROWS) {
      expect(row.title.length).toBeGreaterThan(0);
      expect(row.result.length).toBeGreaterThan(0);
    }
  });

  // ROUND FOUR, 2026-08-24.
  //
  // What she had opened was beat eleven, where the reading pane said "Nothing
  // has been said here yet." under the title. These rows were a title, a
  // one-line result and nothing else, so the one surface in the whole walk that
  // shows what Agentbox actually holds was blank.
  it('carries a whole conversation, not a title and a line', () => {
    for (const row of PRACTICE_ROWS) {
      // The sentence a person typed to start it. Without this the thread opens
      // on "An agent opened this" with no words under it.
      expect(row.body.length, `${row.title} has no ask`).toBeGreaterThan(20);
      // And the run itself, long enough to read as a run.
      expect(row.trace.length, `${row.title} has no run`).toBeGreaterThanOrEqual(6);
      // At least three of the lines are real tool calls, and the agent talks
      // between them: a wall of tool calls is not a conversation either.
      const tools = row.trace.filter((l) => /^\[[A-Za-z]+\] /.test(l));
      expect(tools.length, `${row.title} runs no tools`).toBeGreaterThanOrEqual(3);
      expect(row.trace.length - tools.length, `${row.title} never says anything`)
        .toBeGreaterThanOrEqual(2);
    }
  });

  // THE TRACE LINE SHAPE IS LOAD BEARING. `traceStreamLine` in
  // main/supervisor.mts writes `HH:MM:SS` then TWO spaces then either
  // `[Tool] argument` or the agent talking, and renderer/src/item-thread.ts
  // parses the two apart on exactly that. A line written any other way draws as
  // a sentence with a clock printed inside it.
  it('writes each run where a real run is written, in the shape a real one has', async () => {
    const { store, account } = await freshStore();
    store.createPractice();
    const { ids } = store.stagePracticeRows(PRACTICE_SLUG);
    expect(ids).toHaveLength(PRACTICE_ROWS.length);
    for (const [i, id] of ids.entries()) {
      const traceDir = machineryPath(path.join(account, PRACTICE_SLUG), path.join('sessions', id));
      const files = fs.readdirSync(traceDir).filter((f) => f.endsWith('.log'));
      expect(files, `no trace for ${id}`).toHaveLength(1);
      const text = fs.readFileSync(path.join(traceDir, files[0]), 'utf8');
      const lines = text.trim().split('\n');
      expect(lines).toHaveLength(PRACTICE_ROWS[i].trace.length);
      for (const line of lines) {
        expect(line, JSON.stringify(line)).toMatch(/^\d\d:\d\d:\d\d {2}\S/);
      }
    }
  });

  // AND THE CLOCK ON THOSE LINES IS UTC, BECAUSE THE READER PUTS THE DATE BACK
  // ASSUMING IT IS. A trace carries a time and no date. `momentOf`
  // (renderer/src/notes.ts) takes the session's own startedAt, swaps in the
  // UTC hours and minutes off the line, and adds a whole day if that lands
  // before the session began.
  //
  // So local time here is wrong twice. Shot on 2026-08-24 at 22:38 Pacific
  // before this was pinned: the run wrote "22:38:07", the pane printed
  // "Mon, Aug 24 3:38pm" under a result stamped 10:37pm, and the work read as
  // having happened seventeen hours AFTER the answer it produced.
  //
  // This is a round trip and not a regex, because a regex over the digits
  // passes on either time zone. It writes a trace and reads it back through
  // the renderer's own parser, which is the code that draws her screen.
  it('stamps a run so the reader puts it back at the minute it happened', async () => {
    const { store, account } = await freshStore();
    store.createPractice();
    const { ids } = store.stagePracticeRows(PRACTICE_SLUG);
    for (const id of ids) {
      const dir = machineryPath(path.join(account, PRACTICE_SLUG), path.join('sessions', id));
      const file = fs.readdirSync(dir).find((f) => f.endsWith('.log'));
      const startedAt = Number(file.replace('.log', ''));
      const read = traceLines({ startedAt, text: fs.readFileSync(path.join(dir, file), 'utf8') });
      expect(read.length, id).toBe(PRACTICE_ROWS[ids.indexOf(id)].trace.length);
      // Nine seconds apart, in order, starting on the second the run began.
      read.forEach((line, i) => {
        expect(line.at - (startedAt + i * 9_000), `line ${i} of ${id}`).toBeLessThan(1_000);
        expect(line.at - startedAt, `line ${i} of ${id} went backwards`).toBeGreaterThanOrEqual(0);
      });
      // And never a day out, which is what the rollover in `momentOf` does to
      // a local stamp read as UTC.
      expect(read[read.length - 1].at - startedAt).toBeLessThan(60 * 60_000);
    }
  });

  it('puts the ask on the row, so the thread opens on words rather than on nothing', async () => {
    const { store } = await freshStore();
    store.createPractice();
    const { ids } = store.stagePracticeRows(PRACTICE_SLUG);
    const rows = store.listItems().filter((i) => i.product === PRACTICE_SLUG);
    for (const id of ids) {
      const row = rows.find((r) => r.id === id);
      expect(row.body, `${row.title} has no ask on it`).toBeTruthy();
    }
  });

  // EXACTLY ONE OF THE THREE IS THE AGENT THAT IS STOPPED, and it is a field
  // rather than a guess from the kind, because which one it is IS the lesson of
  // beat thirteen. See renderer/src/onboarding.ts, `clear` and `unblock`.
  it('marks exactly one row as the agent that is stopped, and offers a way to answer it', () => {
    const waiting = PRACTICE_ROWS.filter((r) => r.waiting);
    expect(waiting).toHaveLength(1);
    expect(waiting[0].kind).toBe('question');
    // The offer is read off the RESULT first (`optionsFrom`, format.ts), so it
    // has to be there or answering it is not one key.
    expect(waiting[0].result).toMatch(/## Options/);
    expect(waiting[0].result).toMatch(/\(recommended\)/);
  });
});

describe('the one task they send themselves', () => {
  it('is answered out of the file rather than out of a folder', async () => {
    const { store } = await freshStore();
    store.createPractice();
    const made = store.composeItem(PRACTICE_SLUG, {
      title: PRACTICE_TASK.title, body: PRACTICE_TASK.body, kind: 'directive', labels: ['first-run'],
    });
    const out = store.finishFirstRunTask(PRACTICE_SLUG, made.id);
    expect(out.line).toBe(PRACTICE_ANSWER);
    // AND NO ONE-LINER. That line goes under a project's name in the rail and
    // is read out of the folder it points at; a practice project has neither.
    expect(out.oneLiner).toBe(null);
    const project = JSON.parse(fs.readFileSync(
      path.join(store.config.accountRoot, PRACTICE_SLUG, 'project.json'), 'utf8',
    ));
    expect(project.oneLiner).toBeUndefined();
  });

  it('still answers a real project out of its folder, which is untouched', async () => {
    const { store, account } = await freshStore();
    const folder = path.join(account, 'their-code');
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'README.md'), '# Orbit\n\nA thing.\n');
    store.createProduct({ name: 'Orbit', repoPath: folder });
    const made = store.composeItem('orbit', { title: 'x', kind: 'directive' });
    const out = store.finishFirstRunTask('orbit', made.id);
    expect(out.line).not.toBe(PRACTICE_ANSWER);
    expect(out.line).toMatch(/Orbit/);
  });
});

describe('nothing ever runs in it', () => {
  it('is a rule about the place, so a reply cannot get round it', async () => {
    // The three rows are safe by their label already. A REPLY to one is a
    // continuation, and a continuation spawns a real Claude Code session — in a
    // project with no folder behind it, on a task that was never real. So the
    // supervisor skips the whole product, which no new row can undo.
    const { store } = await freshStore();
    store.createPractice();
    store.stagePracticeRows(PRACTICE_SLUG);
    const src = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    // IT IS ONE RULE NOW, NOT FOUR COPIES OF ONE. `worksHere` is the whole of
    // it, and the place it matters is `spawnWorker`: every other path in that
    // file — the fresh-work pass, continuations, resumeItems, resumeStopped,
    // the interrupted-session recovery, a mid-flight reply, the digest and the
    // drive — funnels into it, so a fifth caller added tomorrow is refused
    // without anybody remembering to add a skip.
    expect(src).toMatch(/worksHere\(product(: [^)]*)?\) \{/);
    expect(src).toMatch(/const noWorkHere = new Set\(/);
    // And no copy of the rule left anywhere, spelled out by hand.
    expect(src).not.toMatch(/if \(product\.practice\) continue;/);
    // The refusal is inside spawnWorker and it is BEFORE the plan is built,
    // because a plan built for a practice project is already a working
    // directory pointed at a folder that does not exist.
    const spawn = src.slice(src.indexOf('  spawnWorker(item'));
    const refusal = spawn.indexOf('if (!this.worksHere(product))');
    expect(refusal).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(spawn.indexOf('const plan = this.spawnPlan('));
    // The product really is flagged, which is what that line reads.
    expect(store.listProducts().find((p) => p.slug === PRACTICE_SLUG).practice).toBe(true);
  });
});

describe('putting it away at the end', () => {
  // IT IS REMOVED, NOT ARCHIVED, AND THAT IS A REVERSAL. What stood here until
  // today was the opposite test, "never deletes anything, because an
  // onboarding does not remove folders", and the reasoning behind it was not
  // stupid: `archived` is one key in one file, and rm -rf in somebody's store
  // is a large thing for a tutorial to do.
  //
  // So what these tests now pin is the delete AND the three refusals that keep
  // it from ever being pointed at real work.
  it('removes the folder, so it leaves the rail, the inbox and the store at once', async () => {
    const { store, account } = await freshStore();
    store.createPractice();
    store.stagePracticeRows(PRACTICE_SLUG);
    expect(store.endPractice().removed).toBe(true);
    expect(fs.existsSync(path.join(account, PRACTICE_SLUG))).toBe(false);
    expect(store.listProducts().map((p) => p.slug)).not.toContain(PRACTICE_SLUG);
    expect(store.listItems().some((i) => i.product === PRACTICE_SLUG)).toBe(false);
  });

  it('takes the machinery with it, which is where the ledger actually lives', async () => {
    // The work item ledger and the session traces are not in the product folder
    // any more; they are under the app's own home (main/store/home.mts). Six
    // walks of them were sitting in the founder's when this was written: 168
    // ledger lines and 29 session traces, for a project whose folder held two
    // files. Deleting the visible half only would have left every one of them.
    const { store, home } = await freshStore();
    store.createPractice();
    store.stagePracticeRows(PRACTICE_SLUG);
    const machinery = path.dirname(store.machineryFile(PRACTICE_SLUG, 'work-items.jsonl'));
    expect(fs.existsSync(path.join(machinery, 'work-items.jsonl'))).toBe(true);
    expect(fs.readdirSync(path.join(machinery, 'sessions')).length).toBeGreaterThan(0);
    expect(store.endPractice().removed).toBe(true);
    expect(fs.existsSync(machinery)).toBe(false);
    // And nothing else under the app's home went with it.
    expect(fs.existsSync(home)).toBe(true);
  });

  it('REFUSES a real project that happens to be called practice', async () => {
    const { store, account } = await freshStore();
    // Somebody's own project, at the same slug, with no flag on it. This is the
    // test that has to hold: the flag is read off project.json at the moment of
    // the delete rather than taken on trust from a listing made earlier.
    const theirs = path.join(account, PRACTICE_SLUG);
    fs.mkdirSync(theirs);
    fs.writeFileSync(path.join(theirs, 'project.json'),
      JSON.stringify({ id: PRACTICE_SLUG, name: 'Practice' }));
    fs.writeFileSync(path.join(theirs, 'their-notes.md'), 'mine\n');
    expect(store.endPractice().removed).toBe(false);
    expect(store.removePractice().removed).toBe(false);
    expect(fs.existsSync(path.join(theirs, 'their-notes.md'))).toBe(true);
    // A folder written behind the store's back, as this one is, joins the
    // project list within a millisecond of being there (Store._productsNow).
    await new Promise((r) => { setTimeout(r, 5); });
    expect(store.listProducts().map((p) => p.slug)).toContain(PRACTICE_SLUG);
  });

  it('REFUSES a folder with no readable project.json in it at all', async () => {
    const { store, account } = await freshStore();
    const dir = path.join(account, PRACTICE_SLUG);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), 'not json {{{');
    fs.writeFileSync(path.join(dir, 'something.txt'), 'theirs\n');
    expect(store.removePractice().removed).toBe(false);
    expect(fs.existsSync(path.join(dir, 'something.txt'))).toBe(true);
  });

  it('REFUSES to follow a symlink out of the store', async () => {
    // A symlinked project is a real shape here — `listProducts` stats through
    // them on purpose for the combined-workspace pattern — so `practice` could
    // be a link pointing at somebody's actual repository. lstat, never stat.
    const { store, account } = await freshStore();
    const real = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-not-practice-'));
    fs.writeFileSync(path.join(real, 'project.json'), JSON.stringify({
      schemaVersion: 1, id: PRACTICE_SLUG, name: 'Practice', [PRACTICE_FLAG]: true,
    }));
    fs.writeFileSync(path.join(real, 'precious.txt'), 'somebody real work\n');
    fs.symlinkSync(real, path.join(account, PRACTICE_SLUG));
    expect(store.removePractice().removed).toBe(false);
    expect(store.endPractice().removed).toBe(false);
    expect(fs.existsSync(path.join(real, 'precious.txt'))).toBe(true);
    fs.rmSync(real, { recursive: true, force: true });
  });

  it('REFUSES any path but <accountRoot>/practice, however it is asked', async () => {
    const { store, account } = await freshStore();
    // A practice-flagged project under a name we did not choose. It is taken off
    // the screen the old way and its folder stays: the flag is the app's, the
    // path is not, and a directory somebody named themselves is not ours.
    const odd = path.join(account, 'practise-round');
    fs.mkdirSync(odd);
    fs.writeFileSync(path.join(odd, 'project.json'), JSON.stringify({
      schemaVersion: 1, id: 'practise-round', name: 'Practice', [PRACTICE_FLAG]: true,
    }));
    expect(store.endPractice('practise-round').removed).toBe(false);
    expect(fs.existsSync(odd)).toBe(true);
    expect(store.listProducts().map((p) => p.slug)).not.toContain('practise-round');
    // And nothing reaches the delete by naming a traversal or an absolute path.
    for (const slug of ['..', '../..', '/', 'practice/..', path.join(account, PRACTICE_SLUG)]) {
      expect(store.removePractice(slug).removed).toBe(false);
    }
    expect(fs.existsSync(account)).toBe(true);
  });

  it('sweeps one left behind by a walk somebody quit halfway', async () => {
    const { store, account } = await freshStore();
    store.createPractice();
    expect(store.sweepPractice().removed).toBe(1);
    expect(fs.existsSync(path.join(account, PRACTICE_SLUG))).toBe(false);
    expect(store.sweepPractice().removed).toBe(0);
  });

  it('sweeps at launch, so a stale folder somebody already has is gone', async () => {
    // The founder had one of these on her own Mac when this was written, dated
    // five days before, with no `archived` key in it. Nothing had ever swept it
    // because the sweep only ever ran when a walk FINISHED, and hers had not.
    const { store, account, home } = await freshStore();
    store.createPractice();
    store.stagePracticeRows(PRACTICE_SLUG);
    expect(fs.existsSync(path.join(account, PRACTICE_SLUG))).toBe(true);
    // The next launch: a brand new Store over the same account root.
    process.env.ASTRAL_HOME = home;
    const next = new Store({ accountRoot: account, products: [], personalProducts: [] });
    next.watch = () => {};
    await next.init();
    expect(fs.existsSync(path.join(account, PRACTICE_SLUG))).toBe(false);
    expect(next.listProducts().some((p) => p.practice)).toBe(false);
  });

  it('starts a second walk from nothing, rather than on top of the first', async () => {
    // REUSE IS WHAT PUT SIX WALKS IN ONE LEDGER. Measured on her store
    // 2026-08-28: 168 lines and 29 session traces, four rows and one task per
    // walk, going back to 08-24. It also un-archived the project — the old
    // `endPractice` wrote `archived: true` into project.json and `createPractice`
    // rewrote that same file from scratch — which is why her practice
    // project.json carried no `archived` key at all, five walks after the first
    // one ended.
    const { store } = await freshStore();
    store.createPractice();
    store.stagePracticeRows(PRACTICE_SLUG);
    expect(store.listItems().filter((i) => i.product === PRACTICE_SLUG))
      .toHaveLength(PRACTICE_ROWS.length);
    // A second walk, with no end to the first one: still exactly four rows.
    expect(() => store.createPractice()).not.toThrow();
    store.stagePracticeRows(PRACTICE_SLUG);
    expect(store.listProducts().filter((p) => p.practice)).toHaveLength(1);
    expect(store.listItems().filter((i) => i.product === PRACTICE_SLUG))
      .toHaveLength(PRACTICE_ROWS.length);
  });

  it('says so plainly when there was never one', async () => {
    const { store } = await freshStore();
    expect(store.endPractice()).toEqual({ removed: false, why: 'no practice project' });
  });
});

describe('the wire between the two halves', () => {
  // A LIVE CALLER ON A DEAD CHANNEL IS SILENT HERE, WHICH IS WHY THIS IS PINNED.
  // api.ts hands back null when the preload has no such function, and the walk
  // treats null as "no practice project" and carries on inside the person's own
  // project — which is the exact thing this row exists to stop. There is no
  // error, no warning and no failing test anywhere else: the walk simply
  // practises in the wrong place.
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

  it('carries the same two names all the way from the renderer to the store', () => {
    const api = read('../renderer/src/api.ts');
    const preload = read('../preload.cjs');
    const ipc = read('../main/ipc.mts');
    for (const [fn, channel, method] of [
      ['firstRunPractice', 'zero:first-run-practice', 'createPractice'],
      ['firstRunPracticeEnd', 'zero:first-run-practice-end', 'sweepPractice'],
    ]) {
      expect(api, fn).toMatch(new RegExp(`zero\\?\\.${fn}|zero\\.${fn}`));
      // The walkthrough asks for a bare one (w-fbe5e95dea), so this one takes options.
      expect(preload, fn).toMatch(new RegExp(`${fn}: \\((opts)?\\) => ipcRenderer\\.invoke\\('${channel}'`));
      expect(ipc, channel).toMatch(new RegExp(`ipcMain\\.handle\\('${channel}'`));
      expect(ipc, method).toMatch(new RegExp(`store\\.${method}\\(`));
    }
  });
});
