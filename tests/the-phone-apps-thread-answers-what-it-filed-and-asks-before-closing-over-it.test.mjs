// THE PHONE APP'S THREAD ANSWERS WHAT IT FILED, AND ASKS BEFORE CLOSING OVER IT.
//
// Codex's parity audit (findings 10 and 27). On the phone site a thread lists
// the threads its agent filed, each with Dismiss, Do here and New thread
// (components/ThreadsMade.tsx). A thread filed from another opens with the
// message that asked for it. And Close asks first while filed tasks still wait
// (close-asks-first.ts). The app drew none of this: its Close skipped past
// waiting proposals, the very thing that once left a task waiting 22 hours.
// These hold the app's thread (mobile/src/lib/thread.ts) and its presses
// (mobile/src/lib/actions.ts) to the site's rules. They also cover what must
// not change: a finished child offers nothing, a thread you wrote is not a
// proposal, and a thread with nothing waiting closes without asking.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { phoneSender } from '../renderer/src/phone-send';
import { closeAsk } from '../renderer/src/close-asks-first';
import { doItHereWords } from '../renderer/src/threads-made';
import { threadOf } from '../mobile/src/lib/thread';
import { phoneTabs } from '../mobile/src/lib/tabs';
import { planFor, runSteps } from '../mobile/src/lib/actions';
import { FILED_WORDS, waitingWords } from '../mobile/src/lib/thread-offers';
import { DISMISS, DO_HERE, START_NEW, waitingWords as siteWaitingWords } from '../renderer/src/components/ThreadsMade';

const NOW = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const her = (ts) => ({ ts, source: 'founder' });
const agent = (ts) => ({ ts, source: 'agent' });

const snap = (item, history) => ({ device: DEV, project: 'alpha', item: item.id, updated_at: iso(item.updatedAt), snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], priority: 0, ...item }, history: history.map((l) => ({ id: item.id, ...l })) } });

const parent = { id: 'w-p', title: 'Plan the phone app', status: 'blocked', body: 'Plan the phone app.', answer: 'Keep going.', note: 'Here is the plan.', createdAt: NOW - 300 * MIN, updatedAt: NOW - 10 * MIN, wrote: { body: her(NOW - 300 * MIN), answer: her(NOW - 150 * MIN), note: agent(NOW - 10 * MIN) } };
const parentLines = [
  { ts: NOW - 300 * MIN, source: 'founder', patch: { body: 'Plan the phone app.' } },
  { ts: NOW - 200 * MIN, source: 'agent', patch: { note: 'Read the code.' } },
  { ts: NOW - 150 * MIN, source: 'founder', patch: { answer: 'Keep going.' } },
  { ts: NOW - 10 * MIN, source: 'agent', patch: { status: 'blocked', note: 'Here is the plan.' } },
];
// An agent's proposal, filed after the newest turn: waiting on you.
const proposal = { id: 'w-a', parent: 'w-p', labels: [], title: 'Add a report button', status: 'open', body: 'Add a Report row to the message menu.', createdAt: NOW - 5 * MIN, updatedAt: NOW - 5 * MIN, wrote: { body: agent(NOW - 5 * MIN) } };
// Filed on the first turn and finished since.
const finished = { id: 'w-b', parent: 'w-p', labels: [], title: 'Check the App Review rules', status: 'done', result: 'Two rules.', createdAt: NOW - 210 * MIN, updatedAt: NOW - 100 * MIN, wrote: { body: agent(NOW - 210 * MIN), status: agent(NOW - 100 * MIN), result: agent(NOW - 100 * MIN) } };
// One she filed under it herself: already queued, not a proposal.
const hers = { id: 'w-c', parent: 'w-p', title: 'Draw the sign-in screen', status: 'open', body: 'Draw it.', createdAt: NOW - 4 * MIN, updatedAt: NOW - 4 * MIN, wrote: { body: her(NOW - 4 * MIN) } };

function rows(children = [proposal, finished, hers], commands = []) {
  return {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: [snap(parent, parentLines), ...children.map((c) => snap(c, [{ ts: c.createdAt, source: c.labels?.length === 0 ? 'agent' : 'founder', patch: { body: c.body } }]))],
    commands,
  };
}
function open(r, id = 'w-p') {
  const view = phoneView(r, NOW);
  return threadOf(r, view, A, id, { tabs: phoneTabs(view, NOW) });
}

describe('the threads it filed', () => {
  it('are listed oldest first, each with where it stands', () => {
    const t = open(rows());
    expect(t.filed.map((f) => [f.id, f.title])).toEqual([
      ['w-b', 'Check the App Review rules'],
      ['w-a', 'Add a report button'],
      ['w-c', 'Draw the sign-in screen'],
    ]);
    // In the tab the inbox shows it in: a proposal waits in Later.
    expect(t.filed.find((f) => f.id === 'w-b').state).toBe('done');
    expect(t.filed.find((f) => f.id === 'w-a').state).toBe('scheduled');
  });

  it('only an agent\'s proposal still waiting can be answered', () => {
    const t = open(rows());
    expect(Object.fromEntries(t.filed.map((f) => [f.id, f.approve]))).toEqual({ 'w-a': true, 'w-b': false, 'w-c': false });
    expect(t.waitingFiled.map((f) => f.id)).toEqual(['w-a']);
  });

  it('each sits under the turn that filed it, the newest turn\'s at the foot', () => {
    const t = open(rows());
    const onTurns = [...t.filedOnTurn.values()].flat().map((f) => f.id);
    expect(onTurns).toEqual(['w-b']);
    // It hangs off the agent's last word before her reply.
    const [at] = [...t.filedOnTurn.keys()];
    expect(t.events[at]).toMatchObject({ who: 'it', text: 'Read the code.' });
    expect(t.filedAtFoot.map((f) => f.id)).toEqual(['w-a', 'w-c']);
  });

  it('its presses and heading say what the site\'s say', () => {
    expect(FILED_WORDS).toEqual({ START_NEW, DO_HERE, DISMISS });
    for (const n of [1, 2, 5]) expect(waitingWords(n)).toBe(siteWaitingWords(n));
  });

  it('a thread that filed nothing lists nothing', () => {
    const t = open(rows([]));
    expect(t.filed).toEqual([]);
    expect(t.waitingFiled).toEqual([]);
  });
});

describe('a thread filed from another', () => {
  it('opens with the message that asked for it, said on the thread above', () => {
    const t = open(rows(), 'w-a');
    expect(t.parent?.id).toBe('w-p');
    expect(t.events[0]).toMatchObject({ who: 'you', text: 'Keep going.', on: 'Plan the phone app' });
  });

  it('a thread with no parent opens with its own first message', () => {
    const t = open(rows());
    expect(t.parent).toBeNull();
    expect(t.events[0]).toMatchObject({ who: 'you', text: 'Plan the phone app.' });
    expect(t.events[0].on).toBeUndefined();
  });
});

describe('closing', () => {
  it('asks first while a filed task waits, in the site\'s words', () => {
    const t = open(rows());
    expect(t.closeAsk).toEqual(closeAsk(1));
    expect(t.closeAsk.ask).toBe('Before this closes: one task it filed has not started.');
  });

  it('closes without asking when nothing waits', () => {
    expect(open(rows([finished, hers])).closeAsk).toBeNull();
  });
});

describe('the presses on a filed thread', () => {
  async function leaves(press, item) {
    const r = rows();
    let n = 0;
    const client = { generation: () => 0, update: async () => [], insertCommand: async (row) => ({ id: `c-${++n}`, created_at: iso(NOW), taken_at: null, outcome: null, ...row }) };
    const sender = phoneSender({ client, rows: () => r, setRows: (next) => Object.assign(r, next), aliases: () => ({}), changed: () => {} });
    const plan = planFor(press, item, NOW);
    await runSteps(sender, plan.steps);
    return { plan, left: r.commands.map(({ item: on, kind, payload }) => ({ item: on, kind, payload })) };
  }
  const child = { ...proposal, product: A, productName: 'Alpha' };
  const above = { ...parent, product: A, productName: 'Alpha' };

  it('New thread approves it, as the site\'s Approve does', async () => {
    const { plan, left } = await leaves({ kind: 'approve-filed' }, child);
    expect(left).toEqual([{ item: 'w-a', kind: 'reply', payload: { text: 'Approved. Run it.' } }]);
    expect(plan.toast).toBe('Running → Add a report button · press Z to undo');
  });

  it('Do here sends it to the thread that filed it, then closes it', async () => {
    const { plan, left } = await leaves({ kind: 'do-here', child, parent: above }, child);
    expect(left).toEqual([
      { item: 'w-p', kind: 'reply', payload: { text: doItHereWords(child) } },
      { item: 'w-a', kind: 'close', payload: {} },
    ]);
    expect(plan.toast).toBe('Doing it in this thread: Add a report button · press Z to undo');
  });

  it('Dismiss closes it', async () => {
    const { left } = await leaves({ kind: 'close' }, child);
    expect(left).toEqual([{ item: 'w-a', kind: 'close', payload: {} }]);
  });

  it('Do here does nothing for a thread that was not filed from this one', () => {
    expect(planFor({ kind: 'do-here', child: { ...child, parent: 'w-other' }, parent: above }, child, NOW)).toBeNull();
  });
});
