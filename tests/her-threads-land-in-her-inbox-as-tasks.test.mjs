// HER THREADS ARRIVE AS TASKS.
//
// `main/agent-sessions.mjs` found them; the tests for the finding are in
// tests/the-import-finds-the-threads-she-started.test.mjs. This file is the
// other half, which is what happens on the card and after the press, and it was
// hers to decide.
//
// Three things below are the ones a later session would undo without noticing.
//
//   IT DOES NOT RESUME. She was offered resuming and picked this instead, so the
//   row says out loud that replying starts a fresh session. A later round that
//   quietly wires the transcript in would be answering a question she already
//   answered the other way.
//
// A THREAD LANDS WHERE ITS FOLDER LANDS.A conversation had in
// ~/Desktop/dev/zero belongs to the project pointing at that folder and to no
// other. It is never in the home folder section, whose whole reason for
// existing is that its agents have no folder of their own.
//
//   NOTHING ON THE CARD COUNTS ONE KIND AND SPEAKS FOR BOTH. Every tick, count
//   and button goes through `picksOf`, so "Add all four agents" can never be
//   printed over four agents and nine threads.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../main/store.mjs';
import { NAME, Name } from '../shared/product-name.mjs';
import {
  THREAD_LABEL, startedIn, threadImportRow, threadLabel, threadsNeedingRows, whenWords,
} from '../shared/agent-import.mjs';
import {
  allPicked, bringAllLine, canBring, countKinds, destinations, goLine, kindPhrase,
  picksOf, pressLine, sectionState, toggleSection, togglePicked, totalLine, willMake,
} from '../renderer/src/agent-import-card';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/**
 * Her nine, as `readSessionThreads` handed them over on 2026-08-29, trimmed to
 *  what the card and the row use. Real ones, because a fixture of invented
 *  conversations tests a screen nobody will see. */
const T = (id, title, folder, when) => ({
  id,
  source: 'terminal',
  folder,
  folderName: path.basename(folder),
  short: folder.replace('/Users/you', '~'),
  title,
  when,
  path: `/Users/you/.claude/projects/x/${id}.jsonl`,
});
// HER FOLDERS, AS STRINGS AND ONLY AS STRINGS. Every use of these below is a
// thread's `folder`, which is grouped on and printed and never opened, so the
// real paths are the honest fixture. NOTHING IN THIS FILE MAY HAND ONE OF THEM
// TO SOMETHING THAT TOUCHES THE DISK; see the store suite at the bottom, which
// did exactly that until 2026-09-04 and tried to make a folder in her home.
const ZERO = '/Users/you/Desktop/dev/zero';
const DD = '/Users/you/Desktop/dev/harbour';
// The evening she took the reading, 2026-08-28 21:00 — which is the same moment
// this line used to spell `Date.parse('2026-08-29T04:00:00Z')`, on her Mac.
//
// IT IS A LOCAL WALL TIME ON PURPOSE, AND THAT IS NOT THE SAME KIND OF PIN AS
// THE ONE IN tests/what-is-left-of-her-limit.test.mjs (2026-09-04). `whenWords`
// answers "yesterday" and "on Monday" off the CALENDAR OF THE MACHINE IT RUNS
// ON, which is right: it is her own week it is describing, and there is no zone
// to hand it that would be more true than the one she is sitting in. So a moment
// pinned as a UTC instant here is a moment whose weekday changes with the desk:
// 04:00Z is Friday evening in Los Angeles and Saturday morning in Tbilisi, which
// is why this file asserted 'on Monday' and got 'on Tuesday'. A fixture has to
// be expressed in the same clock the function under test reads, and for this
// function that clock is the local one. The rule for the other file is the
// mirror image, because `resetAt` is handed a zone and must not read the
// machine's at all.
const NOW = new Date(2026, 7, 28, 21, 0, 0).getTime();
const hers = [
  T('t1', 'this is a test', ZERO, NOW - 1 * 3600e3),
  T('t2', 'please run zero (latest version) and also give me a command to do so', ZERO, NOW - 30 * 3600e3),
  T('t3', 'tried to open zero here but it failed.', DD, NOW - 142 * 3600e3),
];
const agent = (name, folder) => ({
  name, title: name, line: `${name} does a thing`, scope: 'project',
  path: `${folder}/.claude/agents/${name}.md`,
});

describe('a thread lands in the project that owns its folder', () => {
  it('joins the section the project already has, rather than opening a second one', () => {
    const products = [{ slug: 'agentbox', name: Name, repoPath: ZERO }];
    const dests = destinations({
      found: { user: [], project: [agent('reviewer', ZERO)] },
      products,
      project: 'agentbox',
      threads: hers.filter((t) => t.folder === ZERO),
    });
    const mine = dests.filter((d) => d.folder === ZERO);
    expect(mine).toHaveLength(1);
    expect(mine[0].slug).toBe('agentbox');
    expect(mine[0].items.map((a) => a.name)).toEqual(['reviewer']);
    expect(mine[0].threads.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('makes a section for a project of hers that is not the one the card opened on', () => {
    // The agent side can only ever read the SELECTED project's folder, so before
    // this a conversation in another of her projects had nowhere to be drawn.
    const products = [
      { slug: 'agentbox', name: Name, repoPath: ZERO },
      { slug: 'agentbox', name: 'Harbour', repoPath: DD },
    ];
    const dests = destinations({
      found: { user: [], project: [] }, products, project: 'agentbox', threads: hers,
    });
    const dd = dests.find((d) => d.folder === DD);
    expect(dd.kind).toBe('project');
    expect(dd.slug).toBe('agentbox');
    expect(dd.name).toBe('Harbour');
    expect(dd.threads.map((t) => t.id)).toEqual(['t3']);
  });

  it('offers to make the project when nothing points at the folder', () => {
    const dests = destinations({
      found: { user: [], project: [] }, products: [], project: null, threads: hers,
    });
    const made = dests.find((d) => d.folder === DD);
    expect(made.kind).toBe('new');
    expect(made.slug).toBe(null);
    expect(made.name).toBe('Harbour');
    expect(willMake(dests, allPicked(dests))).toContain('Harbour');
    // And the press can go ahead, because a folder section makes its own inbox.
    expect(canBring({ read: true, picked: allPicked(dests), dests })).toBe(true);
  });

  it('never puts a thread in the home folder section', () => {
    // That section exists because its agents work everywhere and therefore need
    // somebody to choose an inbox. A conversation happened in one place.
    const dests = destinations({
      found: { user: [agent('everywhere', '/Users/you')], project: [] },
      products: [{ slug: 'agentbox', name: Name, repoPath: ZERO }],
      project: 'agentbox',
      threads: hers,
    });
    const home = dests.find((d) => d.kind === 'everywhere');
    expect(home.threads).toEqual([]);
    expect(picksOf(home)).toHaveLength(1);
  });

  it('does not name two new projects the same when two folders share a basename', () => {
    const a = '/Users/you/one/api';
    const b = '/Users/you/two/api';
    const dests = destinations({
      found: null,
      products: [],
      project: null,
      threads: [T('x', 'first', a, NOW), T('y', 'second', b, NOW - 1000)],
    });
    expect(dests.map((d) => d.name)).toEqual(['Api', 'Api 2']);
  });
});

describe('the card counts both kinds or it counts neither', () => {
  const products = [{ slug: 'agentbox', name: Name, repoPath: ZERO }];
  const dests = () => destinations({
    found: { user: [], project: [agent('reviewer', ZERO), agent('planner', ZERO)] },
    products, project: 'agentbox', threads: hers,
  });

  it('says both numbers on the first door rather than one number for both', () => {
    const d = dests();
    expect(countKinds(d)).toEqual({ agents: 2, threads: 3 });
    expect(bringAllLine(d)).toBe('Add all two agents and three threads');
    expect(totalLine(d)).toBe('Two agents and three threads in two folders.');
  });

  it('falls back to the one kind that is there, in the words it already used', () => {
    expect(kindPhrase({ agents: 4, threads: 0 })).toBe('four agents');
    expect(kindPhrase({ agents: 0, threads: 1 })).toBe('one thread');
    expect(kindPhrase({ agents: 1, threads: 1 })).toBe('one agent and one thread');
    // The card that only ever held agent files reads exactly as it did.
    const only = destinations({
      found: { user: [], project: [agent('reviewer', ZERO)] }, products, project: 'agentbox',
    });
    expect(bringAllLine(only)).toBe('Add the one agent');
    expect(totalLine(only)).toBe('One agent in one folder.');
  });

  it('ticks a thread the same way it ticks an agent, and by path', () => {
    const d = dests();
    const t1 = hers[0].path;
    expect(togglePicked(d, [], t1)).toEqual([t1]);
    expect(togglePicked(d, [t1], t1)).toEqual([]);
    expect(goLine(d, [t1])).toBe('Add one thread');
  });

  it('has a whole-section tick that takes the agents and the threads together', () => {
    const d = dests();
    const zero = d.find((x) => x.folder === ZERO);
    const on = toggleSection(d, [], zero.key);
    expect(on).toHaveLength(4);
    expect(sectionState(zero, on)).toBe('all');
    // Untick one thread and the section stops claiming everything is on, which
    // is the whole reason the half state exists.
    const fewer = togglePicked(d, on, hers[0].path);
    expect(sectionState(zero, fewer)).toBe('some');
    expect(goLine(d, fewer)).toBe('Add two agents and one thread');
  });

  it('counts a thread-only section as an inbox the press touches', () => {
    const d = destinations({
      found: { user: [], project: [] },
      products: [{ slug: 'agentbox', name: Name, repoPath: ZERO }],
      project: 'agentbox',
      threads: hers,
    });
    expect(pressLine(d, allPicked(d))).toContain('two projects');
    expect(pressLine(d, allPicked(d))).toContain('Harbour becomes a new project.');
  });
});

describe('what the imported row says to her', () => {
  const row = threadImportRow(hers[0], { projectName: NAME, now: NOW });

  it('is called what she called it, and asks one thing in bold on line one', () => {
    expect(row.title).toBe('this is a test');
    const first = row.body.split('\n')[0];
    expect(first).toBe('**Say what you want done next in this thread.**');
    // The inbox row clips its first sentence at 112 characters (SUMMARY_BUDGET,
    // renderer/src/list-rules.ts), so the whole point has to land inside it.
    expect(first.length).toBeLessThan(112);
  });

  it('says where and when she had it, in the words a person uses about this week', () => {
    expect(row.body).toContain('You started this in a terminal today in ~/Desktop/dev/zero.');
    expect(whenWords(NOW - 26 * 3600e3, NOW)).toBe('yesterday');
    expect(whenWords(NOW - 4 * 24 * 3600e3, NOW)).toBe('on Monday');
    // Past the window the finder covers it says nothing rather than guessing.
    expect(whenWords(NOW - 40 * 24 * 3600e3, NOW)).toBe('');
    expect(whenWords(null, NOW)).toBe('');
    expect(startedIn('desktop')).toBe('in the Claude Code desktop app');
  });

  it('says it does not carry the conversation on, because she chose that', () => {
    expect(row.body).toContain('replying starts a fresh session rather than carrying the old one on');
    expect(row.body).toContain(`${Name} has not read the conversation`);
    expect(row.body).toContain(`${NAME} runs it here in ${NAME}`);
  });

  it('waits for her rather than starting on its own', () => {
    // A question is what the supervisor never spawns fresh work on (`isFresh`,
    // main/supervisor.mjs), which is what makes the row an ask and not a job.
    expect(row.kind).toBe('question');
    expect(row.labels).toContain(THREAD_LABEL);
    expect(row.labels).toContain(threadLabel('t1'));
  });

  it('writes no em dash anywhere she reads', () => {
    for (const t of [row.title, row.body]) expect(t).not.toContain('—');
  });
});

describe('pressing twice files nothing twice', () => {
  it('drops the threads that already have a row, by id', () => {
    const existing = [{ labels: ['thread-import', 'thread:t1'] }];
    expect(threadsNeedingRows(hers, existing).map((t) => t.id)).toEqual(['t2', 't3']);
    expect(threadsNeedingRows(hers, []).map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    // The same thread twice in one press is one row.
    expect(threadsNeedingRows([hers[0], hers[0]], [])).toHaveLength(1);
    // A thread with no name was never spoken to and has nothing to call a row.
    expect(threadsNeedingRows([{ id: 'z', title: '' }], [])).toEqual([]);
  });
});

describe('the store files them, and the second press does not move it', () => {
  // A STORE AND A FOLDER FOR IT TO POINT AT, BOTH UNDER `mkdtemp` (2026-09-04).
  //
  // `createProduct` makes the repo folder before it writes the project, on
  // purpose, so a repoPath in a test is a real mkdir. This suite passed `ZERO`
  // — `/Users/you/Desktop/dev/zero` — and that is a path in a person's home
  // folder that the machine running the tests is not sitting in. On any other
  // Mac it is `EACCES: permission denied, mkdir '/Users/you/Desktop/dev/zero'`,
  // which is how it was found; on HERS it is worse, because the folder is
  // already there, mkdir is a silent no-op and the suite goes green while
  // having reached into her real checkout. A green test doing something nobody
  // asked for is the failure that has no symptom.
  //
  // Nothing this suite proves is about the repo path: `importThreadRows` reads
  // the product's dir and the threads it is handed, and the folder each thread
  // was HAD in travels on the thread (`hers`), never on the product. So the
  // product points at a folder of its own that this test made and owns.
  async function store() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-threads-'));
    const accountRoot = path.join(root, 'accounts', 'test-account');
    fs.mkdirSync(accountRoot, { recursive: true });
    const repoPath = path.join(root, 'repo');
    const s = await new Store({
      storeRoot: root, accountId: 'test-account', accountRoot, products: [],
    }).init();
    return { s, repoPath };
  }

  it('writes one work item per thread, newest first, and none the second time', async () => {
    const { s, repoPath } = await store();
    const { slug } = s.createProduct({ name: Name, repoPath });
    // The one that matters, stated rather than assumed: her checkout was not
    // touched, and the folder that was made is the one this test brought.
    expect(fs.existsSync(repoPath)).toBe(true);
    expect(repoPath.startsWith(os.tmpdir())).toBe(true);

    const first = s.importThreadRows(slug, hers, { now: NOW });
    expect(first.added).toBe(3);
    expect(first.already).toBe(0);

    const items = s.listItems().filter((i) => i.product === slug && (i.labels ?? []).includes(THREAD_LABEL));
    expect(items.map((i) => i.title).sort()).toEqual([
      'please run zero (latest version) and also give me a command to do so',
      'this is a test',
      'tried to open zero here but it failed.',
    ]);
    const test = items.find((i) => i.title === 'this is a test');
    expect(test.body).toContain('**Say what you want done next in this thread.**');
    expect(test.kind).toBe('question');
    expect(test.labels).toContain('thread:t1');
    // The newest thread on the card is the newest row in the inbox.
    const byId = Object.fromEntries(items.map((i) => [i.labels.find((l) => l.startsWith('thread:')), i.createdAt]));
    expect(byId['thread:t1']).toBeGreaterThan(byId['thread:t2']);
    expect(byId['thread:t2']).toBeGreaterThan(byId['thread:t3']);

    const second = s.importThreadRows(slug, hers, { now: NOW + 60000 });
    expect(second.added).toBe(0);
    expect(second.already).toBe(3);
    expect(s.listItems().filter((i) => i.product === slug && (i.labels ?? []).includes(THREAD_LABEL))).toHaveLength(3);
  });
});

describe('the wiring the card needs is really there', () => {
  const card = read('renderer/src/components/ImportAgents.tsx');
  const api = read('renderer/src/api.ts');
  const ipc = read('main/ipc.mjs');
  const preload = read('preload.cjs');
  const logic = read('renderer/src/agent-import-card.ts');

  it('reads the threads, draws them, and files them on the same press', () => {
    expect(card).toContain('await api.agentThreads()');
    // One ticked list since w-db6f5e331e: threads are lines among the rest.
    expect(logic).toContain('for (const t of d.threads ?? [])');
    expect(card).toContain('{lines.map(lineRow)}');
    expect(card).toContain('api.importThreads({ product: slug, threads: load.ids })');
    expect(api).toContain("zero.agentThreads()");
    expect(api).toContain("zero.importThreads(p)");
    expect(preload).toContain("ipcRenderer.invoke('zero:agent-threads')");
    expect(preload).toContain("ipcRenderer.invoke('zero:import-threads'");
    expect(ipc).toContain("ipcMain.handle('zero:agent-threads'");
    expect(ipc).toContain("ipcMain.handle('zero:import-threads'");
    expect(ipc).toContain('store.importThreadRows(product, chosen)');
  });

  it('never counts a section by its agents alone', () => {
    // `picksOf` is the one reader, so a later change cannot make the button and
    // the tick disagree about what is on the card.
    const paths = logic.match(/\.items\.map\(\(a\) => a\.path\)/g) ?? [];
    expect(paths).toHaveLength(1);
    expect(logic.slice(logic.indexOf('export function picksOf'))).toContain('.items.map((a) => a.path)');
    expect(logic).not.toMatch(/d\.items\.some\(/);
    // The one count on the card now is the button's, and it counts every
    // ticked line, threads and agent files alike (w-db6f5e331e).
    expect(card).toContain('{LIST.add(picked.length)}');
  });

  it('takes the thread objects off main rather than off the screen', () => {
    // The renderer sends ids. A row that names a conversation should name one
    // the main process read, not one a card has been holding since this morning.
    expect(ipc).toContain('const chosen = lastThreads.filter((t) => want.has(String(t?.id ?? \'\')));');
    expect(card).not.toMatch(/importThreads\(\{ product: slug, threads: \[\{/);
  });
});
