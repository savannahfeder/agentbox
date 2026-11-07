// THE PHONE APP'S THREAD OFFERS WHAT THE SITE OFFERS, WHILE IT RUNS AND AFTER.
//
// Codex's parity audit (findings 12, 14, 20, 23). The phone site's thread puts
// Stop in the reply box's send slot while a task is in progress. It offers Run
// now in its menu, Send now on a message waiting for the agent's current step,
// and "send back to agent" under a stopped one (components/Focus.tsx,
// Thread.tsx, run-now.ts). Its live line names the newest step, how long the
// run has been up and how many steps came before (Live.tsx, live-line.ts). An
// untagged thread reads Medium, as it runs (shared/rank.mjs `shownPriority`).
// Its summary strips the bullet marks an agent wrote and says when it was last
// updated (Summary.tsx). The app offered none of the four presses, showed only
// the first step, drew an untagged thread as Low, and doubled the bullets.
// These hold the app (mobile/src/lib/thread-offers.ts, mobile/src/lib/actions.ts)
// to the site, along with what must not be offered: Stop on a thread not in
// progress, Run now while a run is up, and Send back on a thread still open.
import { describe, it, expect } from 'vitest';
import { phoneSlug } from '../renderer/src/phone-rows';
import { phoneSender } from '../renderer/src/phone-send';
import { liveOf, offersOf, shownLevel, summaryParts } from '../mobile/src/lib/thread-offers';
import { planFor, runSteps } from '../mobile/src/lib/actions';

const NOW = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;
const A = phoneSlug('a1b2c3d4e5f6', 'alpha');
const item = (over = {}) => ({ id: 'w-1', product: A, productName: 'Alpha', title: 'Draw it', kind: 'directive', labels: ['founder'], status: 'open', priority: 0, createdAt: NOW - 60 * MIN, updatedAt: NOW - MIN, ...over });
const session = (activity = []) => ({ itemId: 'w-1', product: A, startedAt: NOW - 14 * MIN, activity, tail: [] });

describe('Stop', () => {
  it('takes the send slot while the thread is in progress', () => {
    expect(offersOf(item({ status: 'claimed' }), { session: session(), inProgress: true, now: NOW }).stop).toBe(true);
    expect(offersOf(item(), { session: null, inProgress: true, now: NOW }).stop).toBe(true);
  });
  it('is not offered on a thread that is not in progress', () => {
    expect(offersOf(item(), { session: null, inProgress: false, now: NOW }).stop).toBe(false);
  });
});

describe('Run now', () => {
  it('is in the menu while a thread in progress waits for an agent', () => {
    expect(offersOf(item(), { session: null, inProgress: true, now: NOW }).runNow).toBe(true);
  });
  it('is not offered while a run is up, or on a thread not in progress', () => {
    expect(offersOf(item(), { session: session(), inProgress: true, now: NOW }).runNow).toBe(false);
    expect(offersOf(item(), { session: null, inProgress: false, now: NOW }).runNow).toBe(false);
  });
});

describe('Send now', () => {
  it('is offered on a waiting message while a run is up', () => {
    expect(offersOf(item(), { session: session(), inProgress: true, now: NOW }).sendNow).toBe(true);
  });
  it('is not offered with nothing running', () => {
    expect(offersOf(item(), { session: null, inProgress: true, now: NOW }).sendNow).toBe(false);
  });
});

describe('send back to agent', () => {
  it('is under a stopped thread with nothing running', () => {
    expect(offersOf(item({ status: 'blocked' }), { session: null, inProgress: false, now: NOW }).sendBack).toBe(true);
  });
  it('is not offered on a stopped thread something is running on, or on an open one', () => {
    expect(offersOf(item({ status: 'blocked' }), { session: session(), inProgress: false, now: NOW }).sendBack).toBe(false);
    expect(offersOf(item(), { session: null, inProgress: false, now: NOW }).sendBack).toBe(false);
  });
});

describe('a thread put off', () => {
  it('can be brought back from under the thread, saying until when', () => {
    const back = offersOf(item({ snoozedUntil: NOW + 120 * MIN, wrote: { snoozedUntil: { ts: NOW - MIN, source: 'founder' } } }), { session: null, inProgress: false, now: NOW }).back;
    expect(back?.label).toBe('back to inbox');
    expect(back?.dim).toMatch(/^in Later until today /);
  });
  it('one an agent paused is let run now', () => {
    const back = offersOf(item({ runAt: NOW + 120 * MIN, wrote: { runAt: { ts: NOW - MIN, source: 'agent' } } }), { session: null, inProgress: false, now: NOW }).back;
    expect(back?.label).toBe('let it run now');
    expect(back?.dim).toMatch(/^the agent paused this until /);
  });
  it('a thread not put off offers neither', () => {
    expect(offersOf(item(), { session: null, inProgress: false, now: NOW }).back).toBeNull();
  });
  it('Later starts with "Now" only on a thread put off', () => {
    expect(offersOf(item({ snoozedUntil: NOW + 120 * MIN, wrote: { snoozedUntil: { ts: NOW - MIN, source: 'founder' } } }), { session: null, inProgress: false, now: NOW }).laterNow).toBe(true);
    expect(offersOf(item(), { session: null, inProgress: false, now: NOW }).laterNow).toBe(false);
  });
});

describe('the live line', () => {
  const steps = [
    { id: 'a', label: 'Read the sign-in page', detail: '', startedAt: NOW - 9 * MIN },
    { id: 'b', label: 'Wrote the five screens', detail: '', startedAt: NOW - 6 * MIN },
    { id: 'c', label: 'Drawing the third screen', detail: '', startedAt: NOW - MIN },
  ];
  it('names the newest step, how many came before it and how long the run has been up', () => {
    const live = liveOf(item({ status: 'claimed' }), { session: session(steps), inProgress: true, now: NOW });
    expect(live).toMatchObject({ state: 'working', working: true, word: 'Drawing the third screen', more: 2, span: '14m' });
    expect(live.rows.map((r) => r.label)).toEqual(steps.map((s) => s.label));
  });
  it('says Thinking before the first step', () => {
    expect(liveOf(item({ status: 'claimed' }), { session: session([]), inProgress: true, now: NOW })).toMatchObject({ word: 'Thinking', more: 0 });
  });
  it('in progress with nothing running says so, still', () => {
    expect(liveOf(item(), { session: null, inProgress: true, now: NOW })).toMatchObject({ state: 'idle', working: false, word: 'Nothing running', span: null });
  });
  it('a finished thread has no live line', () => {
    expect(liveOf(item({ status: 'done' }), { session: null, inProgress: false, now: NOW })).toBeNull();
  });
});

describe('the priority a thread shows', () => {
  it('is Medium when untagged, as it runs', () => {
    expect(shownLevel(item({ priority: 0 }))).toBe('medium');
    expect(shownLevel(item({ priority: undefined }))).toBe('medium');
  });
  it('is its own level when it has one', () => {
    expect(shownLevel(item({ priority: 9 }))).toBe('urgent');
    expect(shownLevel(item({ priority: 2 }))).toBe('low');
  });
});

describe('the summary', () => {
  it('draws each step once, without the marks an agent wrote before it', () => {
    expect(summaryParts(item({ progress: '- Read the code\n✓ Drew the screens\n\n* Shipped' }), NOW).steps).toEqual(['Read the code', 'Drew the screens', 'Shipped']);
  });
  it('says when it was last written', () => {
    expect(summaryParts(item({ problem: 'Why', wrote: { problem: { ts: NOW - 6 * MIN, source: 'agent' } } }), NOW).updated).toBe('6 min ago');
  });
  it('says nothing about when, if it was never written', () => {
    expect(summaryParts(item(), NOW).updated).toBeNull();
  });
});

describe('what each press leaves for your Mac', () => {
  async function leaves(press, it = item()) {
    const r = { projects: [], threads: [], commands: [] };
    let n = 0;
    const client = { generation: () => 0, update: async () => [], insertCommand: async (row) => ({ id: `c-${++n}`, created_at: new Date(NOW).toISOString(), taken_at: null, outcome: null, ...row }) };
    const sender = phoneSender({ client, rows: () => r, setRows: (next) => Object.assign(r, next), aliases: () => ({}), changed: () => {} });
    await runSteps(sender, planFor(press, it, NOW).steps);
    return r.commands.map((c) => c.kind);
  }
  it('Stop, Run now, Send now and send back are the site\'s four commands', async () => {
    expect(await leaves({ kind: 'stop' })).toEqual(['stop']);
    expect(await leaves({ kind: 'run-now' })).toEqual(['run-now']);
    expect(await leaves({ kind: 'send-now' })).toEqual(['send-now']);
    expect(await leaves({ kind: 'send-back' })).toEqual(['reopen']);
  });
  it('Send now raises no toast, as the site raises none', () => {
    expect(planFor({ kind: 'send-now' }, item(), NOW).toast).toBeUndefined();
  });
});
