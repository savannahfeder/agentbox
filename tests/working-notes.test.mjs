// The working notes read a session trace into a diary. What is MISSING from a
// diary has no symptom — a parser that drops half the steps still draws a
// perfectly plausible panel — so every rule that decides what survives the read
// is pinned here.
//
// The fixtures below are the supervisor's real output shape (traceStreamLine in
// main/supervisor.mjs), including the two lines that actually broke earlier
// readings: a sign-off that repeats the result verbatim, and an "API Error"
// that is the only thing a turned-away run ever says.

import { describe, it, expect } from 'vitest';
import { readNotes, closedLine, tallyLine, spanLabel, liveStep, humanFailure } from '../renderer/src/notes.ts';

const HOUR = 3_600_000;

// The same moment on HER clock, whatever zone this suite runs in.
function herClock(iso) {
  const d = new Date(Date.parse(iso));
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

function trace(startedAt, body) {
  return { startedAt, text: `# a task\n# w-x · spawned ${new Date(startedAt).toISOString()}\n\n${body}` };
}

describe('the diary is the agent\'s own sentences', () => {
  const notes = readNotes([trace(Date.parse('2026-08-12T17:16:00Z'), [
    '17:16:04  Took the job. Reading the scope document your answer was about.',
    '17:16:06  [mcp__agentbox__claim_work_item] w-6d21470b94',
    '17:16:31  [Read] /Users/you/Desktop/dev/zero/CLAUDE.md',
    '17:17:02  Checked two claims against the real code instead of trusting the session before it.',
    '17:17:14  [Bash] grep -rn skill main/ renderer/src',
    '17:18:41  [mcp__agentbox__create_work_item] agentbox',
    '17:18:52  [mcp__agentbox__create_work_item] agentbox',
    '17:19:03  [Write] /Users/you/Zero/agentbox/STATE.md',
    '17:20:11  Closed this row with the result above.',
    '',
    '17:20:12  == RESULT (success · 27 turns) ==',
    'Done. Your answer is enacted and the row is closed.',
    '',
    '# exited (0) 2026-08-12T17:20:14.000Z',
  ].join('\n'))]);

  it('keeps the sentences and counts the actions', () => {
    expect(notes.steps.map((s) => s.text)).toEqual([
      'Took the job. Reading the scope document your answer was about.',
      'Checked two claims against the real code instead of trusting the session before it.',
      'Closed this row with the result above.',
    ]);
    expect(notes.actions).toBe(6);
  });

  it('counts what it can prove and nothing else', () => {
    expect(notes.filed).toBe(2);
    expect(notes.files).toBe(1);
    expect(notes.failed).toBe(false);
  });

  it('hangs each action under the step it happened during', () => {
    expect(notes.steps[0].actions).toBe(2);
    expect(notes.steps[1].actions).toBe(4);
    expect(notes.steps[2].actions).toBe(0);
  });

  // THE TRACE'S CLOCK IS UTC. The supervisor stamps each line with `new
  // Date.toISOString.slice(11, 19)`, so the digits in the file are not the
  // digits on her wall: printing them straight out wrote her 10:01pm as 5:01am,
  // and a run that took one evening read as if it had run backwards through the
  // night. The second line is the guard, and it used to read
  // `.not.toBe('5:16pm')`, which is her wall clock for that moment and only
  // hers. On a machine set to UTC the right answer IS 5:16pm, so the guard
  // failed the build for being correct. Caught on a GitHub macOS runner on
  // 2026-08-25, the first machine other than hers this suite has ever run on.
  // What the guard is really for is that the reader converts the moment instead
  // of slicing the digits out of the ISO string, and `17:16` is those digits in
  // every zone there is.
  it('reads the clock the way she does, out of a trace written in UTC', () => {
    expect(notes.steps[0].time).toBe(herClock('2026-08-12T17:16:04Z'));
    expect(notes.steps[0].time).not.toContain('17:16');
  });

  // A run that crosses midnight in UTC keeps going forwards: the date comes
  // from the session's own start, not from the line.
  it('rolls the day forward when a run crosses midnight in UTC', () => {
    const overnight = readNotes([trace(Date.parse('2026-08-12T23:50:00Z'), [
      '23:55:00  Late.',
      '00:20:00  Later.',
    ].join('\n'))]);
    expect(overnight.steps.map((s) => s.time)).toEqual([
      herClock('2026-08-12T23:55:00Z'),
      herClock('2026-08-13T00:20:00Z'),
    ]);
  });

  it('says how long it took, measured, not rounded up', () => {
    expect(closedLine(notes)).toBe('what it did · 3 steps in 4 minutes');
    expect(tallyLine(notes)).toBe('4 minutes · 3 steps · 6 actions · 1 file written · 2 tasks filed');
  });
});

// A worker ends by typing its whole result into the transcript. That result is
// already printed above the notes, and printing it again as the final step is
// how a two-line panel became a page.
it('drops the sign-off that only repeats the result', () => {
  const notes = readNotes([trace(Date.parse('2026-08-12T10:00:00Z'), [
    '10:00:05  Starting on the frames.',
    '10:00:09  [Bash] git status',
    '10:02:00  **Built and on `zero/w-000e11c85b`**, unmerged.',
    'Some more of the same long message.',
    '',
    '10:02:01  == RESULT (success · 9 turns) ==',
    '**Built and on `zero/w-000e11c85b`**, unmerged.',
    '',
    '# exited (0) 2026-08-12T10:02:03.000Z',
  ].join('\n'))]);
  expect(notes.steps.map((s) => s.text)).toEqual(['Starting on the frames.']);
});

it('carries a step that ran onto a second line', () => {
  const notes = readNotes([trace(Date.parse('2026-08-12T10:00:00Z'), [
    '10:00:05  Found it: the transform is applied in both places,',
    'so only one of them can keep writing it.',
    '10:00:09  [Edit] src/tilt.ts',
    '# exited (0) 2026-08-12T10:00:20.000Z',
  ].join('\n'))]);
  expect(notes.steps[0].text).toBe('Found it: the transform is applied in both places,\nso only one of them can keep writing it.');
});

describe('a run that was turned away', () => {
  const notes = readNotes([trace(Date.parse('2026-08-12T14:10:00Z'), [
    '14:10:02  Started on your answer.',
    '',
    '14:10:03  == RESULT (success ERROR · 1 turns) ==',
    'API Error: Claude AI usage limit reached. Your weekly limit resets at 4pm.',
    '',
    '# exited (1) 2026-08-12T14:10:03.000Z',
  ].join('\n'))]);

  it('says so, in words, as the last thing that happened', () => {
    expect(notes.failed).toBe(true);
    expect(notes.steps.at(-1)).toMatchObject({
      failed: true,
      text: 'Claude turned the session away: the usage limit is used up, and resets at 4pm.',
    });
  });

  it('leads with what happened rather than what it did', () => {
    expect(closedLine(notes)).toBe('what happened · stopped after 3 seconds');
  });

  it('never softens a failure it does not recognise into a friendlier lie', () => {
    expect(humanFailure('API Error: 529 overloaded_error')).toBe('529 overloaded_error');
    expect(humanFailure('')).toBe('The run stopped without saying why.');
  });
});

// A KILLED WORKER LEAVES ITS RESULT AND NOTHING AFTER IT. The supervisor writes
// the exit line once the CLI returns, and one that is killed never returns, so
// the session looked open forever and its span grew while she read it: two of
// the nine runs on said 8h 37m and 6h 37m of work that took two and five
// minutes (2026-08-14). A run that reported a result is over.
it('ends a run at the result it reported when nothing wrote its exit line', () => {
  const started = Date.parse('2026-08-14T19:39:13Z');
  const killed = readNotes([trace(started, [
    '19:39:20  Reading the branch.',
    '',
    '19:41:40  == RESULT (error_during_execution ERROR · 28 turns) ==',
  ].join('\n'))]);
  expect(killed.openSince).toBe(null);
  expect(killed.endedAt).toBe(Date.parse('2026-08-14T19:41:40Z'));
  expect(closedLine(killed, started + 8 * 3_600_000)).toBe('what happened · stopped after 2 minutes');
});

// A continuation is not a new story; it is the next few lines of this one. And
// a first attempt that died followed by one that finished is a FINISHED item:
// reporting the run as failed would be a fresh way of telling her work did not
// happen when it did.
it('reads every session on the item as one diary, and takes the last run\'s fate', () => {
  const start = Date.parse('2026-08-12T09:00:00Z');
  const notes = readNotes([
    trace(start + HOUR, [
      '10:00:01  Picking it back up after the limit reset.',
      '# exited (0) 2026-08-12T10:05:00.000Z',
    ].join('\n')),
    trace(start, [
      '09:00:01  Started on your answer.',
      '09:00:02  == RESULT (success ERROR · 1 turns) ==',
      'API Error: Claude AI usage limit reached.',
      '# exited (1) 2026-08-12T09:00:02.000Z',
    ].join('\n')),
  ]);
  expect(notes.sessions).toBe(2);
  expect(notes.failed).toBe(false);
  expect(notes.steps.map((s) => s.text)).toEqual([
    'Started on your answer.',
    'Claude turned the session away: the usage limit is used up.',
    'Picking it back up after the limit reset.',
  ]);
});

it('has nothing to draw when no session has ever run', () => {
  expect(readNotes([])).toBe(null);
});

// The live line comes from the supervisor's in-memory tail, which carries
// summarised tool calls beside the agent's own sentences. Only the sentences
// are steps; "tool: Bash" is exactly the terminal noise this replaced.
describe('the step it is on right now', () => {
  it('is the newest thing the agent said, not the newest thing it ran', () => {
    expect(liveStep(['tool: Read', 'Found it: the transform is in both places.', 'tool: Edit', 'tool: Bash']))
      .toBe('Found it: the transform is in both places.');
  });

  it('is nothing at all when it has only run tools so far', () => {
    expect(liveStep(['tool: Read', 'tool: Grep'])).toBe(null);
    expect(liveStep([])).toBe(null);
    expect(liveStep(undefined)).toBe(null);
  });
});

it('never rounds a span up', () => {
  expect(spanLabel(3_000)).toBe('3 seconds');
  expect(spanLabel(90_000)).toBe('1 minute');
  expect(spanLabel(5 * 60_000)).toBe('5 minutes');
  expect(spanLabel(72 * 60_000)).toBe('1h 12m');
});

// TIME WORKED IS NOT TIME ELAPSED, and on her real store the gap is days: one
// item ran across 24 sessions spanning 45 hours. Reporting the span between the
// first spawn and the last exit would tell her a machine ground on one row for
// two days.
it('counts the time the agents were awake, not the time the row existed', () => {
  const day = 24 * HOUR;
  const start = Date.parse('2026-08-10T09:00:00Z');
  const notes = readNotes([
    { startedAt: start, text: '09:00:01  First pass.\n# exited (0) 2026-08-10T09:04:00.000Z' },
    { startedAt: start + day, text: '09:00:01  Picked it back up a day later.\n# exited (0) 2026-08-11T09:06:00.000Z' },
  ]);
  expect(closedLine(notes)).toBe('what it did · 2 steps in 10 minutes');
});

// 45 of the 648 items with traces on her store narrated nothing at all. "0
// steps" is a true sentence that reads like a broken panel, so the line counts
// what there is instead.
it('says what a silent run did rather than announcing zero', () => {
  const notes = readNotes([{
    startedAt: Date.parse('2026-08-12T09:00:00Z'),
    text: ['09:00:01  [Bash] ls', '09:00:04  [Read] STATE.md', '# exited (0) 2026-08-12T09:03:00.000Z'].join('\n'),
  }]);
  expect(notes.steps).toEqual([]);
  expect(closedLine(notes)).toBe('what it did · 2 actions in 3 minutes, none of them said out loud');
});

it('says a run that got nowhere read nothing, rather than counting zero', () => {
  const notes = readNotes([{
    startedAt: Date.parse('2026-08-12T14:10:00Z'),
    text: ['14:10:02  Started on your answer.', '14:10:03  == RESULT (success ERROR · 1 turns) ==', 'API Error: Claude AI usage limit reached.', '# exited (1) 2026-08-12T14:10:03.000Z'].join('\n'),
  }]);
  expect(tallyLine(notes)).toBe('3 seconds · 2 steps · nothing read, nothing changed');
});
