// A JOB GITHUB NEVER GAVE A RUNNER IS NOT A FAILING TEST (w-c59bc20c89, 2026-11-02).
//
// main's run at 23ed9d4 went red and the row it filed read "main went red on
// GitHub, and its log names no failing test", with not one machine under it.
// It then told whoever picked it up to find the failing tests and, failing
// that, to `git revert` the commit. No test had failed. GitHub's own
// annotation on that job said it:
//
//   The job was not acquired by Runner of type hosted even after multiple attempts
//   Due to capacity constraints, jobs targeting macOS arm64 runners may
//   experience longer queue times.
//
// The macOS job sat queued for fifteen minutes, never got a runner, and GitHub
// marked it `cancelled` with zero steps. Linux passed. A run with one cancelled
// job concludes `failure`, so `verdict` said failing; `machinesIn` keeps only
// jobs concluded `failure`, so it found none and the row was built over an
// empty list. It happened twice inside forty minutes that evening, and a row
// that asks for a revert of good work is the dangerous half of it.
//
// So a run whose only complaint is a job GitHub never staffed is asked again,
// once, and nothing is filed in the meantime. Only when the second attempt is
// also unstaffed does a row land, and it says what actually happened rather
// than naming a test.
//
// What must NOT happen is pinned too: a run where a job really did fail still
// files the row it always did, a job cancelled alongside a real failure is not
// read as a capacity shortage, and the few seconds in which GitHub still
// answers with the attempt just re-run do not file a row about a job that is
// about to start. A re-run keeps the run's id and gives the new attempt new job
// ids, so the ask is remembered by job id and not by run.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { CONTEXT_WORDS, wordsIn } from '../shared/thread-cards.mjs';
import { MainTests, shortOfRunners, noRunnerRow, MAIN_RED_LABEL } from '../main/main-went-red.mts';

let root; let userDir;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-runner-'));
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-runner-user-'));
  const dir = path.join(root, 'myproduct');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'myproduct', name: 'My Product' }));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(userDir, { recursive: true, force: true });
});

// The two jobs of run 41513011133, as GitHub answered for them.
const NEVER_STAFFED = {
  id: 125509341407, name: 'vitest', conclusion: 'cancelled', labels: ['macos-latest'], steps: [],
};
const LINUX_PASSED = {
  id: 125509340385,
  name: 'vitest-linux',
  conclusion: 'success',
  labels: ['ubuntu-latest'],
  steps: [{ name: 'Run npx vitest run --reporter=basic', conclusion: 'success' }],
};
const LINUX_FAILED = { ...LINUX_PASSED, conclusion: 'failure' };

describe('telling a capacity shortage from a failing test', () => {
  it('reads a cancelled job that ran no step as one GitHub never staffed', () => {
    expect(shortOfRunners([NEVER_STAFFED, LINUX_PASSED])).toEqual(['macOS']);
  });

  it('is not a shortage when a job really did fail', () => {
    expect(shortOfRunners([NEVER_STAFFED, LINUX_FAILED])).toEqual([]);
  });

  it('is not a shortage when the cancelled job got as far as running steps', () => {
    const stopped = { ...NEVER_STAFFED, steps: [{ name: 'Run npm ci', conclusion: 'success' }] };
    expect(shortOfRunners([stopped, LINUX_PASSED])).toEqual([]);
  });

  it('is not a shortage when GitHub named no jobs at all', () => {
    expect(shortOfRunners([])).toEqual([]);
  });
});

const RED = {
  databaseId: 41513011133,
  headSha: '23ed9d4899d95a4832a4f3ec30116349d89413bf',
  status: 'completed',
  conclusion: 'failure',
  displayTitle: 'Merge origin/main into agentbox/w-6d42d31370',
  url: 'https://github.com/savannahfeder/agentbox/actions/runs/41513011133',
};

/**
 * A watcher over a GitHub that answers with `attempts` in order: each entry is
 * the run and its jobs for one pass round the watch loop.
 */
const watcherOver = (store, attempts, { asked = [] } = {}) => {
  let pass = 0;
  return new MainTests({
    store,
    userDir,
    gh: async (args) => {
      if (args[0] === 'run' && args[1] === 'rerun') {
        asked.push(args.join(' '));
        return { code: 0, out: '' };
      }
      if (args[0] === 'run') {
        const at = attempts[Math.min(pass, attempts.length - 1)];
        return { code: 0, out: JSON.stringify([at.run]) };
      }
      if (/\/jobs$/.test(args[1] ?? '')) {
        const at = attempts[Math.min(pass, attempts.length - 1)];
        pass += 1;
        return { code: 0, out: JSON.stringify({ jobs: at.jobs }) };
      }
      return { code: 0, out: '2026-11-02T19:54:43Z FAIL  tests/something.test.mjs > it broke' };
    },
    now: () => 0,
    wait: async () => {},
    log: { info() {}, warn() {} },
  });
};

const itemsOf = (store) => store.listItems().filter((i) => i.product === 'myproduct');

const newStore = () => new Store({
  accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody',
}).init();

describe('the run GitHub had no macOS runner for', () => {
  it('asks GitHub to run it again and files nothing yet', async () => {
    const store = await newStore();
    const asked = [];
    await watcherOver(store, [
      { run: RED, jobs: [NEVER_STAFFED, LINUX_PASSED] },
      { run: { ...RED, status: 'completed', conclusion: 'success' }, jobs: [] },
    ], { asked }).watch({ product: { slug: 'myproduct', repoPath: root }, sha: '23ed9d4' });
    expect(asked.join(' ')).toContain('41513011133');
    // The whole run, because a starved job is `cancelled` and GitHub's
    // re-run-failed-jobs is about jobs concluded `failure`.
    expect(asked.join(' ')).not.toContain('--failed');
    expect(itemsOf(store)).toHaveLength(0);
  });

  it('waits while GitHub still answers with the attempt it just re-ran', async () => {
    const store = await newStore();
    const asked = [];
    await watcherOver(store, [
      { run: RED, jobs: [NEVER_STAFFED, LINUX_PASSED] },
      // The same job ids: GitHub has not started the new attempt yet.
      { run: RED, jobs: [NEVER_STAFFED, LINUX_PASSED] },
      { run: RED, jobs: [NEVER_STAFFED, LINUX_PASSED] },
      { run: { ...RED, conclusion: 'success' }, jobs: [] },
    ], { asked }).watch({ product: { slug: 'myproduct', repoPath: root }, sha: '23ed9d4' });
    expect(asked).toHaveLength(1);
    expect(itemsOf(store)).toHaveLength(0);
  });

  it('never asks the same run twice, and says what happened once a new attempt starves too', async () => {
    const store = await newStore();
    const asked = [];
    const SECOND_ATTEMPT = { ...NEVER_STAFFED, id: 125600000001 };
    await watcherOver(store, [
      { run: RED, jobs: [NEVER_STAFFED, LINUX_PASSED] },
      { run: RED, jobs: [SECOND_ATTEMPT, LINUX_PASSED] },
    ], { asked }).watch({ product: { slug: 'myproduct', repoPath: root }, sha: '23ed9d4' });
    expect(asked).toHaveLength(1);
    const [row] = itemsOf(store);
    expect(row.title).toContain('macOS');
    expect(row.title).not.toContain('names no failing test');
    expect(row.body).toContain('23ed9d4');
    expect(row.body).toContain(RED.url);
    expect(row.body).not.toContain('git revert');
  });

  it('does not start its own fix, because no commit here is wrong', async () => {
    const store = await newStore();
    await watcherOver(store, [
      { run: RED, jobs: [NEVER_STAFFED, LINUX_PASSED] },
      { run: RED, jobs: [{ ...NEVER_STAFFED, id: 7 }, LINUX_PASSED] },
    ]).watch({ product: { slug: 'myproduct', repoPath: root }, sha: '23ed9d4' });
    const [row] = itemsOf(store);
    expect(row.labels ?? []).not.toContain(MAIN_RED_LABEL);
  });

  it('files nothing when this machine cannot ask GitHub for the run at all', async () => {
    const store = await newStore();
    const watcher = new MainTests({
      store,
      userDir,
      gh: async (args) => {
        if (args[0] === 'run' && args[1] === 'rerun') return { code: 1, out: 'gh: HTTP 403' };
        if (args[0] === 'run') return { code: 0, out: JSON.stringify([RED]) };
        if (/\/jobs$/.test(args[1] ?? '')) return { code: 0, out: JSON.stringify({ jobs: [NEVER_STAFFED, LINUX_PASSED] }) };
        return { code: 0, out: '' };
      },
      now: () => 0,
      wait: async () => {},
      log: { info() {}, warn() {} },
    });
    await watcher.watch({ product: { slug: 'myproduct', repoPath: root }, sha: '23ed9d4' });
    expect(itemsOf(store)).toHaveLength(0);
  });

  // A frozen clock is the caller's to set, and the watch has to end anyway.
  it('gives up without a row when GitHub never starts the attempt it was asked for', async () => {
    const store = await newStore();
    const asked = [];
    await watcherOver(store, [
      { run: RED, jobs: [NEVER_STAFFED, LINUX_PASSED] },
    ], { asked }).watch({ product: { slug: 'myproduct', repoPath: root }, sha: '23ed9d4' });
    expect(asked).toHaveLength(1);
    expect(itemsOf(store)).toHaveLength(0);
  });

  it('fits its title and its context inside what a card draws', () => {
    const row = noRunnerRow({
      sha: RED.headSha, subject: RED.displayTitle, url: RED.url, machines: ['macOS', 'Linux'],
    });
    expect(row.title.length).toBeLessThanOrEqual(90);
    expect(wordsIn(row.problem)).toBeLessThanOrEqual(CONTEXT_WORDS);
  });

  it('leaves the row that names the failing tests alone when a job really failed', async () => {
    const store = await newStore();
    const asked = [];
    await watcherOver(store, [
      { run: RED, jobs: [NEVER_STAFFED, LINUX_FAILED] },
    ], { asked }).watch({ product: { slug: 'myproduct', repoPath: root }, sha: '23ed9d4' });
    expect(asked).toHaveLength(0);
    const [row] = itemsOf(store);
    expect(row.title).toContain('tests/something.test.mjs');
    expect(row.labels).toContain(MAIN_RED_LABEL);
  });
});
