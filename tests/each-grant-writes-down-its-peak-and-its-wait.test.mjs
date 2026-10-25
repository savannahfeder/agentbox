// EACH GRANT WRITES DOWN ITS PEAK AND ITS WAIT.
//
// WHY. The row asked whether two heavy slots is the right number on a 16 GB
// Mac, and it could not be answered from anything the app had written down.
// The coordinator samples every running command's footprint and knows exactly
// how long each one waited, and then throws both away: `snapshot()` shows them
// while a command is live and nothing survives it. So the only way to say
// anything about the queue was to replay three days of agent transcripts
// through the classifier, which cannot separate waiting from running, because
// the one duration a transcript holds is the two added together.
//
// Fifty refusals were found that way, all at the full twenty minutes, and the
// commands that caused them could only be guessed at. One appended line per
// grant closes that for good: next time the question is asked it is a number.
//
// WHAT THIS PINS: every grant that finishes, and every command refused, leaves
// a line carrying what it was, how long it waited, how long it ran and the peak
// that was measured. Nothing is written when no log is asked for, the file is
// bounded, and a log that cannot be written never disturbs an agent.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryGateServer } from '../main/memory-gate-server.mjs';
import { CommandHistory } from '../main/memory-gate-history.mjs';

const dirs = [];
const servers = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const CLAUDE = { pid: 100, ppid: 1, mb: 300, args: '/Users/x/.local/bin/claude -p', startedAt: 1 };
const WORK = { pid: 200, ppid: 100, mb: 900, args: 'node run-the-suite.mjs' };

function harness({ grantLogFile, grantLogMaxBytes, slots = 1, history = new CommandHistory() } = {}) {
  const dir = fs.mkdtempSync(path.join('/tmp', 'gate-log-'));
  dirs.push(dir);
  let procs = [CLAUDE];
  let now = 0;
  // The Mac's own reading, so a test can hold it `tight` across a poll the way
  // a loaded Mac does; `_poll` reads it every time and would otherwise put it
  // back to `normal` underneath the test.
  let reading = { level: 1, freePct: 50 };
  const server = new MemoryGateServer({
    socketPath: path.join(dir, 'g.sock'),
    history,
    grantLogFile: grantLogFile === undefined ? path.join(dir, 'grants.jsonl') : grantLogFile,
    ...(grantLogMaxBytes === undefined ? {} : { grantLogMaxBytes }),
    readPressure: async () => reading,
    sampleProcesses: async () => procs,
    pollMs: 60_000,
    clock: () => now,
    gate: { slots },
  });
  servers.push(server);
  const ask = (id, command) => new Promise((resolve) => {
    const res = { end: (body) => resolve(body ?? ''), on: () => {} };
    server._pre({ ppid: CLAUDE.pid, score: 5, item: 'w-1', hook: { tool_use_id: id, tool_input: { command } } }, {}, res);
  });
  return {
    dir,
    logFile: path.join(dir, 'grants.jsonl'),
    ask,
    post: (id, durationMs = 30_000) => server._post({ hook: { tool_use_id: id, duration_ms: durationMs } }),
    at: (ms) => { now = ms; },
    tick: async () => { await server._poll(); },
    // 2 is the kernel's own "warn", which `pressureFrom` reads as tight.
    squeeze: () => { reading = { level: 2, freePct: 50 }; },
    show: (list) => { procs = [CLAUDE, ...list]; },
    server,
    lines: () => fs.readFileSync(path.join(dir, 'grants.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)),
  };
}

describe('each grant writes down its peak and its wait', () => {
  it('writes what it was, how long it waited, how long it ran and its peak', async () => {
    const h = new CommandHistory();
    h.keys.set('npm run', 'hhhhh'.split(''));
    const g = harness({ history: h, slots: 1 });

    // One heavy command takes the only slot at once, so its wait is nothing.
    await g.ask('a', 'npm run test:changed');
    g.show([WORK]);
    await g.tick();

    g.at(45_000);
    g.post('a', 45_000);

    const [line] = g.lines();
    expect(line.cls).toBe('heavy');
    expect(line.waitMs).toBe(0);
    expect(line.ranMs).toBe(45_000);
    expect(line.peakMb).toBe(900);
    expect(line.cmd).toContain('npm run test:changed');
  });

  it('writes down the wait of a command that had to queue', async () => {
    const h = new CommandHistory();
    h.keys.set('npm run', 'hhhhh'.split(''));
    h.keys.set('npx vitest', 'hhhhh'.split(''));
    const g = harness({ history: h, slots: 1 });

    await g.ask('first', 'npm run test:changed');
    const queued = g.ask('second', 'npx vitest run tests/a.test.mjs');

    // The second one cannot start: one slot, and the first is holding it.
    g.at(90_000);
    g.post('first', 90_000);
    await queued;

    g.at(140_000);
    g.post('second', 50_000);

    const lines = g.lines();
    expect(lines).toHaveLength(2);
    expect(lines[1].waitMs).toBe(90_000);
    expect(lines[1].ranMs).toBe(50_000);
  });

  it('writes down a refusal, with the wait that earned it', async () => {
    // Fifty of these were found in the transcripts and none could be tied to a
    // cause, which is why the line exists at all.
    const h = new CommandHistory();
    h.keys.set('npm run', 'hhhhh'.split(''));
    h.keys.set('npx vitest', 'hhhhh'.split(''));
    const g = harness({ history: h, slots: 1 });

    await g.ask('holder', 'npm run test:changed');
    const refused = g.ask('waiter', 'npx vitest run tests/a.test.mjs');

    // Past `maxWaitMs`, so the next pump refuses it.
    g.at(20 * 60_000 + 1);
    await g.tick();
    const body = await refused;
    // Under `normal` the refusal says the queue was long rather than that the
    // Mac was short, which is the distinction `refusal` draws from the same
    // pressure this line records.
    expect(body).toContain('behind heavier work');

    const refusals = g.lines().filter((l) => l.refused);
    expect(refusals).toHaveLength(1);
    expect(refusals[0].waitMs).toBe(20 * 60_000 + 1);
    expect(refusals[0].cls).toBe('heavy');
    expect(refusals[0].cmd).toContain('npx vitest');
  });

  it('says when a reading was shared, so nobody averages it as this command\'s own', async () => {
    // Two commands on one agent process are measured together, and `_post`
    // already refuses to teach the history that figure. The log has to carry
    // the same warning or a week of it reads as two commands of 900 MB each.
    const h = new CommandHistory();
    h.keys.set('npm run', 'hhhhh'.split(''));
    h.keys.set('npx vitest', 'hhhhh'.split(''));
    const g = harness({ history: h, slots: 2 });

    await g.ask('one', 'npm run test:changed');
    await g.ask('two', 'npx vitest run tests/a.test.mjs');
    g.show([WORK]);
    await g.tick();

    g.at(10_000);
    g.post('one', 10_000);
    g.post('two', 10_000);

    for (const line of g.lines()) {
      expect(line.shared).toBe(true);
      expect(line.peakMb).toBe(null);
    }
  });

  it('writes down the pressure the wait happened under', async () => {
    // Without this the waits are unreadable. Under `normal` only full slots can
    // hold a heavy command, so its wait is evidence about the slot count. Under
    // `tight` nothing heavy starts whatever the count is, so the same wait says
    // nothing and has to be left out of the reckoning.
    const h = new CommandHistory();
    h.keys.set('npm run', 'hhhhh'.split(''));
    h.keys.set('npx vitest', 'hhhhh'.split(''));
    const g = harness({ history: h, slots: 1 });

    await g.ask('normal', 'npm run test:changed');
    g.at(5_000);
    g.post('normal', 5_000);

    g.squeeze();
    await g.tick();
    const held = g.ask('whileTight', 'npx vitest run tests/a.test.mjs');
    g.at(20 * 60_000 + 5_001);
    await g.tick();
    await held;

    const lines = g.lines();
    expect(lines[0].pressure).toBe('normal');
    expect(lines[1].refused).toBe(true);
    expect(lines[1].pressure).toBe('tight');
  });

  it('writes nothing at all when no log was asked for', async () => {
    const g = harness({ grantLogFile: null });
    await g.ask('a', 'ls -la');
    g.at(1_000);
    g.post('a', 1_000);
    expect(fs.existsSync(g.logFile)).toBe(false);
  });

  it('keeps the file bounded rather than growing for ever', async () => {
    const g = harness({ grantLogMaxBytes: 400 });
    for (let i = 0; i < 40; i++) {
      await g.ask(`c${i}`, `echo a-command-with-a-reasonably-long-name-${i}`);
      g.at(1_000 * (i + 1));
      g.post(`c${i}`, 1_000);
    }
    expect(fs.statSync(g.logFile).size).toBeLessThanOrEqual(400 + 200);
    // The one before it is kept, so a week can still be read across the two.
    expect(fs.existsSync(`${g.logFile}.1`)).toBe(true);
  });

  it('never lets a log it cannot write disturb an agent', async () => {
    // The gate answers every shell command on the Mac. A full disk, or a path
    // that is not writable, must cost a line of log and nothing else.
    const g = harness({ grantLogFile: '/this/path/does/not/exist/grants.jsonl' });
    const body = await g.ask('a', 'ls -la');
    expect(body).toBe('');
    expect(() => g.post('a', 1_000)).not.toThrow();
  });
});
