// ONE DOOR, ONE LIST.
//
// The header fold and the thread history were two timelines under one title
// that shared not a single line — 44 steps against 26 events on that row — and
// looked identical while doing it. A is the fold going away and each run
// hanging under the pickup that started it, inside the history.
//
// What is pinned here is the MATCH, because that is the part that can be wrong
// while the screen still looks perfect: a run credited to the wrong pickup
// reads exactly like a run credited to the right one. The fixture below is the
// real shape of her store — a worker claims its row as its first action, so the
// claim lands AFTER the session started, by 10 seconds when the machine is
// awake and by 52 minutes when it slept first (both measured on, 2026-08-14,
// nine sessions and ten claims).
//
// The rest is asserted against the source, because this repo has no DOM test
// environment (the reasoning is in shortcuts-swallow-their-key.test.mjs).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadEvents, withRuns } from '../renderer/src/thread-history.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const at = (hhmm) => Date.parse(`2026-08-14T${hhmm}:00`);
const claim = (ts) => ({ id: 'w-1', ts, source: 'agent', claim: { holder: 'mcp-1', leaseUntil: ts + 300_000 }, patch: { status: 'claimed' } });

// One session's trace, in the supervisor's real shape.
const trace = (startedAt, said) => ({
  startedAt,
  text: [
    '# a task',
    `# w-1 · spawned ${new Date(startedAt).toISOString()}`,
    '',
    `09:00:01  ${said}`,
    '09:00:04  [Bash] git status',
    '',
    `# exited (0) ${new Date(startedAt + 600_000).toISOString()}`,
  ].join('\n'),
});

describe('a run hangs under the pickup that started it', () => {
  // Her own row, the day she picked A: three pickups whose sessions started
  // seconds before them, one whose session started 52 minutes before it
  // because the laptop slept, and one with no session on disk at all.
  const lines = [
    { id: 'w-1', ts: at('08:00'), source: 'agent', patch: { title: 'the row', status: 'open', body: 'the ask' } },
    claim(at('08:23')),
    claim(at('09:56')),
    claim(at('13:07')),   // its session began at 12:15, before the machine slept
    claim(at('13:12')),   // this one left no trace on disk
    claim(at('14:39')),
  ];
  const sessions = [
    trace(at('08:22') + 50_000, 'Now the pure event mapping.'),
    trace(at('09:55') + 42_000, 'Now the renderer seam.'),
    trace(at('12:15'), 'Now the wiring in Focus.tsx.'),
    trace(at('14:38') + 48_000, 'Now the page she will actually open.'),
  ];

  const events = withRuns(threadEvents(lines), sessions);
  const pickups = events.filter((e) => e.pickup);

  it('gives each pickup the run that had already started when it happened', () => {
    expect(pickups.map((p) => p.runs?.[0]?.steps[0]?.text)).toEqual([
      'Now the pure event mapping.',
      'Now the renderer seam.',
      'Now the wiring in Focus.tsx.',
      undefined,
      'Now the page she will actually open.',
    ]);
  });

  // The nearest session AFTER a pickup is the next run, not this one. Matching
  // that way credited every run on her row to the wrong pickup, which is how a
  // 9:56pm line came to hold steps stamped 5:01am.
  it('never reaches forward for a run that had not started yet', () => {
    const late = withRuns(threadEvents([claim(at('08:00')), claim(at('10:00'))]), [
      trace(at('09:00'), 'the 9am run'),
    ]);
    expect(late[0].runs).toBeUndefined();
    expect(late[1].runs?.[0].steps[0].text).toBe('the 9am run');
  });

  it('says nothing at all for a claim whose session left no trace', () => {
    expect(pickups[3].runs).toBeUndefined();
  });

  it('loses no session: one older than every pickup still lands', () => {
    const orphaned = withRuns(threadEvents([claim(at('10:00'))]), [
      trace(at('08:00'), 'the run with no claim of its own'),
      trace(at('09:59'), 'the run that claimed'),
    ]);
    expect(orphaned[0].runs?.map((r) => r.steps[0].text)).toEqual([
      'the run with no claim of its own',
      'the run that claimed',
    ]);
  });

  it('leaves a row with no runs exactly as it was', () => {
    const bare = threadEvents(lines);
    expect(withRuns(bare, [])).toBe(bare);
  });
});

// WHERE THE RUNS WENT AFTERWARDS, and it is not this door. The match above
// still holds — it is how a run knows which pickup it began at — but the door
// itself is the conversation again, and the lines are in the task.
//
// The header fold from A's era stays gone. So does the live sentence that
// replaced it: under D the agent's lines are always showing while it works, and
// the sentence was the last of those lines printed twice.
describe('the run is in the task, and the task is the conversation', () => {
  const focus = read('renderer/src/components/Focus.tsx');
  const thread = read('renderer/src/components/Thread.tsx');

  // THE SECOND LIST IS GONE ALTOGETHER. What used to be behind the time was a
  // ledger of one-line sentences with the words folded away inside them; on the
  // row's whole conversation became the page, so that list had nothing left to
  // hold. `withRuns` did not go with it — it is the pickup-to- run match, still
  // the one copy, and item-thread.ts is what calls it now.
  it('has no second surface holding the same conversation', () => {
    expect(fs.existsSync(path.join(root, 'renderer/src/components/ThreadHistory.tsx'))).toBe(false);
    expect(focus).not.toMatch(/th-run|closedLine|tallyLine/);
  });

  // The exact register she rejected, and it went with the control it was on.
  it('leaves the rejected wording nowhere in the app', () => {
    expect(thread).not.toMatch(/show everything it typed|hide what it typed/);
  });

  it('has no second live sentence under the header', () => {
    expect(focus).not.toMatch(/WorkingNotes/);
    expect(fs.existsSync(path.join(root, 'renderer/src/components/Notes.tsx'))).toBe(false);
  });

  // AND NOW THERE IS NO SECOND SURFACE WHILE IT RUNS EITHER.
  //
  // The last thing that block did was stand between her and the conversation at
  // the one moment she most wanted it, which is while a worker was on the row.
  // The body of a task is now the thread and nothing else, whichever of her
  // three kinds it is: one she started in Agentbox, one with a worker on it right
  // now, one she imported from Claude Code.
  it('puts the conversation at the top of the task body, with nothing above it', () => {
    const body = focus.indexOf('className="focus-body markdown');
    expect(body).toBeGreaterThan(-1);
    expect(focus).not.toMatch(/<AgentLines/);
    expect(fs.existsSync(path.join(root, 'renderer/src/components/AgentLines.tsx'))).toBe(false);
    // The two readers, and between them every row in the app that has a
    // conversation. The row that says her tasks are not running has none, and
    // it is the one branch that is neither. The task reader is written across
    // several lines now, because it takes her opening message as a prop; what
    // is pinned is that the thread is the body, not how many lines its call
    // takes.
    expect(focus).toMatch(/\{agent && \(\s*<AgentThread/);
    expect(focus).toMatch(/!agent && \(?\s*<ItemThread/);
  });

  // A live run writes to its trace while she watches it, and the thread is what
  // has to notice.
  it('keeps reading the trace while a session is running', () => {
    const item = read('renderer/src/components/ItemThread.tsx');
    expect(item).toMatch(/setInterval\(read, REFRESH_MS\)/);
    expect(item).toMatch(/if \(!session\) return \(\) => \{ live = false; \};/);
  });
});
