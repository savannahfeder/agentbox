// THE PHONE APP'S THREAD SHOWS ITS MIDDLE, ITS CHECKPOINT AND WHAT CAME AFTER.
//
// Codex's parity audit read the app's thread against the phone site's
// (components/ItemThread.tsx, Thread.tsx) and found three things it dropped.
// A long thread's left-out middle had no way back: on one real thread 69
// messages were simply not there. What you did after the agent's last word,
// such as putting the thread off, was thrown away. And a checkpoint read the
// same as a finished result. These hold the app's thread (mobile/src/lib/thread.ts)
// to the site's rules, along with the cases that must not change: a short
// thread has no gap, and a result an agent closed on leads with no label.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { conversationGap, TRAIL_OPENING, TRAIL_TURNS } from '../shared/agents.mjs';
import { actWords } from '../renderer/src/act-line';
import { threadOf } from '../mobile/src/lib/thread';

const NOW = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const her = (ts) => ({ ts, source: 'founder' });
const agent = (ts) => ({ ts, source: 'agent' });

function rowsWith(item, history) {
  return {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: [{ device: DEV, project: 'alpha', item: item.id, updated_at: iso(NOW - MIN), snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], priority: 0, ...item }, history: history.map((l) => ({ id: item.id, ...l })) } }],
    commands: [],
  };
}
const open = (r, id, opts) => threadOf(r, phoneView(r, NOW), A, id, opts);

// Her ask, then `pairs` of the agent's checkpoint and her answer, then a result.
function talk(pairs) {
  const history = [{ ts: NOW - 1000 * MIN, source: 'founder', patch: { body: 'Move it to the cloud.' } }];
  for (let n = 0; n < pairs; n += 1) {
    history.push({ ts: NOW - (900 - n * 10) * MIN, source: 'agent', patch: { note: `Step ${n + 1} is done.` } });
    history.push({ ts: NOW - (895 - n * 10) * MIN, source: 'founder', patch: { answer: `Carry on with step ${n + 2}.` } });
  }
  history.push({ ts: NOW - 30 * MIN, source: 'agent', patch: { result: 'All of it is in the cloud.' } });
  const item = { id: 'w-1', title: 'Move it', status: 'open', body: 'Move it to the cloud.', result: 'All of it is in the cloud.', createdAt: NOW - 1000 * MIN, updatedAt: NOW - 30 * MIN, wrote: { body: her(NOW - 1000 * MIN), result: agent(NOW - 30 * MIN) } };
  return rowsWith(item, history);
}
const said = (t) => t.events.filter((e) => e.kind !== 'work');

describe('a long thread', () => {
  // 1 ask + 48 + the result at the foot: past the window the site keeps.
  const r = talk(24);

  it('leaves out its middle the way the site does, and says how many in words', () => {
    const t = open(r, 'w-1');
    expect(said(t).length).toBe(TRAIL_TURNS);
    expect(t.omitted).toBe(1 + 48 - TRAIL_TURNS);
    expect(t.gapWords).toBe(conversationGap(t.omitted));
    expect(t.gapWords).toMatch(/^Show the \d+ messages in between$/);
  });

  it('puts the gap after the opening the window keeps', () => {
    const t = open(r, 'w-1');
    const before = t.events.slice(0, t.gapAfter + 1).filter((e) => e.kind !== 'work');
    expect(before.length).toBe(TRAIL_OPENING);
    expect(before[0].text).toBe('Move it to the cloud.');
  });

  it('draws every message once the middle is asked for', () => {
    const t = open(r, 'w-1', { whole: true });
    expect(t.omitted).toBe(0);
    expect(t.gapAfter).toBe(-1);
    expect(t.gapWords).toBe('');
    expect(said(t).length).toBe(1 + 48);
  });

  it('a short thread has no gap', () => {
    const t = open(talk(3), 'w-1');
    expect(t.omitted).toBe(0);
    expect(t.gapAfter).toBe(-1);
  });
});

describe('what you did after the agent\'s last word', () => {
  const until = NOW + 600 * MIN;
  const history = [
    { ts: NOW - 100 * MIN, source: 'founder', patch: { body: 'Draw it.' } },
    { ts: NOW - 30 * MIN, source: 'agent', patch: { result: 'Drawn.' } },
    { ts: NOW - 20 * MIN, source: 'founder', patch: { snoozedUntil: until } },
  ];
  const item = { id: 'w-1', title: 'Draw it', status: 'open', body: 'Draw it.', result: 'Drawn.', snoozedUntil: until, createdAt: NOW - 100 * MIN, updatedAt: NOW - 20 * MIN, wrote: { body: her(NOW - 100 * MIN), result: agent(NOW - 30 * MIN), snoozedUntil: her(NOW - 20 * MIN) } };

  it('is kept, under the answer, as your action with its time', () => {
    const t = open(rowsWith(item, history), 'w-1');
    expect(t.outcome?.text).toBe('Drawn.');
    expect(t.after.length).toBe(1);
    expect(t.after[0]).toMatchObject({ kind: 'work', yours: true, at: NOW - 20 * MIN });
    expect(actWords(t.after[0]).lead).toMatch(/^Moved to Later/);
    // Not in the stream above the answer as well.
    expect(t.events.some((e) => e.kind === 'work' && e.at === NOW - 20 * MIN)).toBe(false);
  });

  it('is nothing when you did nothing after it', () => {
    const t = open(rowsWith({ ...item, snoozedUntil: undefined, wrote: { body: her(NOW - 100 * MIN), result: agent(NOW - 30 * MIN) } }, history.slice(0, 2)), 'w-1');
    expect(t.after).toEqual([]);
  });
});

describe('the answer at the foot', () => {
  const ask = { ts: NOW - 100 * MIN, source: 'founder', patch: { body: 'Look into it.' } };
  const base = { id: 'w-1', title: 'Look into it', body: 'Look into it.', createdAt: NOW - 100 * MIN, updatedAt: NOW - 5 * MIN };

  it('is labelled a checkpoint when it is one', () => {
    const t = open(rowsWith({ ...base, status: 'blocked', note: 'Halfway.', wrote: { body: her(base.createdAt), note: agent(NOW - 5 * MIN) } }, [ask, { ts: NOW - 5 * MIN, source: 'agent', patch: { status: 'blocked', note: 'Halfway.' } }]), 'w-1');
    expect(t.outcome).toMatchObject({ field: 'note', label: 'Latest checkpoint' });
  });

  it('is labelled a result on a thread still open', () => {
    const t = open(rowsWith({ ...base, status: 'open', result: 'Found it.', wrote: { body: her(base.createdAt), result: agent(NOW - 5 * MIN) } }, [ask, { ts: NOW - 5 * MIN, source: 'agent', patch: { result: 'Found it.' } }]), 'w-1');
    expect(t.outcome).toMatchObject({ field: 'result', label: 'Result' });
  });

  it('leads with no label when the agent finished the thread on it', () => {
    const t = open(rowsWith({ ...base, status: 'done', result: 'Found it.', wrote: { body: her(base.createdAt), status: agent(NOW - 5 * MIN), result: agent(NOW - 5 * MIN) } }, [ask, { ts: NOW - 5 * MIN, source: 'agent', patch: { status: 'done', result: 'Found it.' } }]), 'w-1');
    expect(t.outcome).toMatchObject({ field: 'result', label: null });
  });
});

describe('her turns', () => {
  it('are ruled above and below where the agent speaks either side, as the site rules them', () => {
    const t = open(talk(2), 'w-1');
    const msgs = t.nodes.map((n, k) => ({ n, k })).filter(({ n }) => n.kind !== 'work' && n.kind !== 'run');
    // The ask opens the thread, so nothing is ruled above it.
    expect(t.turnStarts[msgs[0].k]).toBe(false);
    // Her answer between two checkpoints is framed on both sides.
    const answer = msgs.find(({ n }) => n.who === 'you' && n.text.startsWith('Carry on'));
    expect(t.turnStarts[answer.k]).toBe(true);
    expect(t.turnEnds[answer.k]).toBe(true);
  });
});
