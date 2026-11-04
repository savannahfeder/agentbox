// A TASK TAKEN INTO ITS THREAD ON THE PHONE SAYS MOVED HERE, NOT DONE. AND
// LATER ON A RUNNING THREAD SAYS IT FINISHES FIRST.
//
// The 2026-11-03 phone workday. Do here closes the proposal and hands its words
// to the thread above, so the filed row read DONE while nothing had run yet
// (issue 17); measured on the preview: Plan the phone app, Do here, row said
// DONE under Queued. And Later on a thread that was running toasted "Moved to
// Later" while the thread stayed under In progress, which is right (a running
// thread stays in progress until it ends) but the toast said otherwise
// (issues 10, 12).
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { phoneSender } from '../renderer/src/phone-send';
import { doItHereWords } from '../renderer/src/threads-made';
import { threadOf } from '../mobile/src/lib/thread';
import { phoneTabs } from '../mobile/src/lib/tabs';
import { planFor, runSteps } from '../mobile/src/lib/actions';

const NOW = Date.UTC(2026, 9, 20, 12);
const MIN = 60_000;
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const her = (ts) => ({ ts, source: 'founder' });
const agent = (ts) => ({ ts, source: 'agent' });
const snap = (item, history) => ({ device: DEV, project: 'alpha', item: item.id, updated_at: iso(item.updatedAt), snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], priority: 0, ...item }, history: history.map((l) => ({ id: item.id, ...l })) } });

const parent = { id: 'w-p', title: 'Plan the phone app', status: 'blocked', body: 'Plan the phone app.', note: 'Here is the plan.', createdAt: NOW - 300 * MIN, updatedAt: NOW - 10 * MIN, wrote: { body: her(NOW - 300 * MIN), note: agent(NOW - 10 * MIN) } };
const parentLines = [
  { ts: NOW - 300 * MIN, source: 'founder', patch: { body: 'Plan the phone app.' } },
  { ts: NOW - 10 * MIN, source: 'agent', patch: { status: 'blocked', note: 'Here is the plan.' } },
];
const proposal = { id: 'w-a', parent: 'w-p', labels: [], title: 'Add a report button', status: 'open', body: 'Add a Report row to the message menu.', createdAt: NOW - 5 * MIN, updatedAt: NOW - 5 * MIN, wrote: { body: agent(NOW - 5 * MIN) } };
const finished = { id: 'w-b', parent: 'w-p', labels: [], title: 'Check the App Review rules', status: 'done', result: 'Two rules.', createdAt: NOW - 210 * MIN, updatedAt: NOW - 100 * MIN, wrote: { body: agent(NOW - 210 * MIN), status: agent(NOW - 100 * MIN) } };

const rows = (threads) => ({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }], threads, commands: [] });
const childSnap = (c) => snap(c, [{ ts: c.createdAt, source: 'agent', patch: { body: c.body } }]);
const open = (r) => { const view = phoneView(r, NOW); return threadOf(r, view, A, 'w-p', { tabs: phoneTabs(view, NOW) }); };
const filedById = (t) => Object.fromEntries(t.filed.map((f) => [f.id, f]));

describe('a task taken into its thread with Do here', () => {
  it('is marked moved here the moment the phone sends it', async () => {
    const r = rows([snap(parent, parentLines), childSnap(proposal), childSnap(finished)]);
    let n = 0;
    const client = { generation: () => 0, update: async () => [], insertCommand: async (row) => ({ id: `c-${++n}`, created_at: iso(NOW), taken_at: null, outcome: null, ...row }) };
    const sender = phoneSender({ client, rows: () => r, setRows: (next) => Object.assign(r, next), aliases: () => ({}), changed: () => {} });
    const plan = planFor({ kind: 'do-here', child: { ...proposal, product: A }, parent: { ...parent, product: A } }, { ...proposal, product: A }, NOW);
    await runSteps(sender, plan.steps);
    const f = filedById(open(r));
    expect(f['w-a'].here).toBe(true);
  });

  it('stays moved here once the computer has closed it and taken the message', () => {
    const asked = { ...parent, status: 'open', answer: doItHereWords(proposal), wrote: { ...parent.wrote, answer: her(NOW - 2 * MIN) } };
    const r = rows([
      snap(asked, [...parentLines, { ts: NOW - 2 * MIN, source: 'founder', patch: { answer: doItHereWords(proposal), status: 'open' } }]),
      childSnap({ ...proposal, status: 'done', wrote: { ...proposal.wrote, status: her(NOW - 2 * MIN) } }),
      childSnap(finished),
    ]);
    const f = filedById(open(r));
    expect(f['w-a'].state).toBe('done');
    expect(f['w-a'].here).toBe(true);
  });

  it('a task that finished on its own is not marked', () => {
    const r = rows([snap(parent, parentLines), childSnap(proposal), childSnap(finished)]);
    const f = filedById(open(r));
    expect(f['w-b'].here).toBe(false);
    expect(f['w-a'].here).toBe(false);
  });

  it('a different task\'s Do here does not mark this one', () => {
    const other = { ...proposal, id: 'w-x', title: 'Add a report button to groups' };
    const asked = { ...parent, answer: doItHereWords(other) };
    const r = rows([snap(asked, [...parentLines, { ts: NOW - 2 * MIN, source: 'founder', patch: { answer: doItHereWords(other) } }]), childSnap({ ...proposal, status: 'done', wrote: { status: her(NOW - 2 * MIN) } })]);
    expect(filedById(open(r))['w-a'].here).toBe(false);
  });
});

describe('Later on a thread', () => {
  const item = { product: A, id: 'w-r', status: 'claimed', title: 'Write the launch script' };
  it('that is running says it finishes first', () => {
    expect(planFor({ kind: 'later', until: NOW + 30 * MIN, label: 'In 30 minutes', running: true }, item, NOW).toast)
      .toBe('Goes to Later when it finishes · press Z to undo');
  });
  it('that is not running says it moved', () => {
    expect(planFor({ kind: 'later', until: NOW + 30 * MIN, label: 'In 30 minutes' }, { ...item, status: 'open' }, NOW).toast)
      .toBe('Moved to Later. Back in 30 minutes · press Z to undo');
  });
});
