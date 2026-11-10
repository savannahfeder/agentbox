// A REPLY SET FOR LATER SAYS WHEN IT SENDS, IN THE THREAD (w-54cdf7c768).
//
// What broke, found by a power tester on 2026-11-04: she set a reply for 8:16
// on a thread whose agent was still working and pressed Send at 8:02. The
// thread drew "Moved to Later until 8:16am", then her words under "You 8:02am"
// as if they had gone, then the running agent's "Thinking just now". She could
// not tell whether the agent had her note now, at 8:16, or twice. It had not:
// the reply waits on the row for its time (main/ipc.mts writes the time, then
// the words). Only the drawing said otherwise.
//
// Measured off the tester's own ledger. The reply's words and its time are
// two founder lines a few milliseconds apart, the words first since the same
// day's fix (tests/a-reply-can-wait-for-a-time.test.mts).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { itemThread } from '../renderer/src/item-thread.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const T = new Date(2026, 10, 4, 8, 2).getTime();
const SENDS = new Date(2026, 10, 4, 8, 16).getTime();
const opened = [
  { id: 'w-1', ts: T - 3_600_000, source: 'founder', patch: { title: 'Onboarding', status: 'open', body: 'Make the next step obvious.' } },
  { id: 'w-1', ts: T - 60_000, source: 'agent', patch: { status: 'blocked', result: 'Done the first screen.' } },
];
const later = [
  { id: 'w-1', ts: T, source: 'founder', patch: { answer: 'And make the button go to /start', status: 'open' } },
  { id: 'w-1', ts: T + 4, source: 'founder', patch: { runAt: SENDS } },
];
const reply = (events) => events.find((e) => e.field === 'answer');

describe('a reply set for later', () => {
  it('is drawn as a reply that sends at its time', () => {
    const events = threadEvents([...opened, ...later]);
    expect(reply(events)).toMatchObject({ who: 'you', words: 'And make the button go to /start', sendsAt: SENDS });
  });

  it('is not also drawn as the thread moved to Later', () => {
    const events = threadEvents([...opened, ...later]);
    expect(events.some((e) => e.said === 'You moved it to Later')).toBe(false);
  });

  it('carries its time onto the message the conversation draws', () => {
    const built = itemThread([...opened, ...later], []);
    const mine = [...built.events, ...(built.after ?? [])].find((e) => e.who === 'you' && e.text === 'And make the button go to /start');
    expect(mine?.sendsAt).toBe(SENDS);
  });

  it('says "Sends" and the time in the message head, where the time goes', () => {
    expect(read('renderer/src/components/Thread.tsx')).toMatch(/e\.sendsAt && e\.sendsAt > Date\.now\(\)[\s\S]{0,160}Sends \$\{laterHint\(e\.sendsAt\)\}/);
  });
});

describe('what stays as it was', () => {
  it('a reply and then the thread put off later on are two things you did', () => {
    const apart = [later[0], { ...later[1], ts: T + 10 * 60_000 }];
    const events = threadEvents([...opened, ...apart]);
    expect(events.some((e) => e.said === 'You moved it to Later')).toBe(true);
    expect(reply(events)?.sendsAt).toBeUndefined();
  });

  it('a thread put off and then answered is two things too', () => {
    const before = [{ ...later[1], ts: T - 10 * 60_000 }, later[0]];
    const events = threadEvents([...opened, ...before]);
    expect(events.some((e) => e.said === 'You moved it to Later')).toBe(true);
    expect(reply(events)?.sendsAt).toBeUndefined();
  });

  it('an agent pausing the thread after your reply is the agent\'s', () => {
    const paused = [later[0], { ...later[1], source: 'agent' }];
    const events = threadEvents([...opened, ...paused]);
    expect(events.some((e) => e.said === 'It paused this')).toBe(true);
    expect(reply(events)?.sendsAt).toBeUndefined();
  });

  it('a plain reply has no send time', () => {
    const events = threadEvents([...opened, later[0]]);
    expect(reply(events)?.sendsAt).toBeUndefined();
  });
});

describe('the line under the thread while the reply waits', () => {
  const row = (over = {}) => ({
    product: 'p', id: 'w-1', status: 'open', answer: 'And make the button go to /start', runAt: SENDS,
    wrote: { answer: { ts: T, source: 'founder' }, runAt: { ts: T + 4, source: 'founder' } },
    ...over,
  });

  it('knows the row holds a reply set for later', async () => {
    const { replyWaitsUntil } = await import('../renderer/src/threads/composer-rules.ts');
    expect(replyWaitsUntil(row(), T + 60_000)).toBe(SENDS);
  });

  it('and not once it has gone, nor for a row put off on its own, nor for an agent\'s pause', async () => {
    const { replyWaitsUntil } = await import('../renderer/src/threads/composer-rules.ts');
    expect(replyWaitsUntil(row(), SENDS + 1)).toBe(0);
    expect(replyWaitsUntil(row({ wrote: { runAt: { ts: T - 600_000, source: 'founder' }, answer: { ts: T + 4, source: 'founder' } } }), T)).toBe(0);
    expect(replyWaitsUntil(row({ wrote: { runAt: { ts: T, source: 'agent' }, answer: { ts: T + 4, source: 'founder' } } }), T)).toBe(0);
    expect(replyWaitsUntil(row({ answer: '(withdrawn)' }), T)).toBe(0);
  });

  it('offers to send it now, never "back to inbox"', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/replyWaitsUntil\(item, Date\.now\(\)\) \? 'Send it now'/);
  });
});

// Found by the second power tester the same morning: with a reply waiting for
// Thursday, "Oh, and one more thing for tomorrow" sent with plain Send went at
// once and started the agent, while the first reply above still said it sent
// Thursday. The words had both gone; the screen said only one had.
describe('a second reply while one waits', () => {
  const second = (ts, extra = []) => [{ id: 'w-1', ts, source: 'founder', patch: { answer: 'And add a P.S.' } }, ...extra];
  const replies = (events) => events.filter((e) => e.field === 'answer');

  it('sent at once, takes the waiting one with it', () => {
    const events = threadEvents([...opened, ...later, ...second(T + 60_000)]);
    expect(replies(events).map((e) => e.sendsAt)).toEqual([undefined, undefined]);
  });

  it('set for a time, carries the waiting one to that time', () => {
    const THEN = SENDS + 3_600_000;
    const events = threadEvents([...opened, ...later, ...second(T + 60_000, [{ id: 'w-1', ts: T + 60_004, source: 'founder', patch: { runAt: THEN } }])]);
    expect(replies(events).map((e) => e.sendsAt)).toEqual([THEN, THEN]);
  });

  it('a waiting reply taken back with Z no longer says it sends', () => {
    const undone = { id: 'w-1', ts: T + 30_000, source: 'founder', patch: { answer: '(withdrawn)' } };
    const events = threadEvents([...opened, ...later, undone]);
    expect(reply(events)?.sendsAt).toBeUndefined();
  });

  it('says the day with the time, as the button does', () => {
    expect(read('renderer/src/components/Thread.tsx')).toMatch(/Sends \$\{laterHint\(e\.sendsAt\)\}/);
  });

  it('the reply box opens on the time a reply is already waiting for', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/useState\(\(\) => readDraftWhen\(item\) \|\| replyWaitsUntil\(item\)\)/);
  });

  it('and a reply sent at once while one waits lifts that time, so both go now', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/const waiting = !later && replyWaitsUntil\(item, Date\.now\(\)\) > 0;/);
    expect(app).toMatch(/if \(waiting\) await api\.schedule\(\{ product: item\.product, id: item\.id, runAt: 0 \}\);/);
  });
});

describe('on a shared thread', () => {
  it('a reply set for later by one person waits whatever a teammate says after it', () => {
    const mine = later.map((l) => ({ ...l, by: 'me' }));
    const theirs = { id: 'w-1', ts: T + 60_000, source: 'founder', by: 'maya', patch: { answer: 'Looks good to me' } };
    const events = threadEvents([...opened, ...mine, theirs]);
    expect(events.find((e) => e.words === 'And make the button go to /start')?.sendsAt).toBe(SENDS);
  });
});

// The second tester pressed "send it now" under a reply set for tomorrow and
// was put back on the list with Later one higher, not knowing whether the
// reply had gone. And the first tester found a thread she had undone with Z
// in Done, still offering "back to inbox · scheduled for today 5:00 PM".
describe('the button under a waiting reply', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');

  it('sends it and stays on the thread', () => {
    expect(app).toMatch(/onUnschedule=\{\(\) => \(replyWaitsUntil\(focused, Date\.now\(\)\) \? sendWaitingNow\(focused\) : unsnooze\(focused\)\)\}/);
    const fn = app.slice(app.indexOf('const sendWaitingNow = '), app.indexOf('const sendWaitingNow = ') + 600);
    expect(fn).toMatch(/api\.schedule\(\{ product: item\.product, id: item\.id, runAt: 0 \}\)/);
    expect(fn).toMatch(/showToast\('Your reply is on its way'\)/);
    expect(fn).not.toMatch(/setFocused\(null\)/);
  });

  it('is not offered on a closed thread', () => {
    expect(focus).toMatch(/const scheduledHere = item\.status !== 'done' && \(scheduledUntil \?\? 0\) > 0;/);
    expect(focus).not.toMatch(/\(scheduledUntil \?\? 0\) > 0 && (!!)?onUnschedule/);
  });
});

// Driven in a live copy on 2026-11-04: "send it now" ran the reply, and the
// reply above still said "Sends Thu 8:00".
describe('a waiting reply sent now from under the thread', () => {
  it('no longer says it sends later, at any distance from the reply', () => {
    for (const gap of [30_000, 10 * 60_000]) {
      const now = { id: 'w-1', ts: T + gap, source: 'founder', patch: { runAt: 0 } };
      const events = threadEvents([...opened, ...later, now]);
      expect(reply(events)?.sendsAt).toBeUndefined();
      expect(events.some((e) => e.said === 'You brought it back')).toBe(false);
    }
  });

  it('a thread brought back with no reply waiting still says so', () => {
    const put = { id: 'w-1', ts: T, source: 'founder', patch: { runAt: SENDS } };
    const back = { id: 'w-1', ts: T + 10 * 60_000, source: 'founder', patch: { runAt: 0 } };
    expect(threadEvents([...opened, put, back]).some((e) => e.said === 'You brought it back')).toBe(true);
  });
});
