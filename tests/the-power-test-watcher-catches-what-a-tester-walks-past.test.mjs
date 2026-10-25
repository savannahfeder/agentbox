// THE POWER TEST WATCHER CATCHES WHAT A TESTER WALKS PAST.
//
// What was missing (w-811757c0b5, 2026-10-20): an agent testing the app only
// reports what it sees on the screen, and the bugs that cost the person
// running these tests days are the ones that do not show there or show only
// after an hour: a thread that never gets an answer and is never told why, a
// thread started over and over, errors in the log, memory climbing. Found
// while building this: on Linux the app logs "leftovers: could not list
// processes" on every start, which no screen shows.
//
// The watcher reads the copy's ledger, its session logs, its log file and its
// processes every minute. These are its checks, each with the case that must
// not trip it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { waitingTooLong, startLoops, answeredRun, errorLines, growth, instanceProcesses, keepEvidence } from '../.claude/skills/power-test/scripts/watch.mjs';

const MIN = 60_000;
const created = (id, ts) => [
  { id, ts, source: 'system', patch: { title: `task ${id}`, status: 'open' } },
  { id, ts: ts + 3, source: 'founder', patch: { title: `task ${id}`, model: 'opus' } },
];

describe('a thread with no answer and no word', () => {
  it('is caught after the wait, and not a moment before', () => {
    const lines = created('a', 0);
    expect(waitingTooLong(lines, 10 * MIN + 3, { afterMs: 10 * MIN })).toHaveLength(1);
    expect(waitingTooLong(lines, 10 * MIN, { afterMs: 10 * MIN })).toHaveLength(0);
  });

  it('is not caught once it has an answer, or a note saying why it waits', () => {
    expect(waitingTooLong([...created('a', 0), { id: 'a', ts: 5, source: 'agent', patch: { result: 'done' } }], 60 * MIN, { afterMs: MIN })).toEqual([]);
    expect(waitingTooLong([...created('a', 0), { id: 'a', ts: 5, source: 'system', patch: { note: 'out of usage until 4pm' } }], 60 * MIN, { afterMs: MIN })).toEqual([]);
  });

  it('is caught again after a reply that gets no answer', () => {
    const lines = [...created('a', 0), { id: 'a', ts: 5, source: 'agent', patch: { result: 'done' } }, { id: 'a', ts: 10, source: 'founder', patch: { answer: 'and the tests?' } }];
    expect(waitingTooLong(lines, 10 + 30 * MIN, { afterMs: 30 * MIN })).toMatchObject([{ id: 'a', title: 'task a' }]);
  });

  it('leaves out threads closed, put off until later, or seeded as history', () => {
    const closed = [...created('a', 0), { id: 'a', ts: 9, source: 'founder', patch: { status: 'done' } }];
    const later = [...created('b', 0), { id: 'b', ts: 9, source: 'founder', patch: { runAt: 120 * MIN } }];
    expect(waitingTooLong([...closed, ...later], 60 * MIN, { afterMs: MIN })).toEqual([]);
    expect(waitingTooLong(created('c', 0), 60 * MIN, { afterMs: MIN, seeded: new Set(['c']) })).toEqual([]);
    // Put off until a time that has come is waiting again.
    expect(waitingTooLong(later, 121 * MIN, { afterMs: MIN })).toHaveLength(1);
  });

  it('does not take a rename for a new ask', () => {
    const lines = [...created('a', 0), { id: 'a', ts: 5, source: 'agent', patch: { result: 'done' } }, { id: 'a', ts: 9, source: 'founder', patch: { title: 'renamed' } }];
    expect(waitingTooLong(lines, 60 * MIN, { afterMs: MIN })).toEqual([]);
  });
});

describe('a thread started over and over', () => {
  it('is caught at six starts in ten minutes, not at five, and not across a longer stretch', () => {
    const at = (n, gap) => Array.from({ length: n }, (_, i) => ({ id: 'a', at: i * gap }));
    expect(startLoops(at(6, MIN), 6 * MIN)).toEqual([{ id: 'a', starts: 6 }]);
    expect(startLoops(at(5, MIN), 5 * MIN)).toEqual([]);
    expect(startLoops(at(6, 3 * MIN), 15 * MIN)).toEqual([]);
  });

  // w-3d0fa23ffb, 2026-10-21: the first stretch in the founder's room called two
  // threads broken. One was a tester replying eight times in 13 minutes, every
  // run answered; the other was three answered replies and three Codex starts
  // refused in under a second. The app counts only runs that ended before the
  // agent began, and so does this now.
  it('does not count a run that answered, so a busy back-and-forth is not a loop', () => {
    const busy = Array.from({ length: 8 }, (_, i) => ({ id: 'a', at: i * MIN, answered: true }));
    expect(startLoops(busy, 8 * MIN)).toEqual([]);
    const mixed = [0, 1, 2].map((i) => ({ id: 'b', at: i * MIN, answered: true }))
      .concat([3, 4, 5].map((i) => ({ id: 'b', at: i * MIN, answered: false })));
    expect(startLoops(mixed, 6 * MIN)).toEqual([]);
    const dead = Array.from({ length: 6 }, (_, i) => ({ id: 'c', at: i * MIN, answered: false }));
    expect(startLoops(dead, 6 * MIN)).toEqual([{ id: 'c', starts: 6 }]);
  });

  it('reads a run as answered from a clean result line, and not from one marked ERROR or none', () => {
    expect(answeredRun('21:59:01  == RESULT (success · ? turns) ==\nWorked on it.\n\n# exited (0) 2026-10-21T21:59:01.784Z\n')).toBe(true);
    expect(answeredRun('14:02:11  == RESULT (completed · 3m) ==\nDone.\n')).toBe(true);
    expect(answeredRun('14:02:11  == RESULT (success ERROR · 1 turns) ==\nYou are out of usage.\n')).toBe(false);
    expect(answeredRun('stderr: this row asks to run on "stub-model"\n\n# exited (1) 2026-10-21T22:00:28.737Z\n')).toBe(false);
  });
});

describe('errors in the app\'s log', () => {
  it('finds them and groups repeats of one fault under one signature', () => {
    const text = [
      'agentbox is running.',
      'zero: leftovers: could not list processes: Command failed: /bin/ps -E -ww -axo pid=',
      'zero: leftovers: could not list processes: Command failed: /bin/ps -E -ww -axo pid=',
      'TypeError: Cannot read properties of undefined (reading \'id\') at w-1a2b3c4d5e',
      '    at fold (/x/shared/work-items.mjs:12:3)',
      'TypeError: Cannot read properties of undefined (reading \'id\') at w-9f9f9f9f9f',
    ].join('\n');
    const found = errorLines(text);
    expect(found).toHaveLength(4);
    expect(new Set(found.map((e) => e.signature)).size).toBe(2);
  });

  it('passes ordinary lines', () => {
    expect(errorLines('agentbox is running.\n  http://127.0.0.1:5000/?token=abc\n  Stop it with control-C.')).toEqual([]);
  });
});

describe('memory over a session', () => {
  it('counts a climb past half again and 150 MB, and not a smaller or shorter one', () => {
    expect(growth([200e3, 210e3, 205e3, 400e3, 420e3, 430e3]).grew).toBe(true);
    expect(growth([200e3, 210e3, 205e3, 260e3, 270e3, 280e3]).grew).toBe(false);
    expect(growth([200e3, 600e3, 700e3]).grew).toBe(false);
  });
});

describe('the evidence kept when a copy is taken down', () => {
  // The first power test's copies were taken down with their ledgers, so two
  // "picked an option and got no answer" issues could not be checked after.
  it('keeps every project\'s ledger, each run\'s session log, the app\'s log and the stand-in\'s receipts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
    const state = { instance: root, storeRoot: path.join(root, 'store'), accountRoot: path.join(root, 'store', 'accounts', 'a'), log: path.join(root, 'app.log'), receipts: path.join(root, 'receipts') };
    const machinery = path.join(state.storeRoot, 'projects', `${state.accountRoot}/api`.replace(/[^A-Za-z0-9]/g, '-'));
    fs.mkdirSync(path.join(machinery, 'sessions', 'w-1'), { recursive: true });
    fs.writeFileSync(path.join(machinery, 'work-items.jsonl'), '{"id":"w-1"}\n');
    fs.writeFileSync(path.join(machinery, 'sessions', 'w-1', '1.log'), 'transcript');
    fs.writeFileSync(state.log, 'agentbox is running.\n');
    fs.mkdirSync(state.receipts);
    fs.writeFileSync(path.join(state.receipts, 'w-1.spawns.jsonl'), '{"at":1}\n');
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-'));
    keepEvidence(state, out);
    expect(fs.readFileSync(path.join(out, 'copy', 'ledger', 'api.jsonl'), 'utf8')).toBe('{"id":"w-1"}\n');
    expect(fs.readFileSync(path.join(out, 'copy', 'app.log'), 'utf8')).toContain('running');
    expect(fs.existsSync(path.join(out, 'copy', 'receipts', 'w-1.spawns.jsonl'))).toBe(true);
    // The second run's start loop could not be explained without them.
    expect(fs.readFileSync(path.join(out, 'copy', 'sessions', 'api', 'w-1', '1.log'), 'utf8')).toBe('transcript');
    expect(fs.existsSync(path.join(out, 'copy', 'ledger', 'sessions'))).toBe(false);
  });

  it('keeps what there is when a copy never got far', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-'));
    expect(() => keepEvidence({ instance: '/nonexistent', storeRoot: '/nonexistent/store', accountRoot: '/nonexistent/a', log: '/nonexistent/app.log', receipts: '/nonexistent/r' }, out)).not.toThrow();
  });
});

describe('the copy\'s processes', () => {
  it('counts the workers the app started, and not the tester\'s own Claude Code or anybody else\'s', () => {
    const state = { pid: 10, instance: '/tmp/i' };
    const table = [
      { pid: 10, ppid: 1, rss: 100, command: 'node bin/agentbox.mjs --dir /tmp/i/data' },
      { pid: 11, ppid: 10, rss: 50, command: 'node /tmp/i/bin/stub-claude-worker.mjs -p --output-format stream-json --permission-prompt-tool mcp__zero-approvals__approval_prompt' },
      { pid: 12, ppid: 11, rss: 20, command: 'node approval-prompt-server.mjs' },
      { pid: 13, ppid: 10, rss: 70, command: '/home/u/.local/share/claude/versions/2.1.302 -p --output-format stream-json --permission-prompt-tool mcp__zero-approvals__approval_prompt' },
      { pid: 20, ppid: 1, rss: 300, command: 'claude -p You are Maya --output-format stream-json' },
      { pid: 30, ppid: 1, rss: 400, command: '/opt/chrome --user-data-dir=/tmp/i/chrome-profile' },
    ];
    const p = instanceProcesses(state, table);
    expect(p.workers).toBe(2);
    expect(p.appKb).toBe(100);
    expect(p.childKb).toBe(140);
    expect(p.browserKb).toBe(400);
  });
});
