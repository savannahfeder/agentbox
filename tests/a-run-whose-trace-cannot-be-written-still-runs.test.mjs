// A RUN'S TRACE FAILING TO OPEN MUST NOT TAKE THE SUPERVISOR DOWN WITH IT.
//
// Measured on this branch 2026-09-04, before the fix: `npx vitest run` reported
// `Errors 7` where a run of `main` reports none, and six of the seven were one
// shape, all from tests/a-codex-failure-is-not-her-claude-account.test.mjs:
//
//   Uncaught Exception
//   Error: ENOENT: no such file or directory, open
//     '.../agentbox-home-WG93NU/projects/...-codex-account-GaoZwu/sessions/w-codex-3/1788527858916.log'
//
// THE RACE, AND IT IS NOT ABOUT CODEX AT ALL. `spawnWorker` opens the run's
// trace with `fs.createWriteStream`, inside a `try`. `mkdirSync` on the line
// above it is synchronous and the `try` does cover that; `createWriteStream`
// IS NOT. It returns a stream and issues the real `open(2)` on a later tick
// (`Writable._construct`, scheduled with `process.nextTick`), so the `try`
// around it has already been left by the time the syscall runs, and a failure
// arrives as an `'error'` EVENT rather than as a throw. That stream had no
// `'error'` listener, and an unlistened `'error'` on a stream is not swallowed
// by Node: it is re-thrown as an uncaught exception. The `try` looked like it
// covered this and never could. So did the `try` around every `trace?.write`
// below it, for the same reason.
//
// The test that surfaced it spawns six workers into a temp product folder and
// never lets a tick pass, so its teardown swept the folder out from under six
// pending opens. THAT IS A REAL SHAPE AND NOT AN ARTEFACT OF A TEST. The same
// event arrives when the product folder moves or is deleted mid-run, when a
// worker's own `rm -rf` lands on it, and on a full disk -- which is not
// hypothetical here either (CLAUDE.md, 2026-08-31: "131 abandoned worktrees,
// 101 GB, 93% disk", with parallel runs failing because `mkdtemp` had nowhere
// to go). In her app the consequence is not seven lines of test output. It is
// the Electron main process dying, which kills EVERY running worker with it,
// over a diagnostic file.
//
// So the trace now has an `'error'` listener, and what it does is the whole of
// the fix: the run carries on, the broken stream is dropped so nothing writes
// into it again, and SHE IS TOLD ONCE, on the row, because the trace is how she
// answers "what did the agent actually DO" after the fact and losing it in
// silence is indistinguishable from the run having gone fine.
//
// A previous slice met the same race and patched the TEST that tripped over it
// (the `settle` helper in tests/a-codex-row-from-august-still-runs-on-claude
// .test.mjs). That was the symptom. This file is the cause, and it is pinned
// where it happens: through the real `Supervisor.spawnWorker`, with only
// `child_process.spawn` stubbed, against a real filesystem failure rather than
// a faked event.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// The one seam, and the same one the sibling file uses: `main/supervisor.mjs`
// imports `spawn` at module scope, so this is the only place to stand between
// the app and a real process. The stub keeps the handlers it is given, because
// the second half of the claim is that the run's OWN narration still works
// after the trace has broken.
const spawns = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    spawn: (bin, args, options) => {
      const on = {};
      const child = {
        stdin: { on() {}, write() {}, end() {}, writable: true }, stdout: { on(ev, fn) { on[`stdout:${ev}`] = fn; } },
        stderr: { on(ev, fn) { on[`stderr:${ev}`] = fn; } },
        on(ev, fn) { on[ev] = fn; },
        once(ev, fn) { on[ev] = fn; },
        handlers: on,
      };
      spawns.push({ bin, args, options, child });
      return child;
    },
  };
});

import { Supervisor } from '../main/supervisor.mjs';
import { machineryPath } from '../main/store/home.mjs';

const CLAUDE_BIN = '/nonexistent/claude-code/claude';
const dirs = [];

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'trace-failure-'));
  dirs.push(dir);
  const product = { slug: 'agentbox', dir, repoPath: null };
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-second-account',
      storeRoot: dir,
      claudeBin: CLAUDE_BIN,
      maxConcurrentSessions: 4,
      authProfiles: ['default'],
    },
    { listItems: () => [], listProducts: () => [product], isDue: () => true, settleAnswer() {} },
    '/nonexistent-app',
  );
  return { sup, product };
}

const row = (id = 'w-trace') => ({ id, product: 'agentbox', title: 'do the thing', status: 'open' });

// HOW LONG THE FAILURE TAKES TO ARRIVE, and it is not one tick. The stream
// defers its `open` to `process.nextTick`, the syscall itself goes to libuv's
// threadpool, and the completion lands in a later poll phase -- so a single
// `setImmediate` gets there BEFORE the error about half the time, which is
// exactly how the first draft of this file passed five of its six tests and
// failed the sixth for no reason anybody could see. Waiting on the fact rather
// than on a tick count, with a deadline that says what it was waiting for, is
// the only version of this that is not a 2am flake.
const settle = () => new Promise((resolve) => { setTimeout(() => setImmediate(resolve), 0); });
async function until(ready, why, ms = 2000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (ready()) return;
    if (Date.now() > deadline) throw new Error(`waited ${ms}ms and ${why}`);
    await settle();
  }
}

// What the supervisor says when the record cannot be written. Matched loosely
// on purpose: the sentence is hers to reword, the FACT that one exists is not.
const SAID = /could not write this run's record/i;
const traceLines = (session) => (session.tail ?? []).filter((l) => SAID.test(l));
const saidIt = (session) => until(() => traceLines(session).length > 0, 'the run never said its record could not be written');

beforeEach(() => { spawns.length = 0; });
afterAll(() => {
  for (const dir of dirs) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

describe('a run whose trace cannot be written still runs', () => {
  // THE CASE, and it is the exact one that produced the six errors: the folder
  // the trace lives in is gone by the time the stream's `open` reaches it.
  //
  // Deleted SYNCHRONOUSLY after `spawnWorker` returns, which is what makes this
  // deterministic rather than a race the test might lose: the stream defers its
  // `open` to `process.nextTick` at the earliest, so a synchronous `rmSync` on
  // the line after always gets there first. If that ever stopped being true the
  // assertions below go red rather than passing for the wrong reason -- the
  // first one asserts the failure actually happened.
  it('says so on the row when the folder is swept out from under the open', async () => {
    const { sup, product } = build();
    const traceDir = machineryPath(product.dir, join('sessions', 'w-trace'));

    sup.spawnWorker(row());
    rmSync(traceDir, { recursive: true, force: true });

    const session = sup.sessions.get('w-trace');
    await saidIt(session);
    expect(traceLines(session)).toHaveLength(1);
    expect(traceLines(session)[0]).toMatch(/ENOENT/);
  });

  // AND THE RUN IS UNAFFECTED, which is the half that says this is a warning
  // and not a failure. The process was started, the session is live, and the
  // tool's own words still reach the tail after the trace has broken.
  it('leaves the run itself alone: the worker started and still narrates', async () => {
    const { sup, product } = build();
    const traceDir = machineryPath(product.dir, join('sessions', 'w-trace'));

    sup.spawnWorker(row());
    rmSync(traceDir, { recursive: true, force: true });
    await saidIt(sup.sessions.get('w-trace'));

    expect(spawns).toHaveLength(1);
    expect(spawns[0].bin).toBe(CLAUDE_BIN);
    const session = sup.sessions.get('w-trace');
    expect(session).toBeDefined();

    spawns[0].child.handlers['stderr:data']('the tool said something');
    expect(session.tail.at(-1)).toBe('stderr: the tool said something');
  });

  // SAID ONCE. A stream that has broken is dropped rather than written into
  // again, so a chatty run cannot turn one disk fault into two hundred lines of
  // the same sentence on her card.
  it('says it once however much the run goes on to say', async () => {
    const { sup, product } = build();
    const traceDir = machineryPath(product.dir, join('sessions', 'w-trace'));

    sup.spawnWorker(row());
    rmSync(traceDir, { recursive: true, force: true });
    const session = sup.sessions.get('w-trace');
    await saidIt(session);

    for (let i = 0; i < 5; i += 1) spawns[0].child.handlers['stderr:data'](`line ${i}`);
    await settle();
    await settle();

    expect(traceLines(session)).toHaveLength(1);
  });

  // THE OTHER SIDE OF THE SAME BOUNDARY: the failure that IS synchronous. A
  // file where the sessions folder has to go makes `mkdirSync` throw ENOTDIR
  // on the spot. That was already caught and was already silent, and silence is
  // the thing this file is about, so it says the same sentence.
  it('says the same thing when the folder cannot be made at all', async () => {
    const { sup, product } = build();
    const sessions = machineryPath(product.dir, 'sessions');
    rmSync(sessions, { recursive: true, force: true });
    writeFileSync(sessions, 'not a directory\n');

    sup.spawnWorker(row());

    expect(spawns).toHaveLength(1);
    const session = sup.sessions.get('w-trace');
    await saidIt(session);
    expect(traceLines(session)).toHaveLength(1);
    expect(traceLines(session)[0]).toMatch(/ENOTDIR/);
  });

  // THE CASE THAT MUST NOT MATCH, and it is the one that would catch a fix that
  // simply announced a failure on every run. An ordinary spawn writes its trace
  // to disk, with the header in it, and says nothing about any of that.
  it('says nothing at all when the trace writes fine', async () => {
    const { sup, product } = build();

    sup.spawnWorker(row());
    // Long enough that a failure would have arrived by now, measured against
    // the three tests above which all wait on exactly this clock.
    await settle();
    await settle();
    await settle();

    const session = sup.sessions.get('w-trace');
    expect(traceLines(session)).toEqual([]);

    const traceDir = machineryPath(product.dir, join('sessions', 'w-trace'));
    expect(existsSync(traceDir)).toBe(true);
    expect(readdirSync(traceDir)).toHaveLength(1);
  });

  // AND THE SUITE'S OWN READING OF IT. `main` reports no unhandled errors and
  // this branch reported seven; six were the shape above. An uncaught exception
  // does not fail the test that caused it -- which is exactly why it went
  // unnoticed for a slice -- so what is asserted here is the OBSERVABLE the fix
  // adds. Delete the `'error'` listener and this file goes red on the line
  // above rather than quietly going back to seven.
  it('never leaves the trace stream without somebody listening for its failure', async () => {
    const { sup, product } = build();
    // A DIRECTORY exactly where the log file has to be opened: EISDIR, off the
    // real filesystem, with nothing swept and nothing racing. The clock is held
    // still only so that the file's name -- the session's `startedAt` -- is a
    // thing the test can know in advance.
    const at = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(at);
    mkdirSync(machineryPath(product.dir, join('sessions', 'w-trace', `${at}.log`)), { recursive: true });
    sup.spawnWorker(row());
    clock.mockRestore();

    const session = sup.sessions.get('w-trace');
    await saidIt(session);
    expect(traceLines(session)[0]).toMatch(/EISDIR/);
  });
});
