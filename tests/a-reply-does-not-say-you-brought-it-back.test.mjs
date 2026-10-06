// A REPLY DOES NOT ALSO SAY "BROUGHT IT BACK" (w-2b0cd0f741).
//
// What broke, seen on a conversation with a teammate on 2026-10-05: it was
// snoozed until 3:36pm, they answered "Working on it" at 2:19pm, and the line
// under their message read "Brought it back  TODAY 2:19PM". They had not done
// that. A reply lifts a snooze (`replyClearsSchedule`, list-rules), so the app
// writes `runAt: 0` a few milliseconds after the answer, and the history drew
// that write as a second thing they did. Their words: "I'm not sure why I did
// that."
//
// What it is now: a snooze lifted by your own reply is part of the reply and
// says nothing. Bringing a thread back by hand still says so, and so does one
// brought back a while after a reply, or by somebody else.

import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history.ts';

const T = new Date(2026, 9, 5, 14, 19).getTime();
const min = 60_000;

const opened = [
  { id: 'w-1', ts: T - 7 * 60 * min, source: 'founder', by: 'them', patch: { title: 'Send gives no sign', status: 'open', body: 'Additional: …' } },
  { id: 'w-1', ts: T - 3 * 60 * min, source: 'founder', by: 'me', patch: { runAt: T + 77 * min } },
];
const reply = { id: 'w-1', ts: T, source: 'founder', by: 'me', patch: { answer: 'Working on it' } };
const lift = (after, by = 'me', source = 'founder') => ({ id: 'w-1', ts: T + after, source, by, patch: { runAt: 0 } });

const said = (lines) => threadEvents(lines).map((e) => e.said);

describe('a snooze lifted by your own reply', () => {
  it('says nothing beside the reply', () => {
    expect(said([...opened, reply, lift(40)])).toEqual(['You opened this', 'You snoozed it', 'You replied']);
  });

  it('still says nothing when the write lands a few seconds late', () => {
    expect(said([...opened, reply, lift(20_000)])).not.toContain('You brought it back');
  });
});

describe('a thread brought back on purpose', () => {
  it('says so when there was no reply before it', () => {
    expect(said([...opened, lift(0)])).toContain('You brought it back');
  });

  it('says so when it comes minutes after the reply', () => {
    expect(said([...opened, reply, lift(5 * min)])).toContain('You brought it back');
  });

  it('says so when somebody else brought it back right after you replied', () => {
    expect(said([...opened, reply, lift(40, 'ana')])).toContain('You brought it back');
  });

  it('leaves an agent letting it run alone', () => {
    expect(said([...opened, reply, lift(40, undefined, 'agent')])).toContain('It let this run now');
  });
});
