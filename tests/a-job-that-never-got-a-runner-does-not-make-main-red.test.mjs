// A JOB THAT NEVER GOT A RUNNER DOES NOT MAKE MAIN RED (w-2868376f62, 2026-11-02).
//
// Four of main's runs on 2026-11-02 were called red by GitHub with no test
// having failed. In each, the macOS job sat queued without a runner ever being
// handed to it (`runner_name` empty, zero steps) and GitHub cancelled it after
// about fifteen minutes; the Linux job ran the whole suite green. GitHub still
// gives such a run the conclusion `failure`, so `verdict` called it failing,
// and `machinesIn` found no job with the conclusion `failure` to read a log
// from. The row that came out of that said "its log names no failing test",
// about a suite that had passed everywhere it ran, and an agent spent a run on
// it: https://github.com/savannahfeder/agentbox/actions/runs/41519388094
//
// A cancelled job is a verdict on nothing, exactly as a cancelled RUN already
// was. What must NOT happen is pinned too: a red that a cancellation does not
// account for still files, and so does one whose jobs this machine could not
// read, because going quiet on a red nobody can explain is the worse failure.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { MainTests, MAIN_RED_LABEL, redOnMain } from '../main/main-went-red.mts';

let root; let userDir;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'red-queued-'));
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'red-queued-user-'));
  const dir = path.join(root, 'myproduct');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'myproduct', name: 'My Product' }));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(userDir, { recursive: true, force: true });
});

const RUN = {
  databaseId: 41519388094,
  headSha: '11a2ba2497f0a05a2f3a2cd6cbd6cdd0d4dc73a1',
  status: 'completed',
  conclusion: 'failure',
  displayTitle: 'Merge origin/main into agentbox/w-3de9ae865d',
  url: 'https://github.com/savannahfeder/agentbox/actions/runs/41519388094',
};

// The macOS job as the API really answered for that run: cancelled, and with
// no steps at all, because no runner was ever handed to it.
const NEVER_STARTED = { id: 125531182492, name: 'vitest', conclusion: 'cancelled', labels: ['macos-latest'], steps: [] };
const LINUX_GREEN = { id: 125531182887, name: 'vitest-linux', conclusion: 'success', labels: ['ubuntu-latest'] };
const LINUX_RED = { id: 125531182888, name: 'vitest-linux', conclusion: 'failure', labels: ['ubuntu-latest'] };

const stamp = (line) => `2026-11-02T20:42:45.1234567Z ${line}`;
const RED_LOG = [
  stamp(' \u001b[32m✓\u001b[39m tests/one.test.mjs 51ms'),
  stamp('FAIL  tests/the-tray-counts-a-thread-answered-after-you-left.test.mjs > the tray > counts it'),
].join('\n');

/** A watcher over one run, the jobs it names, and the logs those jobs have. */
const watcherOver = (store, { jobs, logs = {}, jobsCode = 0 }) => new MainTests({
  store,
  userDir,
  gh: async (args) => {
    if (args[0] === 'run') return { code: 0, out: JSON.stringify([RUN]) };
    if (/\/jobs$/.test(args[1] ?? '')) {
      return jobsCode === 0 ? { code: 0, out: JSON.stringify({ jobs }) } : { code: jobsCode, out: 'gh: HTTP 403' };
    }
    const id = (args[1] ?? '').match(/jobs\/(\d+)\/logs/)?.[1];
    return logs[id] === undefined ? { code: 1, out: 'gh: HTTP 403' } : { code: 0, out: logs[id] };
  },
  now: () => 0,
  wait: async () => {},
  log: { info() {}, warn() {} },
});

const storeIn = () => new Store({
  accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody',
}).init();

const watch = async (store, over) => {
  await watcherOver(store, over).watch({ product: { slug: 'myproduct', repoPath: root }, sha: '11a2ba2' });
  return store.listItems().filter((i) => i.product === 'myproduct');
};

describe('a run GitHub called red where the only job that is not green was cancelled', () => {
  it('files nothing at all', async () => {
    const store = await storeIn();
    expect(await watch(store, { jobs: [NEVER_STARTED, LINUX_GREEN] })).toEqual([]);
  });

  it('leaves no test recorded as red on main, so no ship is refused for it', async () => {
    const store = await storeIn();
    await watch(store, { jobs: [NEVER_STARTED, LINUX_GREEN] });
    expect(redOnMain(userDir)).toEqual([]);
  });

  it('does not count as main being red, so the next real one is try one', async () => {
    const store = await storeIn();
    await watch(store, { jobs: [NEVER_STARTED, LINUX_GREEN] });
    const rows = await watch(store, { jobs: [NEVER_STARTED, LINUX_RED], logs: { 125531182888: RED_LOG } });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('main went red on GitHub: tests/the-tray-counts-a-thread-answered-after-you-left.test.mjs');
    expect(rows[0].labels).toContain(MAIN_RED_LABEL);
  });
});

describe('a red a cancellation does not account for', () => {
  it('still files, naming the test and only the machine that failed', async () => {
    const store = await storeIn();
    const rows = await watch(store, { jobs: [NEVER_STARTED, LINUX_RED], logs: { 125531182888: RED_LOG } });
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain('tests/the-tray-counts-a-thread-answered-after-you-left.test.mjs');
    expect(rows[0].body).toContain('Linux:');
    expect(rows[0].body).not.toContain('macOS:');
  });

  it('still files when this machine could not read the run\'s jobs', async () => {
    const store = await storeIn();
    const rows = await watch(store, { jobs: [], jobsCode: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain('main went red on GitHub');
  });
});
