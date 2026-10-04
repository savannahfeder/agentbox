// EVERY THING YOU DO ON A THREAD SHOWS IN IT, ONE QUIET LINE EACH (w-49b4e45403).
//
// What broke, measured on a thread that was snoozed three times and then
// answered by picking an option: the three snoozes were drawn as ONE grey line
// reading "You put it off", with no dates, because every ledger event that is
// not a message became a work line and consecutive work lines fold into one
// run whose summary de-duplicates the verb. On a real row the same fold
// produced "You put it off, wrote files": her snooze and the agent's file
// writes, merged into one sentence. And the pick, written to the ledger as
// "Option 1: <text>", was drawn as a message she typed.
//
// What it is now: each of your own actions is its own line with its time
// ("You snoozed it until Fri 9:00am"), it never folds into the agent's work,
// and a pick reads "You picked option 1" with the option beside it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadEvents, snoozeWords } from '../renderer/src/thread-history.ts';
import { itemThread } from '../renderer/src/item-thread.ts';
import { withoutTrailingWork } from '../renderer/src/trailing-work.ts';
import { groupWork } from '../shared/work-lines.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Thursday 1 October 2026, 2:32pm local.
const T = new Date(2026, 9, 1, 14, 32).getTime();
const min = 60_000;
const hr = 60 * min;
const day = 24 * hr;
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();

const RESULT = '**Sign it today.**\n\n## Options\n1. Sign the listing copy and send it today (recommended)\n2. Handle the screenshots later';
const opened = [
  { id: 'w-1', ts: T - hr, source: 'founder', patch: { title: 'Launch copy', status: 'open', body: 'Which file goes first?' } },
  { id: 'w-1', ts: T - 50 * min, source: 'agent', patch: { status: 'blocked', result: RESULT } },
];
const snoozes = [
  { id: 'w-1', ts: T, source: 'founder', patch: { runAt: at(2, 9) } },
  { id: 'w-1', ts: T + day + hr, source: 'founder', patch: { runAt: at(3, 9) } },
  { id: 'w-1', ts: T + 2 * day, source: 'founder', patch: { runAt: at(4, 10, 30) } },
];
const pick = { id: 'w-1', ts: T + 3 * day, source: 'founder', patch: { answer: 'Option 1: Sign the listing copy and send it today (recommended)', status: 'open' } };

const yours = (events) => events.filter((e) => e.kind === 'work' && e.yours);
// Everything of yours on the page: in the stream, and under the answer.
const everyLine = (built) => yours([...built.events, ...(built.after ?? [])]);

describe('snoozing a thread', () => {
  it('draws each snooze as its own line saying until when', () => {
    const lines = everyLine(itemThread([...opened, ...snoozes], []));
    expect(lines.map((e) => `${e.verb} ${e.subject}`)).toEqual([
      'You snoozed it until tomorrow 9:00am',
      'You snoozed it until tomorrow 9:00am',
      'You snoozed it until tomorrow 10:30am',
    ]);
    expect(lines.map((e) => e.at)).toEqual(snoozes.map((l) => l.ts));
  });

  it('never folds three snoozes into one run', () => {
    const events = itemThread([...opened, ...snoozes, pick], []).events;
    const nodes = groupWork(events, { min: 1 });
    expect(nodes.filter((n) => n.kind === 'run')).toEqual([]);
    expect(nodes.filter((n) => n.kind === 'work' && n.yours)).toHaveLength(4);
  });

  it('never folds a snooze into the agent work beside it', () => {
    const work = (ts) => ({ kind: 'work', at: ts, verb: 'wrote', subject: 'a.md', output: '', lines: 0, failed: false });
    const snooze = { kind: 'work', at: 2, verb: 'You snoozed it', subject: 'until 9:00am', output: '', lines: 0, failed: false, yours: true };
    const nodes = groupWork([work(1), snooze, work(3), work(4)], { min: 1 });
    expect(nodes.map((n) => n.kind === 'run' ? `run of ${n.items.length}` : n.verb))
      .toEqual(['run of 1', 'You snoozed it', 'run of 2']);
  });

  it('says the day when the snooze runs past tomorrow, and the date past a week', () => {
    expect(snoozeWords(at(1, 17), T)).toBe('until 5:00pm');
    expect(snoozeWords(at(2, 9), T)).toBe('until tomorrow 9:00am');
    expect(snoozeWords(at(5, 9), T)).toBe('until Mon 9:00am');
    expect(snoozeWords(at(12, 9), T)).toMatch(/^until \w+, Oct 12 9:00am$/);
  });

  it('says it came back when you bring it back early', () => {
    const back = { id: 'w-1', ts: T + hr, source: 'founder', patch: { runAt: 0 } };
    const lines = everyLine(itemThread([...opened, snoozes[0], back], []));
    expect(lines.map((e) => e.verb)).toEqual(['You snoozed it', 'You brought it back']);
  });

  it('leaves an agent pausing the thread as the agent\'s, not yours', () => {
    const paused = { id: 'w-1', ts: T, source: 'agent', patch: { runAt: at(2, 9) } };
    const events = threadEvents([...opened, paused]);
    const e = events.find((x) => x.said === 'It paused this');
    expect(e).toBeTruthy();
    expect(e.who).toBe('agent');
  });

  it('keeps the snoozes after the answer under the answer, not above it', () => {
    const built = itemThread([...opened, ...snoozes], []);
    expect(built.outcome?.text).toBe(RESULT);
    // Above the answer: nothing of yours. Under it: the three snoozes.
    expect(yours(built.events)).toHaveLength(0);
    expect(built.after.map((e) => e.verb)).toEqual(['You snoozed it', 'You snoozed it', 'You snoozed it']);
  });

  it('stays on screen while an agent is working, unlike its trailing commands', () => {
    const snooze = { kind: 'work', at: 2, verb: 'You snoozed it', subject: '', output: '', lines: 0, failed: false, yours: true };
    const work = { kind: 'work', at: 3, verb: 'ran', subject: 'ls', output: '', lines: 0, failed: false };
    expect(withoutTrailingWork([{ at: 1, who: 'it', text: 'hi' }, snooze, work])).toEqual([{ at: 1, who: 'it', text: 'hi' }, snooze]);
  });
});

describe('picking an option', () => {
  it('reads "You picked option 1", with the option and without the recommendation', () => {
    const [line] = yours(itemThread([...opened, pick], []).events);
    expect(line.verb).toBe('You picked option 1');
    expect(line.subject).toBe('Sign the listing copy and send it today');
    expect(line.at).toBe(pick.ts);
  });

  it('is no longer drawn as a message you typed', () => {
    const events = itemThread([...opened, pick], []).events;
    expect(events.some((e) => e.kind !== 'work' && /^Option 1:/.test(e.text ?? ''))).toBe(false);
  });

  it('answers the agent, so its result stays above the pick instead of being lifted under it', () => {
    const built = itemThread([...opened, pick], []);
    expect(built.outcome).toBeNull();
    const i = built.events.findIndex((e) => e.kind !== 'work' && e.who === 'it');
    const j = built.events.findIndex((e) => e.kind === 'work' && e.yours);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(j).toBeGreaterThan(i);
  });

  it('leaves a typed reply that only mentions an option as your message', () => {
    for (const answer of ['Option 1 please', 'Option 1: yes\n\nbut change the headline first', 'option one sounds right']) {
      const events = itemThread([...opened, { ...pick, patch: { answer } }], []).events;
      expect(yours(events)).toHaveLength(0);
      expect(events.some((e) => e.kind !== 'work' && e.who === 'you' && e.text === answer)).toBe(true);
    }
  });
});

describe('the line on screen', () => {
  it('is drawn as its own quiet line with its time, not as a work line', () => {
    const src = read('renderer/src/components/Thread.tsx');
    expect(src).toMatch(/is-act/);
    expect(src).toMatch(/<ActLine/);
    expect(read('renderer/src/styles.css')).toMatch(/\.act-line\b/);
  });
});
