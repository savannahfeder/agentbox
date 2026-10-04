// A STOPPED RUN DOES NOT JUMP TO TOMORROW AND SIT UNDER THE LIVE ONE.
//
// 2026-10-04. A thread whose agent was running again ended on "The agent ·
// Mon, Oct 5 11:30am · Failed to authenticate: OAuth session expired and could
// not be refreshed", below everything the running agent had written since.
// It read as a live problem. It was a run from 11:30 that morning, drawn as
// tomorrow. Measured off the real trace: the run was spawned at
// 18:30:28.097Z and its only line was stamped "18:30:28". A trace line carries
// a time and no date, and `momentOf` added a day to any line earlier than the
// session's start, so 97 milliseconds made it 86,399,903ms later than it was,
// and a message from tomorrow sorts last forever.
//
// And the words on that line were the CLI's own, which this app never prints
// (shared/spawn-trouble.mjs). The thread now says what happened in ours.

import { describe, it, expect } from 'vitest';
import { momentOf } from '../renderer/src/notes.ts';
import { traceLines } from '../renderer/src/terminal.ts';
import { itemThread } from '../renderer/src/item-thread.ts';

const SPAWNED = Date.UTC(2026, 9, 4, 18, 30, 28, 97);
const DAY = 86_400_000;
const HER_WORDS = 'Failed to authenticate: OAuth session expired and could not be refreshed';

// The trace exactly as the supervisor wrote it, minus the title line.
const deadTrace = [
  '# w-test · spawned 2026-10-04T18:30:28.097Z · continuation (the founder answered)',
  '',
  `18:30:28  ${HER_WORDS}`,
  '',
  '18:30:28  == RESULT (success ERROR · 1 turns) ==',
  HER_WORDS,
  '',
  '# exited (1) 2026-10-04T18:30:29.848Z',
].join('\n');

describe('the date a trace line is put back on', () => {
  it('her case: a line in the same second the run started is that second, not tomorrow', () => {
    expect(momentOf(SPAWNED, 18, 30, 28)).toBe(Date.UTC(2026, 9, 4, 18, 30, 28));
  });

  it('a line one second later is one second later', () => {
    expect(momentOf(SPAWNED, 18, 30, 29)).toBe(Date.UTC(2026, 9, 4, 18, 30, 29));
  });

  it('must still roll a run that crosses midnight UTC onto the next day', () => {
    expect(momentOf(Date.UTC(2026, 9, 4, 23, 59, 50, 500), 0, 0, 5)).toBe(Date.UTC(2026, 9, 5, 0, 0, 5));
  });

  it('a line a whole second before the start still rolls, as it always has', () => {
    expect(momentOf(SPAWNED, 18, 30, 27)).toBe(Date.UTC(2026, 9, 4, 18, 30, 27) + DAY);
  });
});

describe('the thread', () => {
  it('draws the stopped run above a later run, not under it', () => {
    const later = Date.UTC(2026, 9, 4, 19, 1, 21, 694);
    const liveTrace = '19:01:32  Claiming the thread again and checking what the builders saved.';
    const thread = itemThread([], [
      { startedAt: SPAWNED, text: deadTrace },
      { startedAt: later, text: liveTrace },
    ]);
    const said = thread.events.filter((e) => e.kind !== 'work').map((e) => e.text);
    expect(said[said.length - 1]).toMatch(/^Claiming the thread again/);
    for (const e of thread.events) expect(e.at ?? 0).toBeLessThan(later + DAY / 2);
  });

  it('says what stopped the run in our words, never the tool\'s', () => {
    const lines = traceLines({ startedAt: SPAWNED, text: deadTrace });
    const text = lines.map((l) => l.text).join(' ');
    expect(text).not.toMatch(/oauth|refresh/i);
    expect(text).toMatch(/signed out/i);
  });

  it('must NOT touch the agent\'s own words that merely mention signing in', () => {
    const prose = [
      '18:30:28  The login page now says Failed to authenticate when the password is wrong.',
      '',
      '18:31:00  == RESULT (success · 3 turns) ==',
      'Done.',
      '# exited (0) 2026-10-04T18:31:01.000Z',
    ].join('\n');
    const lines = traceLines({ startedAt: SPAWNED, text: prose });
    expect(lines[0].text).toBe('The login page now says Failed to authenticate when the password is wrong.');
  });
});
