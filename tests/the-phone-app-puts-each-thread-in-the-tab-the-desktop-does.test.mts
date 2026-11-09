// THE PHONE APP PUTS EACH THREAD IN THE TAB THE DESKTOP DOES (docs/mobile/PLAN.md).
//
// The app draws the desktop's four tabs from the copies a Mac sends online.
// The desktop works its tabs out inside App.tsx, mixed with teammates, agent
// sessions and imports the phone never has, so the app composes the same
// exported rules (list-rules.ts) for the cases the online inbox can hold, and
// orders rows the way the desktop draws them (threads/page-rules.ts `sorted`).
// These cases pin that it agrees: the ones that should land in each tab, the
// boundary either side of a snooze, and the agent work nobody touched, which
// must not reach Needs you.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { phoneTabs, TABS } from '../mobile/src/lib/tabs';

const NOW = Date.UTC(2026, 9, 20, 12);
const DEV = 'a1b2c3d4e5f6';
const iso = (ms) => new Date(ms).toISOString();
const her = (ts) => ({ ts, source: 'founder' });
const agent = (ts) => ({ ts, source: 'agent' });

// In name order, as the app's read asks for them (`order=name`).
function rows(threads, { commands = [], projects = [['alpha', 'Alpha'], ['beta', 'Beta']] } = {}) {
  return {
    projects: projects.map(([project, name]) => ({ device: DEV, project, name, updated_at: iso(NOW) })),
    threads: threads.map(({ project = 'alpha', live, ...item }) => ({
      device: DEV, project, item: item.id, updated_at: iso(item.updatedAt ?? NOW),
      snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], priority: 0, createdAt: NOW - 9e6, updatedAt: NOW - 1000, ...item }, history: [], ...(live ? { live } : {}) },
    })),
    commands,
  };
}
const tabsOf = (r) => phoneTabs(phoneView(r, NOW), NOW);
const ids = (list) => list.map((row) => row.id);

describe('the four tabs', () => {
  it('are the desktop\'s, in its words and order', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Needs you', 'In progress', 'Later', 'Done']);
  });

  it('an agent finishing a thread you wrote is news: Needs you, however long ago', () => {
    const t = tabsOf(rows([{ id: 'w-1', status: 'done', result: 'Shipped.', wrote: { body: her(NOW - 9e6), status: agent(NOW - 30 * 86_400_000), result: agent(NOW - 30 * 86_400_000) } }]));
    expect(ids(t.inbox)).toEqual(['w-1']);
    expect(ids(t.done)).toEqual([]);
  });

  it('a thread you closed yourself is Done, not news', () => {
    const t = tabsOf(rows([{ id: 'w-1', status: 'done', wrote: { body: her(NOW - 9e6), status: her(NOW - 1000) } }]));
    expect(ids(t.inbox)).toEqual([]);
    expect(ids(t.done)).toEqual(['w-1']);
  });

  it('agent work you never touched does not reach Needs you', () => {
    const t = tabsOf(rows([{ id: 'w-1', status: 'done', labels: [], result: 'Tidied.', wrote: { status: agent(NOW - 1000) } }]));
    expect(ids(t.inbox)).toEqual([]);
    expect(ids(t.done)).toEqual(['w-1']);
  });

  it('a thread an agent is on right now is In progress, even when it says done', () => {
    const live = { since: NOW - 60_000, at: NOW - 30_000, where: 'mac', doing: [] };
    const t = tabsOf(rows([{ id: 'w-1', status: 'done', result: 'Almost.', wrote: { body: her(NOW - 9e6), status: agent(NOW - 1000) }, live }]));
    expect(ids(t.progress)).toEqual(['w-1']);
    expect(ids(t.inbox)).toEqual([]);
    expect(ids(t.done)).toEqual([]);
  });

  it('a run the Mac stopped reporting ten minutes ago is not drawn as running', () => {
    const live = { since: NOW - 3_600_000, at: NOW - 11 * 60_000, where: 'mac', doing: [] };
    const t = tabsOf(rows([{ id: 'w-1', status: 'done', result: 'Done.', wrote: { body: her(NOW - 9e6), status: agent(NOW - 1000) }, live }]));
    expect(ids(t.progress)).toEqual([]);
    expect(ids(t.inbox)).toEqual(['w-1']);
  });

  it('a reply sent from the phone moves the thread to In progress at once', () => {
    const r = rows([{ id: 'w-1', status: 'blocked', result: 'Which one?', wrote: { body: her(NOW - 9e6), result: agent(NOW - 5000) } }], {
      commands: [{ id: 'c1', device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'The first' }, created_at: iso(NOW - 1000), taken_at: null, outcome: null }],
    });
    const before = tabsOf({ ...r, commands: [] });
    expect(ids(before.inbox)).toEqual(['w-1']);
    const after = tabsOf(r);
    expect(ids(after.progress)).toEqual(['w-1']);
    expect(ids(after.inbox)).toEqual([]);
  });

  it('a thread you put off is in Later until its moment, and back in Needs you after it', () => {
    const put = (until) => tabsOf(rows([{ id: 'w-1', status: 'blocked', result: 'Which one?', snoozedUntil: until, wrote: { body: her(NOW - 9e6), result: agent(NOW - 5000), snoozedUntil: her(NOW - 4000) } }]));
    expect(ids(put(NOW + 60_000).snoozed)).toEqual(['w-1']);
    expect(ids(put(NOW + 60_000).inbox)).toEqual([]);
    expect(ids(put(NOW - 1).inbox)).toEqual(['w-1']);
    expect(ids(put(NOW - 1).snoozed)).toEqual([]);
  });
});

describe('the order', () => {
  it('runs by project, then priority, then the newest, as the desktop draws it', () => {
    const asks = (id, project, priority, updatedAt) => ({ id, project, priority, updatedAt, status: 'blocked', result: '?', wrote: { body: her(NOW - 9e6), result: agent(updatedAt) } });
    const t = tabsOf(rows([
      asks('w-b1', 'beta', 9, NOW - 1000),
      asks('w-a1', 'alpha', 0, NOW - 5000),
      asks('w-a2', 'alpha', 7, NOW - 9000),
      asks('w-a3', 'alpha', 7, NOW - 2000),
    ]));
    // A project's place outranks any priority: Beta's Urgent sits under all of Alpha.
    expect(ids(t.inbox)).toEqual(['w-a3', 'w-a2', 'w-a1', 'w-b1']);
  });

  it('Done runs newest finished first', () => {
    const done = (id, at) => ({ id, status: 'done', wrote: { body: her(NOW - 9e6), status: her(at) } });
    expect(ids(tabsOf(rows([done('w-1', NOW - 9000), done('w-2', NOW - 1000)])).done)).toEqual(['w-2', 'w-1']);
  });
});

describe('a row', () => {
  // When you last wrote, not when the agent did, since w-21b638d821.
  it('carries its title, its project and when you last wrote on it, in the desktop\'s words', () => {
    const t = tabsOf(rows([{ id: 'w-1', title: 'Plan the phone app', status: 'blocked', result: '?', updatedAt: NOW - 60_000, wrote: { body: her(NOW - 6 * 60_000), result: agent(NOW - 60_000) } }]));
    expect(t.inbox[0]).toMatchObject({ id: 'w-1', product: phoneSlug(DEV, 'alpha'), title: 'Plan the phone app', projectName: 'Alpha', when: '6 min ago' });
  });
});
