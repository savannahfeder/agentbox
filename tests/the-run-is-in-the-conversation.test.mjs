// THE RUN STAYS IN THE TASK — and as of 2026-08-23 it stays in the
// CONVERSATION, not in a block of its own above it.
//
// Her two picks on, 2026-08-16, built that block: three of the worker's lines
// showing while it ran, one sentence with a count once it finished.
//
// SO THE BLOCK IS GONE AND THE REQUIREMENT UNDER IT SURVIVES. D was "while it
// runs, the feed IS the task", and the lines a worker is typing are still on
// the screen as it types them; they are simply in the thread, at the moment
// each was typed, rather than in a panel above her own message. Her reason for
// pulling finished runs out from behind the time under the title holds for the
// same reason: nothing here is behind a door she has to discover.
//
// What is pinned here is the READING of the trace, because it can be wrong
// while the screen still looks perfect: a parser that drops half the lines
// draws a plausible conversation. The rest is asserted against the source,
// because this repo has no DOM test environment (the reasoning is in
// shortcuts-swallow-their-key.test.mjs).
//
// This file was tests/the-run-stays-in-the-task.test.mjs until the block went.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceLines } from '../renderer/src/terminal.ts';
import { itemThread } from '../renderer/src/item-thread.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// One session, in the supervisor's real shape: a `#` header, "HH:MM:SS  text"
// for a sentence the agent wrote, "HH:MM:SS  [Tool] hint" for an action it
// took, its RESULT at the end, and an exit line under that.
const startedAt = Date.parse('2026-08-16T09:12:00Z');
const session = {
  startedAt,
  text: [
    '# the card frames are built',
    `# w-p3 · spawned ${new Date(startedAt).toISOString()}`,
    '',
    '09:12:04  Took the job. Reading your answer before anything else.',
    '09:12:08  [Read] strategy/art-style.md',
    '09:12:16  [Bash] git log --oneline -5 main',
    '09:12:30  You turned down all three frames,',
    'so there is nothing here to merge.',
    '09:12:37  stderr: some npm noise nobody reads',
    '09:13:40  All 218 tests pass.',
    '09:14:32  == RESULT (ok) ==',
    'Closed the task with the answer above.',
    'Every word of the result, which is already printed above this block.',
    `# exited (0) ${new Date(startedAt + 152_000).toISOString()}`,
  ].join('\n'),
};

describe('every line the agent typed, and nothing else', () => {
  const lines = traceLines(session);

  it('keeps what it said and what it ran, in the order it happened', () => {
    expect(lines.map((l) => l.kind)).toEqual(['say', 'tool', 'tool', 'say', 'say']);
    expect(lines[0].text).toBe('Took the job. Reading your answer before anything else.');
    expect(lines[1].text).toBe('[Read] strategy/art-style.md');
    expect(lines[4].text).toBe('All 218 tests pass.');
  });

  it('drops the header, the stderr noise and the result block', () => {
    const text = lines.map((l) => l.text).join('\n');
    expect(text).not.toMatch(/card frames are built|stderr|Closed the task|Every word of the result/);
  });

  // This used to assert the two lines came back joined by a SPACE, and that was
  // the flattening undid. They are still ONE message and they still read as one
  // sentence on the screen — the pane renders markdown with no remark-breaks,
  // so a single newline inside a paragraph IS a space — but the agent's own
  // line survives the read, which is what lets a paragraph break, a list or a
  // fenced block survive with it.
  it('keeps a sentence that ran onto a second line, as one message', () => {
    expect(lines[3].kind).toBe('say');
    expect(lines[3].text).toBe('You turned down all three frames,\nso there is nothing here to merge.');
    expect(lines.filter((l) => l.kind === 'say')).toHaveLength(3);
  });

  it('reads the clock in the time zone she is sitting in', () => {
    const local = new Date(startedAt);
    const hour = local.getHours() % 12 === 0 ? 12 : local.getHours() % 12;
    expect(lines[0].time).toBe(`${hour}:${String(local.getMinutes() + 0).padStart(2, '0')}:04`);
    expect(lines[0].at).toBe(startedAt + 4_000);
  });

  it('rolls a run that crosses midnight forward instead of backwards', () => {
    const [before, after] = traceLines({
      startedAt: Date.parse('2026-08-16T23:50:00Z'),
      text: ['23:50:01  the last line of the day', '00:03:02  the first line of the next'].join('\n'),
    });
    expect(before.text).toBe('the last line of the day');
    expect(after.text).toBe('the first line of the next');
  });

  it('says nothing at all for a session with nothing in it', () => {
    expect(traceLines({ startedAt, text: '' })).toEqual([]);
  });
});

// THE BLOCK IS GONE, ALL OF IT. Deleting the component and leaving its CSS, or
// leaving one branch of Focus.tsx still reaching for it, is exactly the "dead
// components in the water" she named in the same answer.
describe('the terminal at the top of a running task', () => {
  it('has no component left', () => {
    expect(fs.existsSync(path.join(root, 'renderer/src/components/AgentLines.tsx'))).toBe(false);
  });

  it('is drawn by nothing in the app', () => {
    const src = ['renderer/src/components/Focus.tsx', 'renderer/src/App.tsx'].map(read).join('\n');
    expect(src).not.toMatch(/<AgentLines|AgentLines'/);
  });

  // The four helpers only that block called. A label with no caller is the same
  // dead weight as a component with no caller.
  it('left no labels behind it', () => {
    const term = read('renderer/src/terminal.ts');
    expect(term).not.toMatch(/finishedSentence|showAllLabel|hideLabel|fewerLabel|export const WINDOW/);
    expect(term).toMatch(/export function traceLines/);
  });

  it('left no stylesheet rules behind it', () => {
    const css = read('renderer/src/styles.css');
    const classes = ['run-block', 'run-head', 'run-shut', 'run-link', 'run-lines', 'run-row', 'run-time', 'run-say', 'run-tool', 'run-stopped'];
    for (const cls of classes) {
      expect(css).not.toMatch(new RegExp(`^\\.${cls}[\\s,{:.]`, 'm'));
    }
  });

  // The words that only ever appeared on that block.
  it('says none of its copy anywhere in the app', () => {
    const dir = path.join(root, 'renderer/src/components');
    const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    expect(src).not.toMatch(/What the agent is doing/);
  });
});

// D SURVIVES THE BLOCK.: the lines the worker is typing right now are on the
// screen, in the thread, at the time each was typed. The old shape left them
// OUT of the thread on purpose, because they were drawn above it. Nothing draws
// them above it any more, so leaving them out would simply be losing them.
describe('a run that is happening right now', () => {
  const at = (hhmm) => Date.parse(`2026-08-23T${hhmm}:00Z`);
  const ledger = [
    { id: 'w-1', ts: at('09:00'), source: 'founder', patch: { title: 'Make the chats one screen', body: 'Only one component please.' } },
    { id: 'w-1', ts: at('09:05'), source: 'system', claim: { holder: 'mcp-1', leaseUntil: at('10:05') }, patch: { status: 'claimed' } },
  ];
  const trace = {
    startedAt: at('09:05'),
    text: [
      '09:05:10  Took the job. Reading the two components before touching anything.',
      '09:05:22  [Read] renderer/src/components/Thread.tsx',
    ].join('\n'),
  };

  it('puts its lines in the conversation while it is still running', () => {
    const said = itemThread(ledger, [trace]).events.map((e) => e.text ?? e.verb);
    expect(said).toContain('Took the job. Reading the two components before touching anything.');
  });

  it('takes no live-run argument any more, because there is nowhere else to draw one', () => {
    expect(read('renderer/src/item-thread.ts')).not.toMatch(/liveRun/);
    expect(read('renderer/src/components/ItemThread.tsx')).not.toMatch(/liveRun/);
  });

  // The thread is re-read while a worker is on the row, or the newest line never
  // arrives and the screen is the stale card she filed this row about.
  it('keeps reading the trace while a session is up', () => {
    const src = read('renderer/src/components/ItemThread.tsx');
    expect(src).toMatch(/if \(!session\) return \(\) => \{ live = false; \};/);
    expect(src).toMatch(/setInterval\(read, REFRESH_MS\)/);
  });
});
