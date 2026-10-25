// A RED MAIN THAT NAMES NO TEST STILL SAYS WHAT BROKE (w-05522a0a20, 2026-10-21).
//
// main went red at 99de7ab and again at bff5190, and the row the watcher filed
// read "nothing in its log names a failing test" on both machines and stopped
// there. An hour went into getting back what the log had already said.
//
// Vitest exits 1 for three things that are not a failing test, and none of
// them print FAIL: an error thrown after a file's tests have passed, a
// collection that never started (EMFILE at 1,381 test files, measured here on
// 2026-10-21), and a worker that died. The run at 99de7ab took 586 s against
// the last green run's 590 s, so the suite ran the whole way and then exited
// on one of those.
//
// The watcher already holds the job log when it builds the row. So when no
// test is named it now quotes the runner instead of saying nothing.
//
// What must NOT happen is pinned as hard as what must: a line vitest QUOTED is
// not the runner speaking. A code frame and a diff both carry the file's own
// text, and this repo's test files are sentences.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { CONTEXT_WORDS, wordsIn } from '../shared/thread-cards.mjs';
import { MainTests, redTitle, whatTheRunnerSaid } from '../main/main-went-red.mjs';

let root; let userDir;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'red-said-'));
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'red-said-user-'));
  const dir = path.join(root, 'myproduct');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'myproduct', name: 'My Product' }));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(userDir, { recursive: true, force: true });
});

const stamp = (line) => `2026-10-21T22:24:09.1234567Z ${line}`;

// What vitest 2.1.9 really printed here on 2026-10-21 when collection hit the
// open-file limit, through GitHub's own log, timestamps and all.
const EMFILE_LOG = [
  'npm ci',
  '\u001b[36mRUN\u001b[39m v2.1.9 /home/runner/work/agentbox/agentbox',
  '',
  '\u001b[2m⎯⎯⎯⎯⎯⎯\u001b[22m\u001b[1m\u001b[41m Unhandled Errors \u001b[49m\u001b[22m\u001b[2m⎯⎯⎯⎯⎯⎯\u001b[22m',
  '',
  'Vitest caught 1 unhandled error during the test run.',
  'This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.',
  '',
  '\u001b[2m⎯⎯⎯⎯⎯⎯\u001b[22m\u001b[1m\u001b[41m Unhandled Error \u001b[49m\u001b[22m\u001b[2m⎯⎯⎯⎯⎯⎯\u001b[22m',
  "Error: EMFILE: too many open files, open '/home/runner/work/agentbox/agentbox/tests/a-refresh-keeps-the-keyboard-on-the-same-thread.test.mjs'",
  ' ❯ open node:internal/fs/promises:639:25',
  '',
  "Serialized Error: { errno: -24, code: 'EMFILE', syscall: 'open' }",
  '',
  ' Test Files  no tests',
  '      Tests  no tests',
  '     Errors  1 error',
  '##[error]Process completed with exit code 1.',
].map(stamp).join('\n');

// A file whose promise rejects after its own tests have already passed: the
// suite is green and the runner still exits 1.
const LATE_REJECTION_LOG = [
  ' \u001b[32m✓\u001b[39m tests/a-voice-note-is-never-lost.test.mjs (18 tests) 211ms',
  '',
  '\u001b[2m⎯⎯⎯\u001b[22m Unhandled Error \u001b[2m⎯⎯⎯\u001b[22m',
  'Error: connect ECONNREFUSED 127.0.0.1:54321',
  ' ❯ TCPConnectWrap.afterConnect node:net:1611:16',
  '',
  ' Test Files  1381 passed (1381)',
  '      Tests  18422 passed (18422)',
  '     Errors  1 error',
].map(stamp).join('\n');

describe('what the runner said, when it named no test', () => {
  it('is the error under the banner, not the two lines of advice over it', () => {
    expect(whatTheRunnerSaid(EMFILE_LOG)).toEqual([
      "Error: EMFILE: too many open files, open '/home/runner/work/agentbox/agentbox/tests/a-refresh-keeps-the-keyboard-on-the-same-thread.test.mjs'",
    ]);
  });

  it('reads a late rejection the same way, under a suite that passed', () => {
    expect(whatTheRunnerSaid(LATE_REJECTION_LOG)).toEqual(['Error: connect ECONNREFUSED 127.0.0.1:54321']);
  });

  it('reads a worker that died, and a heap that ran out', () => {
    const log = [
      stamp('⎯⎯ Unhandled Error ⎯⎯'),
      stamp('Error: Worker exited unexpectedly'),
      stamp('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'),
    ].join('\n');
    expect(whatTheRunnerSaid(log)).toEqual([
      'Error: Worker exited unexpectedly',
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
    ]);
  });

  it('says a run that found nothing to run found nothing to run', () => {
    expect(whatTheRunnerSaid(stamp('No test files found, exiting with code 1'))).toEqual(['No test files found, exiting with code 1']);
  });

  it('never reads a line vitest quoted out of a test file', () => {
    const quoted = [
      stamp('+               Error: Worker exited unexpectedly'),
      stamp('-               No test files found, exiting with code 1'),
      stamp('34|   FATAL ERROR: Reached heap limit - JavaScript heap out of memory'),
      stamp('+   ⎯⎯ Unhandled Error ⎯⎯'),
      stamp('+   Error: the one the test is about'),
    ].join('\n');
    expect(whatTheRunnerSaid(quoted)).toEqual([]);
  });

  it('is nothing at all on a run that simply failed its tests', () => {
    const log = [
      stamp(' \u001b[32m✓\u001b[39m tests/one.test.mjs 51ms'),
      stamp(' \u001b[31m FAIL \u001b[39m tests/two.test.mjs > a suite > and a case'),
    ].join('\n');
    expect(whatTheRunnerSaid(log)).toEqual([]);
  });

  it('keeps at most five, once each, however often the runner repeats itself', () => {
    const log = Array.from({ length: 20 }, (_, i) => [
      stamp('⎯⎯ Unhandled Error ⎯⎯'),
      stamp(`Error: number ${i % 7} went wrong`),
    ].join('\n')).join('\n');
    expect(whatTheRunnerSaid(log)).toHaveLength(5);
  });
});

const NOTHING_NAMED = 'nothing in its log names a failing test';

describe('the row it files when no test is named', () => {
  const RED = {
    databaseId: 39684845552,
    headSha: '99de7abf8cde5badf2d2d33950d8fbab2a313efe',
    status: 'completed',
    conclusion: 'failure',
    displayTitle: 'Merge origin/main into agentbox/w-3d0fa23ffb',
    url: 'https://github.com/savannahfeder/agentbox/actions/runs/39684845552',
  };
  const JOBS = {
    jobs: [
      { id: 119516471565, name: 'vitest', conclusion: 'failure', labels: ['macos-latest'] },
      { id: 119516471899, name: 'vitest-linux', conclusion: 'failure', labels: ['ubuntu-latest'] },
    ],
  };

  const watcherOver = (store, logs) => new MainTests({
    store,
    userDir,
    gh: async (args) => {
      if (args[0] === 'run') return { code: 0, out: JSON.stringify([RED]) };
      if (/\/jobs$/.test(args[1] ?? '')) return { code: 0, out: JSON.stringify(JOBS) };
      const id = (args[1] ?? '').match(/jobs\/(\d+)\/logs/)?.[1];
      if (logs[id] === undefined) return { code: 1, out: 'gh: HTTP 403' };
      return { code: 0, out: logs[id] };
    },
    now: () => 0,
    wait: async () => {},
    log: { info() {}, warn() {} },
  });

  const fileIt = async (logs) => {
    const store = await new Store({
      accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody',
    }).init();
    await watcherOver(store, logs).watch({ product: { slug: 'myproduct', repoPath: root }, sha: '99de7ab' });
    return store.listItems().filter((i) => i.product === 'myproduct')[0];
  };

  it('quotes the runner under each machine, instead of saying nothing', async () => {
    const row = await fileIt({ 119516471565: LATE_REJECTION_LOG, 119516471899: EMFILE_LOG });
    expect(row.body).toContain('Error: connect ECONNREFUSED 127.0.0.1:54321');
    expect(row.body).toContain('Error: EMFILE: too many open files');
    expect(row.body).toContain('macOS');
    expect(row.body).toContain('Linux');
  });

  it('leads with that error in its title and in its context', async () => {
    const row = await fileIt({ 119516471565: LATE_REJECTION_LOG, 119516471899: LATE_REJECTION_LOG });
    expect(row.title).toContain('ECONNREFUSED');
    expect(row.title.length).toBeLessThanOrEqual(90);
    expect(row.problem).toContain('ECONNREFUSED');
    expect(row.problem).toContain('99de7ab');
    expect(wordsIn(row.problem)).toBeLessThanOrEqual(CONTEXT_WORDS);
  });

  it('keeps the old words when the log says nothing either', async () => {
    const row = await fileIt({ 119516471565: stamp('npm ci exited with 1'), 119516471899: '' });
    expect(row.title).toBe('main went red on GitHub, and its log names no failing test');
    expect(row.body).toContain('nothing in its log names a failing test');
  });

  it('never claims a log it could not read names nothing', async () => {
    const row = await fileIt({});
    expect(row.title).toBe('main went red on GitHub, and its log could not be read from here');
    expect(row.problem).toContain('could not be read');
    expect(row.body).not.toContain(NOTHING_NAMED);
  });

  it('still fits a context inside its limit when the runner is long-winded', () => {
    const long = `Error: ${'a very long complaint indeed '.repeat(20)}`;
    expect(redTitle([{ machine: 'Linux', tests: [], said: [long] }]).length).toBeLessThanOrEqual(90);
  });
});
