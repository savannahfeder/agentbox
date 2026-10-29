// Teammates (w-4bd7b5548b): a teammate is a standing job whose every wake-up is
// an ordinary work item. These pin what wakes it and how its runs queue, on
// plain data: your message, a teammate passing it work, its schedule, one run
// at a time, and the weekly cap that stops a teammate running away with your
// plan. The cases that must NOT wake anyone are here too: a message it wrote
// itself, one it has already seen, one to a paused teammate from another
// teammate, and a schedule already served today.
import { describe, it, expect } from 'vitest';
import {
  planWakes, foldTeammates, foldChat, mentionsIn, letterFor, runIdFor, waitingOnYou,
  isActiveRun, statusOf, runLines, teammateLabel, seenKey, DEFAULT_LIMIT, MAX_HOPS,
} from '../shared/teammates.mjs';

const NOW = new Date(2026, 9, 26, 9, 30).getTime(); // a Monday, after 9am
const ada = { id: 't-aaaaaa', name: 'Ada', letter: 'A', status: 'active', paused: false, served: '2026-10-26', limit: DEFAULT_LIMIT, works: { every: 'weekday', at: '09:00' }, product: 'kestrel', memory: [] };
const felix = { id: 't-ffffff', name: 'Felix', letter: 'F', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
const chat = (messages, seen = []) => ({ messages, seen: new Set(seen) });
const run = (t, over = {}) => ({ id: over.id ?? 'w-111111', product: 'kestrel', title: 'x', status: 'open', labels: ['founder', teammateLabel(t.id)], createdAt: NOW - 1000, wrote: {}, ...over });

describe('what wakes a teammate', () => {
  it('your message to a teammate with nothing on becomes a run that starts now, and is marked seen', () => {
    const m = { id: 'm-1', kind: 'msg', from: 'you', to: [felix.id], text: 'Can you look at the double charge?', ts: NOW - 10 };
    const acts = planWakes({ teammates: [felix], chat: chat([m]), items: [], now: NOW });
    const r = acts.find((a) => a.type === 'run');
    expect(r).toMatchObject({ teammate: felix.id, start: 'now', id: runIdFor(`m-1>${felix.id}`) });
    expect(r.trigger).toMatchObject({ kind: 'message', from: 'you', text: m.text });
    expect(acts).toContainEqual({ type: 'seen', msg: 'm-1', teammate: felix.id, run: r.id });
  });

  it('a run is titled for what started it: a first round, a setup, or your own words', () => {
    const title = (m, t = felix) => planWakes({ teammates: [t], chat: chat([m]), items: [], now: NOW }).find((a) => a.type === 'run').title;
    const words = 'You have just been started. Introduce yourself.';
    expect(title({ id: 'm-s', kind: 'msg', from: 'you', to: [felix.id], text: words, start: true, ts: NOW })).toBe('Introduce itself and begin');
    expect(title({ id: 'm-d', kind: 'msg', from: 'you', to: [felix.id], text: 'Someone to chase invoices', setup: true, ts: NOW },
      { ...felix, name: 'New teammate', status: 'draft' })).toBe('Set up its job');
    expect(title({ id: 'm-w', kind: 'msg', from: 'you', to: [felix.id], text: words, ts: NOW })).toBe(words);
    // The inbox row already leads with the name, so no title repeats it.
    const round = (t) => planWakes({ teammates: [t], chat: chat([]), items: [], now: NOW }).find((a) => a.type === 'run').title;
    expect(round({ ...ada, served: '2026-10-23' })).toBe("Today's round");
    expect(round({ ...ada, served: '2026-10-19', works: { every: 'week', on: 1, at: '09:00' } })).toBe("This week's round");
    // One message to two teammates: each run is titled with its own part.
    // The power test's first message gave Hugo a run called "Onboarding first
    // screen", which was Ada's ask, and his Done today said he had done it.
    const both = { id: 'm-b', kind: 'msg', from: 'you', to: [ada.id, felix.id], ts: NOW,
      text: 'morning team, two customers got lost after signing up, so @Ada can you poke at the onboarding screen and file what is confusing. @Felix nothing urgent, just get set up' };
    const titles = planWakes({ teammates: [{ ...ada, served: '2026-10-26' }, felix], chat: chat([both]), items: [], now: NOW }).filter((a) => a.type === 'run').map((a) => [a.teammate, a.title]);
    expect(Object.fromEntries(titles)).toEqual({ [ada.id]: 'Can you poke at the onboarding screen and file what is confusing', [felix.id]: 'Nothing urgent, just get set up' });
    // A part runs to the next name or line, not the first full stop: "Felix
    // is busy" was all a data-loss crash was called.
    expect(title({ id: 'm-busy', kind: 'msg', from: 'you', to: [felix.id], text: '@Felix is busy. Can you take the crash where every booking is lost', ts: NOW }, { ...felix, name: 'Felix' }))
      .toBe('Is busy. Can you take the crash where every booking is lost');
    // A name at the very end leaves nothing of its own, so the first line stands.
    expect(title({ id: 'm-e', kind: 'msg', from: 'you', to: [felix.id], text: 'Ship the fix today, thanks @Felix', ts: NOW })).toBe('Ship the fix today, thanks @Felix');
    // Felix's "@Ada it's ready for your phone pass" became Ada's run title, and
    // her sidebar line read as if she had said it (second power test). A
    // teammate naming another now wakes nobody, so it is no run's title at all
    // (talk-between-teammates-stays-in-the-thread-it-is-about).
    const named = (m) => planWakes({ teammates: [{ ...ada, served: '2026-10-26' }, felix], chat: chat([m]), items: [], now: NOW }).filter((a) => a.type === 'run');
    expect(named({ id: 'm-f', kind: 'msg', from: felix.id, to: [ada.id], text: "@Ada it's ready for your phone pass", ts: NOW })).toEqual([]);
    // Nor can a teammate dress its own message up as your opening.
    expect(named({ id: 'm-t', kind: 'msg', from: ada.id, to: [felix.id], text: words, start: true, ts: NOW })).toEqual([]);
  });

  it('your message goes into the run already waiting on you rather than starting a second', () => {
    const waiting = run(felix, { id: 'w-222222', result: 'Ship it?', wrote: { result: { ts: NOW - 500, source: 'agent' } } });
    expect(waitingOnYou(waiting)).toBe(true);
    const m = { id: 'm-2', kind: 'msg', from: 'you', to: [felix.id], text: 'Yes, ship it', ts: NOW };
    const acts = planWakes({ teammates: [felix], chat: chat([m]), items: [waiting], now: NOW });
    expect(acts.find((a) => a.type === 'run')).toBeUndefined();
    expect(acts).toContainEqual(expect.objectContaining({ type: 'answer', item: 'w-222222', text: 'Yes, ship it' }));
  });

  // "Urgent message to a busy teammate: no pickup, no queued item, it keeps
  // doing the old task" (second power test). Your words go into a running run
  // only when that run is the one your earlier words started; anything else
  // is new work, queued behind it where you can see it.
  it('your words reach a running run only when your words started it, and are new work otherwise', () => {
    const first = { id: 'm-r1', kind: 'msg', from: 'you', to: [felix.id], text: 'Fix the timezone bug', ts: NOW - 5000 };
    const yours = run(felix, { id: runIdFor(`m-r1>${felix.id}`), status: 'claimed' });
    const follow = { id: 'm-r2', kind: 'msg', from: 'you', to: [felix.id], text: 'also add a test', ts: NOW };
    const one = planWakes({ teammates: [felix], chat: chat([first, follow], [seenKey('m-r1', felix.id)]), items: [yours], now: NOW });
    expect(one).toContainEqual(expect.objectContaining({ type: 'answer', item: yours.id, text: 'also add a test' }));
    const passed = run(felix, { id: 'w-passed', status: 'claimed', labels: ['founder', teammateLabel(felix.id), 'hop:1', `from:${ada.id}`] });
    const urgent = { id: 'm-r3', kind: 'msg', from: 'you', to: [felix.id], text: 'URGENT every booking is lost', ts: NOW };
    const two = planWakes({ teammates: [felix], chat: chat([urgent]), items: [passed], now: NOW });
    expect(two.find((a) => a.type === 'answer')).toBeUndefined();
    expect(two.find((a) => a.type === 'run')).toMatchObject({ start: 'later', title: 'URGENT every booking is lost' });
  });

  it('a queued run is not waiting on you, and a clean one is not either', () => {
    const asked = { result: 'Ship it?', wrote: { result: { ts: NOW - 500, source: 'agent' } } };
    expect(waitingOnYou(run(felix, { ...asked, start: 'later' }))).toBe(false);
    expect(waitingOnYou(run(felix, { ...asked, labels: ['founder', teammateLabel(felix.id), 'clean'] }))).toBe(false);
    expect(waitingOnYou(run(felix, asked))).toBe(true);
  });

  it('a teammate passing work wakes the one it passed to, with the title and details', () => {
    const p = { id: 'm-3', kind: 'pass', from: ada.id, to: felix.id, title: 'Buy twice charges twice', details: 'Steps: ...', ts: NOW };
    const acts = planWakes({ teammates: [ada, felix], chat: chat([p]), items: [], now: NOW });
    const r = acts.find((a) => a.type === 'run' && a.teammate === felix.id);
    expect(r.trigger).toMatchObject({ kind: 'pass', from: ada.id, title: 'Buy twice charges twice' });
    expect(r.title).toBe('Buy twice charges twice');
  });

  it('an owed schedule becomes one run and is served', () => {
    const acts = planWakes({ teammates: [{ ...ada, served: '2026-10-23' }], chat: chat([]), items: [], now: NOW });
    expect(acts.filter((a) => a.type === 'run')).toHaveLength(1);
    expect(acts).toContainEqual({ type: 'served', teammate: ada.id, key: '2026-10-26' });
  });

  it('wakes nobody for: its own message, a message already seen, a schedule served today, or a teammate with no schedule', () => {
    const own = { id: 'm-4', kind: 'msg', from: felix.id, to: [felix.id], text: 'note to self', ts: NOW };
    const seenAlready = { id: 'm-5', kind: 'msg', from: 'you', to: [felix.id], text: 'hi', ts: NOW };
    const served = { ...ada, served: '2026-10-26' };
    const acts = planWakes({ teammates: [served, felix], chat: chat([own, seenAlready], [seenKey('m-5', felix.id)]), items: [], now: NOW });
    expect(acts.filter((a) => a.type === 'run')).toHaveLength(0);
  });

  it('before 9am on a weekday the round is not owed yet, and on Saturday a weekday round is not owed at all', () => {
    const early = new Date(2026, 9, 26, 8, 59).getTime();
    expect(planWakes({ teammates: [{ ...ada, served: '2026-10-23' }], chat: chat([]), items: [], now: early }).filter((a) => a.type === 'run')).toHaveLength(0);
    const saturday = new Date(2026, 9, 24, 12, 0).getTime();
    expect(planWakes({ teammates: [{ ...ada, served: '2026-10-23' }], chat: chat([]), items: [], now: saturday }).filter((a) => a.type === 'run')).toHaveLength(0);
  });

  it('a paused teammate wakes for your words but not for a teammate or its schedule', () => {
    const paused = { ...felix, paused: true, works: { every: 'day', at: '09:00' } };
    const fromAda = { id: 'm-6', kind: 'pass', from: ada.id, to: paused.id, title: 'fix', ts: NOW };
    const fromYou = { id: 'm-7', kind: 'msg', from: 'you', to: [paused.id], text: 'hello', ts: NOW };
    const acts = planWakes({ teammates: [ada, paused], chat: chat([fromAda, fromYou]), items: [], now: NOW });
    const runs = acts.filter((a) => a.type === 'run' && a.teammate === paused.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].trigger.msg).toBe('m-7');
  });
});

describe('two teammates cannot keep each other running', () => {
  it('a teammate-to-teammate chain wakes up to the hop limit and stops there, saying so', () => {
    const at = (hop) => ({ id: `m-h${hop}`, kind: 'pass', from: ada.id, to: felix.id, title: 'again', hop, ts: NOW });
    const ok = planWakes({ teammates: [ada, felix], chat: chat([at(MAX_HOPS - 1)]), items: [], now: NOW });
    expect(ok.find((a) => a.type === 'run').trigger.hop).toBe(MAX_HOPS);
    const stop = planWakes({ teammates: [ada, felix], chat: chat([at(MAX_HOPS)]), items: [], now: NOW });
    expect(stop.find((a) => a.type === 'run')).toBeUndefined();
    expect(stop).toContainEqual({ type: 'hops', teammate: felix.id, msg: `m-h${MAX_HOPS}`, from: ada.id });
    expect(stop).toContainEqual({ type: 'seen', msg: `m-h${MAX_HOPS}`, teammate: felix.id });
  });

  it('your words always start a fresh count', () => {
    const y = { id: 'm-y', kind: 'msg', from: 'you', to: [felix.id], text: 'go', hop: 99, ts: NOW };
    expect(planWakes({ teammates: [felix], chat: chat([y]), items: [], now: NOW }).find((a) => a.type === 'run').trigger.hop).toBe(0);
  });
});

describe('one run at a time', () => {
  it('a new run behind an active one is queued, and nothing is released while it runs', () => {
    const running = run(felix, { id: 'w-333333', status: 'claimed' });
    const p = { id: 'm-8', kind: 'pass', from: ada.id, to: felix.id, title: 'another', ts: NOW };
    // Told to take hand-offs straight away; one held for your yes does not queue.
    const acts = planWakes({ teammates: [ada, { ...felix, handoffsNeedYes: false }], chat: chat([p]), items: [running], now: NOW });
    expect(acts.find((a) => a.type === 'run' && a.teammate === felix.id).start).toBe('later');
    expect(acts.find((a) => a.type === 'release' && a.teammate === felix.id)).toBeUndefined();
  });

  it('two wakes in one tick: the first starts now and the second waits', () => {
    const a = { id: 'm-9', kind: 'pass', from: ada.id, to: felix.id, title: 'one', ts: NOW };
    const b = { id: 'm-10', kind: 'pass', from: ada.id, to: felix.id, title: 'two', ts: NOW + 1 };
    const acts = planWakes({ teammates: [ada, { ...felix, handoffsNeedYes: false }], chat: chat([a, b]), items: [], now: NOW });
    expect(acts.filter((x) => x.type === 'run').map((x) => x.start)).toEqual(['now', 'later']);
  });

  it('once nothing is active, the oldest queued run is released', () => {
    const q1 = run(felix, { id: 'w-444444', start: 'later', createdAt: NOW - 50 });
    const q2 = run(felix, { id: 'w-555555', start: 'later', createdAt: NOW - 100 });
    const acts = planWakes({ teammates: [felix], chat: chat([]), items: [q1, q2], now: NOW });
    expect(acts).toContainEqual({ type: 'release', teammate: felix.id, item: 'w-555555', product: 'kestrel' });
  });

  it('a run waiting on you does not hold the queue', () => {
    const waiting = run(felix, { id: 'w-666666', status: 'blocked' });
    const q = run(felix, { id: 'w-777777', start: 'later' });
    expect(isActiveRun(waiting)).toBe(false);
    const acts = planWakes({ teammates: [felix], chat: chat([]), items: [waiting, q], now: NOW });
    expect(acts).toContainEqual(expect.objectContaining({ type: 'release', item: 'w-777777' }));
  });
});

describe('the weekly cap', () => {
  it('at its limit a teammate takes no pass or schedule, says so once, and still takes your words', () => {
    const capped = { ...felix, limit: 2, works: { every: 'day', at: '09:00' } };
    const done = [run(capped, { id: 'w-aaaaa1', status: 'done' }), run(capped, { id: 'w-aaaaa2', status: 'done' })];
    const p = { id: 'm-11', kind: 'pass', from: ada.id, to: capped.id, title: 'more', ts: NOW };
    const y = { id: 'm-12', kind: 'msg', from: 'you', to: [capped.id], text: 'one more', ts: NOW };
    const acts = planWakes({ teammates: [ada, capped], chat: chat([p, y]), items: done, now: NOW });
    const runs = acts.filter((a) => a.type === 'run' && a.teammate === capped.id);
    expect(runs.map((r) => r.trigger.msg)).toEqual(['m-12']);
    expect(acts.filter((a) => a.type === 'limit' && a.teammate === capped.id)).toHaveLength(1);
    expect(acts.find((a) => a.type === 'seen' && a.msg === 'm-11')).toBeUndefined();
  });

  it('runs older than a week do not count', () => {
    const capped = { ...felix, limit: 1 };
    const old = run(capped, { id: 'w-bbbbb1', status: 'done', createdAt: NOW - 8 * 24 * 3600e3 });
    const p = { id: 'm-13', kind: 'pass', from: ada.id, to: capped.id, title: 'x', ts: NOW };
    expect(planWakes({ teammates: [ada, capped], chat: chat([p]), items: [old], now: NOW }).filter((a) => a.type === 'run')).toHaveLength(1);
  });
});

describe('the files', () => {
  it('folds teammates newest-wins, keeps memory as a list, and drops ended ones and bad ids', () => {
    const lines = [
      { id: 't-abc123', ts: 1, patch: { name: 'Ada', role: 'Quality lead', letter: 'a', works: { every: 'weekday', at: '09:00' } } },
      { id: 't-abc123', ts: 2, patch: { role: 'Tester', remember: { id: 'k1', text: 'Check dark theme first', from: 'your reply', at: 2 } } },
      { id: 't-abc123', ts: 3, patch: { remember: { id: 'k2', text: 'A 4px gap is a bug', at: 3 } } },
      { id: 't-abc123', ts: 4, patch: { forget: 'k1', works: { every: 'nope' } } },
      { id: 't-def456', ts: 5, patch: { name: 'Gone', endedAt: 6 } },
      { id: 'bad', ts: 5, patch: { name: 'X' } },
    ];
    const [t, ...rest] = foldTeammates(lines, NOW);
    expect(rest).toHaveLength(0);
    expect(t).toMatchObject({ name: 'Ada', role: 'Tester', letter: 'A', works: { every: 'weekday', at: '09:00' } });
    expect(t.memory.map((m) => m.text)).toEqual(['A 4px gap is a bug']);
  });

  it('a served date in the future is refused', () => {
    const [t] = foldTeammates([{ id: 't-abc123', ts: 1, patch: { name: 'Ada', served: '2099-01-01' } }], NOW);
    expect(t.served).toBe('');
  });

  it('folds the chat in time order, drops repeats of one id, and keeps seen markers apart', () => {
    const { messages, seen } = foldChat([
      { id: 'm-b', kind: 'msg', from: 'you', ts: 2, text: 'b' },
      { id: 'm-a', kind: 'msg', from: 'you', ts: 1, text: 'a' },
      { id: 'm-a', kind: 'msg', from: 'you', ts: 3, text: 'dup' },
      { kind: 'seen', ref: 'm-a', for: 't-1', ts: 4 },
      { kind: 'weird', ts: 5 },
    ]);
    expect(messages.map((m) => m.text)).toEqual(['a', 'b']);
    expect(seen.has(seenKey('m-a', 't-1'))).toBe(true);
  });
});

describe('names and letters', () => {
  it('@Name addresses a teammate, but not inside a word or an email', () => {
    expect(mentionsIn('@Ada can you check', [ada, felix])).toEqual([ada.id]);
    expect(mentionsIn('thanks @felix!', [ada, felix])).toEqual([felix.id]);
    expect(mentionsIn('mail ada@example.com or @Adam', [ada, felix])).toEqual([]);
  });

  it('a letter is the first free one of the name', () => {
    expect(letterFor('Vera', [ada, felix])).toBe('V');
    expect(letterFor('Abe', [ada, felix])).toBe('B');
  });
});

describe('what you see', () => {
  it('a run shows as picked up, then sent you while it waits, then finished', () => {
    const r = run(ada, { id: 'w-cccccc', title: 'Try sign up on a phone', status: 'done', createdAt: 10, result: 'Two bugs', wrote: { result: { ts: 20, source: 'agent' }, status: { ts: 30, source: 'agent' } } });
    expect(runLines([r], [ada]).map((l) => l.verb)).toEqual(['picked', 'sent', 'finished']);
  });

  // The power test answered Ada in her thread, and her page never showed it:
  // it ended on "Sent you ... waiting on you" as if nothing had been said.
  it('your answer in its thread shows, and its next word after it', () => {
    const r = run(ada, { id: 'w-c2c2c2', title: 'Onboarding', createdAt: 10, answer: 'Look at Product, not Company', result: 'Done: two findings', wrote: { answer: { ts: 40, source: 'founder' }, result: { ts: 50, source: 'agent' } } });
    const lines = runLines([r], [ada]);
    expect(lines.map((l) => l.verb)).toEqual(['picked', 'answered', 'sent']);
    expect(lines.find((l) => l.verb === 'answered')).toMatchObject({ text: 'Look at Product, not Company', ts: 40 });
    // No answer, no line; and a withdrawn one is not words of yours.
    expect(runLines([run(ada, { id: 'w-c3c3c3', createdAt: 10 })], [ada]).map((l) => l.verb)).toEqual(['picked']);
    expect(runLines([run(ada, { id: 'w-c4c4c4', createdAt: 10, answer: '(withdrawn)', wrote: { answer: { ts: 40, source: 'founder' } } })], [ada]).map((l) => l.verb)).toEqual(['picked']);
  });

  it('a clean run shows no sent line, and a queued one shows only that it is next', () => {
    const clean = run(ada, { id: 'w-dddddd', status: 'done', createdAt: 10, labels: ['founder', teammateLabel(ada.id), 'clean'], result: 'nothing', wrote: { result: { ts: 20, source: 'agent' }, status: { ts: 21, source: 'agent' } } });
    const q = run(ada, { id: 'w-eeeeee', start: 'later' });
    expect(runLines([clean, q], [ada]).map((l) => l.verb)).toEqual(['picked', 'finished', 'queued']);
  });

  // The power test paused Hugo, wrote to him, and watched him work while
  // everything still said "Paused".
  it('a paused teammate working on your message says what it is on, and Paused only when idle', () => {
    const hugo = { ...felix, paused: true };
    const on = run(hugo, { id: 'w-p1', title: 'Draft the two intro emails', status: 'claimed' });
    expect(statusOf(hugo, [on], NOW).now).toBe('Draft the two intro emails');
    expect(statusOf(hugo, [], NOW).now).toBe('Paused');
  });

  // "Felix says '2 more queued' ... and I can't see which two."
  it('the panel names what is queued, oldest first', () => {
    const on = run(felix, { id: 'w-on', status: 'claimed' });
    const q1 = run(felix, { id: 'w-q1', title: 'Every booking is lost', start: 'later', createdAt: NOW - 100 });
    const q2 = run(felix, { id: 'w-q2', title: 'Load more drops rows', start: 'later', createdAt: NOW - 200 });
    expect(statusOf(felix, [on, q1, q2], NOW).next.map((n) => n.title)).toEqual(['Load more drops rows', 'Every booking is lost']);
  });

  it('the panel says what is waiting on you, what it is on now, and what it finished today', () => {
    const waiting = run(ada, { id: 'w-f1f1f1', title: 'Review the fix', status: 'blocked' });
    const running = run(ada, { id: 'w-f2f2f2', title: 'Try sign up on a phone', status: 'claimed' });
    const finished = run(ada, { id: 'w-f3f3f3', title: 'Tried Safari', status: 'done', wrote: { status: { ts: NOW - 1000, source: 'agent' } } });
    const s = statusOf(ada, [waiting, running, finished], NOW);
    expect(s.waiting.map((w) => w.title)).toEqual(['Review the fix']);
    expect(s.now).toBe('Try sign up on a phone');
    expect(s.done.map((d) => d.title)).toEqual(['Tried Safari']);
  });
});
