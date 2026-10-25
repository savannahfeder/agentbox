// WHEN MAIN'S TESTS GO RED ON GITHUB, ONE TASK SAYS WHICH TESTS AND WHICH COMMIT.
//
// Main was red on GitHub from 2026-10-09 to 2026-10-13 and nobody noticed. The
// `tests` run takes about five minutes and finishes after the agent that
// shipped has already ended, and `scripts/ship.mjs` only prints "check the
// run", so the red cross had no reader at all. main/main-went-red.mjs watches
// the run for the commit the app just shipped and files ONE task when main
// turns red.
//
// What must NOT happen is pinned as hard as what must:
//
//   1. No second task while main stays red: one breakage is one row, and the
//      green again lands on that same row as a note.
//   2. A `cancelled` run says nothing (a newer push cancelled the older one)
//      and nor does `startup_failure` (a GitHub account problem, which every
//      run then carries; see the head of .github/workflows/tests.yml).
//   3. A machine without `gh`, or without access to the repository, does
//      nothing at all and says nothing.
//   4. A line vitest QUOTED is never read as a failing test. The ship queue
//      learned that one three times over (w-560647d4db): a diff line and a
//      code frame both carry the file's own text, and plenty of this repo's
//      test files have "failed" inside the name.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { CONTEXT_WORDS, summaryOf, wordsIn } from '../shared/thread-cards.mjs';
import {
  GIVE_UP_MS, MainTests, failedTestsIn, machineOf, runFor, verdict,
} from '../main/main-went-red.mjs';

let root; let userDir; let dir;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'main-red-'));
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-red-user-'));
  dir = path.join(root, 'myproduct');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'myproduct', name: 'My Product' }));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(userDir, { recursive: true, force: true });
});

const storeFor = () => new Store({
  accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody',
}).init();

const product = () => ({ slug: 'myproduct', repoPath: root });

// The shapes GitHub really answers with, measured against
// savannahfeder/agentbox run 38446033487 on 2026-10-13.
const RED = {
  databaseId: 38446033487,
  headSha: 'b1ee16f2d2a4ebc65bc2cd432916b017dd512dee',
  status: 'completed',
  conclusion: 'failure',
  displayTitle: 'Even dots, a corner that survives a new monitor, and its own name',
  url: 'https://github.com/savannahfeder/agentbox/actions/runs/38446033487',
};
const GREEN = {
  ...RED, databaseId: 38451798073, headSha: '053ec65fad44c32ea48b34689ba3d1aec663500c', conclusion: 'success', displayTitle: 'Resize from any corner',
};
const JOBS = {
  jobs: [
    { id: 115464554216, name: 'vitest', conclusion: 'failure', labels: ['macos-latest'] },
    { id: 115464554410, name: 'vitest-linux', conclusion: 'failure', labels: ['ubuntu-latest'] },
  ],
};
const stamp = (line) => `2026-10-13T18:26:16.0297600Z ${line}`;
const logFor = (...names) => [
  stamp('npm ci'),
  stamp('\u001b[32m✓\u001b[39m tests/a-failed-hook-is-visible-while-the-agent-continues.test.mjs 51ms'),
  // A failing text assertion prints the file's own text as a diff, and a code
  // frame beside it. Both carry whatever the source says.
  stamp('+               FAIL  tests/a-line-vitest-quoted.test.mjs'),
  stamp('34|   FAIL  tests/a-code-frame.test.mjs'),
  ...names.map((n) => stamp(`\u001b[31m\u001b[1m\u001b[7m FAIL \u001b[27m\u001b[22m\u001b[39m ${n}\u001b[2m > \u001b[22ma suite\u001b[2m > \u001b[22mand a case`)),
  stamp(`\u001b[2m Test Files \u001b[22m \u001b[1m\u001b[31m${names.length} failed\u001b[39m\u001b[22m`),
].join('\n');

/** A gh that answers those shapes, and counts what it was asked. */
function fakeGh({ runs = [RED], jobs = JOBS, logs = {}, fails = false } = {}) {
  const asked = [];
  const gh = async (args) => {
    asked.push(args.join(' '));
    if (fails) return { code: 1, out: 'gh: command not found' };
    if (args[0] === 'run') return { code: 0, out: JSON.stringify(runs) };
    if (/\/jobs$/.test(args[1] ?? '')) return { code: 0, out: JSON.stringify(jobs) };
    const id = (args[1] ?? '').match(/jobs\/(\d+)\/logs/)?.[1];
    return { code: 0, out: logs[id] ?? '' };
  };
  gh.asked = asked;
  return gh;
}

function watcher(store, gh, { clock = { t: 0 } } = {}) {
  return new MainTests({
    store,
    userDir,
    gh,
    now: () => clock.t,
    wait: async (ms) => { clock.t += ms; },
    log: { info() {}, warn() {} },
  });
}

const rows = (store) => store.listItems().filter((i) => i.product === 'myproduct');

describe('which run the app is waiting for', () => {
  it('is the run for the commit it just shipped, by its short sha', () => {
    expect(runFor([GREEN, RED], 'b1ee16f')?.databaseId).toBe(RED.databaseId);
    expect(runFor([GREEN, RED], RED.headSha)?.databaseId).toBe(RED.databaseId);
  });

  it('is nothing at all until GitHub has made one', () => {
    expect(runFor([GREEN], 'b1ee16f')).toBeNull();
    expect(runFor([], 'b1ee16f')).toBeNull();
  });

  it('is still waiting while the run is going, and passing or failing once it ends', () => {
    expect(verdict(null)).toBe('waiting');
    expect(verdict({ status: 'in_progress', conclusion: '' })).toBe('waiting');
    expect(verdict({ status: 'queued', conclusion: null })).toBe('waiting');
    expect(verdict(GREEN)).toBe('passing');
    expect(verdict(RED)).toBe('failing');
    expect(verdict({ status: 'completed', conclusion: 'timed_out' })).toBe('failing');
  });

  it('says nothing about a run that was cancelled or that never started', () => {
    expect(verdict({ status: 'completed', conclusion: 'cancelled' })).toBe('ignore');
    expect(verdict({ status: 'completed', conclusion: 'startup_failure' })).toBe('ignore');
    expect(verdict({ status: 'completed', conclusion: 'skipped' })).toBe('ignore');
  });
});

describe('which tests failed, out of the job log', () => {
  it('names every FAIL the runner printed, once each', () => {
    const log = logFor('tests/a-phone-scans-a-code-and-reaches-the-inbox.test.mjs', 'tests/the-renderer-typechecks-clean.test.mjs', 'tests/the-renderer-typechecks-clean.test.mjs');
    expect(failedTestsIn(log)).toEqual([
      'tests/a-phone-scans-a-code-and-reaches-the-inbox.test.mjs',
      'tests/the-renderer-typechecks-clean.test.mjs',
    ]);
  });

  it('never reads a line vitest quoted, or a file it ticked green', () => {
    expect(failedTestsIn(logFor())).toEqual([]);
  });

  it('is empty when a job died before the runner ran', () => {
    expect(failedTestsIn(stamp('npm ci exited with 1'))).toEqual([]);
  });

  it('calls each job by the machine it ran on', () => {
    expect(machineOf(JOBS.jobs[0])).toBe('macOS');
    expect(machineOf(JOBS.jobs[1])).toBe('Linux');
    expect(machineOf({ name: 'something-else', labels: [] })).toBe('something-else');
  });
});

describe('the task it files', () => {
  it('names the failing tests, the machine each failed on, and the commit', async () => {
    const store = await storeFor();
    const logs = {
      115464554216: logFor('tests/the-renderer-typechecks-clean.test.mjs'),
      115464554410: logFor('tests/a-phone-scans-a-code-and-reaches-the-inbox.test.mjs', 'tests/the-renderer-typechecks-clean.test.mjs'),
    };
    await watcher(store, fakeGh({ logs })).watch({ product: product(), sha: 'b1ee16f' });

    expect(rows(store)).toHaveLength(1);
    const [row] = rows(store);
    expect(row.title).toMatch(/red on GitHub/);
    expect(row.body).toContain('Linux');
    expect(row.body).toContain('tests/a-phone-scans-a-code-and-reaches-the-inbox.test.mjs');
    expect(row.body).toContain('macOS');
    expect(row.body).toContain('tests/the-renderer-typechecks-clean.test.mjs');
    expect(row.body).toContain('b1ee16f');
    expect(row.body).toContain(RED.displayTitle);
    expect(row.body).toContain(RED.url);
  });

  it('reads at a glance, before anyone opens it', async () => {
    const store = await storeFor();
    const logs = {
      115464554216: logFor('tests/the-renderer-typechecks-clean.test.mjs'),
      115464554410: logFor('tests/a-phone-scans-a-code-and-reaches-the-inbox.test.mjs', 'tests/the-renderer-typechecks-clean.test.mjs'),
    };
    await watcher(store, fakeGh({ logs })).watch({ product: product(), sha: 'b1ee16f' });
    const [row] = rows(store);
    // The summary panel falls back to the first sentence of the body when a row
    // has no Context, and a body that is a list reads as one run-on line there.
    expect(summaryOf(row).problem).toBe(row.problem);
    expect(row.problem).toContain('b1ee16f');
    expect(row.problem).toContain('macOS and Linux');
    expect(row.problem).toContain('tests/the-renderer-typechecks-clean.test.mjs');
    expect(wordsIn(row.problem)).toBeLessThanOrEqual(CONTEXT_WORDS);
  });

  it('is the only one while main stays red, however many tasks ship', async () => {
    const store = await storeFor();
    const gh = fakeGh({ logs: { 115464554216: logFor('tests/one.test.mjs'), 115464554410: logFor('tests/one.test.mjs') } });
    await watcher(store, gh).watch({ product: product(), sha: 'b1ee16f' });
    const later = { ...RED, databaseId: 1, headSha: 'abcdef1234567890abcdef1234567890abcdef12', displayTitle: 'And another' };
    await watcher(store, fakeGh({ runs: [later] })).watch({ product: product(), sha: 'abcdef1' });

    expect(rows(store)).toHaveLength(1);
  });

  it('hears about the green again, on that same row', async () => {
    const store = await storeFor();
    await watcher(store, fakeGh({ logs: { 115464554216: logFor('tests/one.test.mjs') } })).watch({ product: product(), sha: 'b1ee16f' });
    const [filed] = rows(store);
    await watcher(store, fakeGh({ runs: [GREEN] })).watch({ product: product(), sha: '053ec65' });

    const after = store.readItem('myproduct', filed.id);
    expect(after.note).toMatch(/green again/i);
    expect(after.note).toContain('053ec65');
    expect(rows(store)).toHaveLength(1);
  });

  it('files a new one the next time main breaks, after a green', async () => {
    const store = await storeFor();
    await watcher(store, fakeGh({ logs: { 115464554216: logFor('tests/one.test.mjs') } })).watch({ product: product(), sha: 'b1ee16f' });
    await watcher(store, fakeGh({ runs: [GREEN] })).watch({ product: product(), sha: '053ec65' });
    const again = { ...RED, databaseId: 2, headSha: 'ffffff1234567890abcdef1234567890abcdef12', displayTitle: 'Red once more' };
    await watcher(store, fakeGh({ runs: [again] })).watch({ product: product(), sha: 'ffffff1' });

    expect(rows(store)).toHaveLength(2);
  });

  it('says nothing about a green when main was never red', async () => {
    const store = await storeFor();
    await watcher(store, fakeGh({ runs: [GREEN] })).watch({ product: product(), sha: '053ec65' });
    expect(rows(store)).toHaveLength(0);
  });
});

describe('and the runs it must stay quiet about', () => {
  it('files nothing for a run a newer push cancelled', async () => {
    const store = await storeFor();
    const cancelled = { ...RED, conclusion: 'cancelled' };
    await watcher(store, fakeGh({ runs: [cancelled] })).watch({ product: product(), sha: 'b1ee16f' });
    expect(rows(store)).toHaveLength(0);
    // And main is not recorded as green either, so a later red still speaks.
    await watcher(store, fakeGh({ logs: { 115464554216: logFor('tests/one.test.mjs') } })).watch({ product: product(), sha: 'b1ee16f' });
    expect(rows(store)).toHaveLength(1);
  });

  it('files nothing when the run never started at all', async () => {
    const store = await storeFor();
    await watcher(store, fakeGh({ runs: [{ ...RED, conclusion: 'startup_failure' }] })).watch({ product: product(), sha: 'b1ee16f' });
    expect(rows(store)).toHaveLength(0);
  });

  it('does nothing, quietly, on a machine without gh or without access', async () => {
    const store = await storeFor();
    const gh = fakeGh({ fails: true });
    await watcher(store, gh).watch({ product: product(), sha: 'b1ee16f' });
    expect(rows(store)).toHaveLength(0);
    expect(gh.asked).toHaveLength(1);
  });

  it('gives up after about half an hour of a run that never ends', async () => {
    const store = await storeFor();
    const clock = { t: 0 };
    const gh = fakeGh({ runs: [{ ...RED, status: 'in_progress', conclusion: '' }] });
    await watcher(store, gh, { clock }).watch({ product: product(), sha: 'b1ee16f' });
    expect(rows(store)).toHaveLength(0);
    expect(clock.t).toBeGreaterThanOrEqual(GIVE_UP_MS);
    expect(clock.t).toBeLessThan(GIVE_UP_MS + 5 * 60 * 1000);
  });

  it('waits for a run GitHub has not made yet, rather than filing on its absence', async () => {
    const store = await storeFor();
    const clock = { t: 0 };
    await watcher(store, fakeGh({ runs: [] }), { clock }).watch({ product: product(), sha: 'b1ee16f' });
    expect(rows(store)).toHaveLength(0);
    expect(clock.t).toBeGreaterThanOrEqual(GIVE_UP_MS);
  });
});

// The ship is what starts the watch, and the commit has to travel with it: a
// watch that did not know which commit went out would have to guess, and the
// run it wants is the one for that sha and no other.
describe('what starts it', () => {
  it('is a ship, carrying the commit, the task and the project', async () => {
    const { ShipQueue } = await import('../main/ship-queue.mjs');
    const folders = path.join(root, 'folders');
    fs.mkdirSync(path.join(folders, 'w-a'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts', 'ship.mjs'), '');
    fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ myproduct: { script: 'scripts/ship.mjs' } }));
    const shipped = [];
    const q = new ShipQueue({
      store: { shipped() {}, shipFailed() {} },
      userDir,
      folderFor: (item) => path.join(folders, item.id),
      isLive: () => false,
      afterShip: (what) => shipped.push(what),
      run: async () => ({ code: 0, out: 'ship: shipped b1ee16f.\n' }),
    });
    await q.tick([{ id: 'w-a', product: 'myproduct', status: 'blocked', labels: ['ship'], updatedAt: 1 }], [product()]);

    expect(shipped).toHaveLength(1);
    expect(shipped[0].sha).toBe('b1ee16f');
    expect(shipped[0].item.id).toBe('w-a');
    expect(shipped[0].product.slug).toBe('myproduct');
  });

  it('is wired to the supervisor, and a ship with no commit starts nothing', async () => {
    const { Supervisor } = await import('../main/supervisor.mjs');
    const store = await storeFor();
    const config = { accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' };
    const sup = new Supervisor(config, store, root, path.join(root, 'data'), userDir);
    sup._saveState = () => {};
    const watched = [];
    sup.mainTests = { watch: async (what) => { watched.push(what); }, stop() {} };
    sup.watchMainsTests({ product: product(), sha: 'b1ee16f' });
    sup.watchMainsTests({ product: product(), sha: null });
    sup.watchMainsTests(undefined);
    expect(watched).toEqual([{ product: product(), sha: 'b1ee16f' }]);
    sup.stop();
  });
});
