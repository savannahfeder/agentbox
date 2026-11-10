// THE PHONE APP BRINGS BACK A THREAD WHOSE TASKS WAITED A DAY, AS THE DESKTOP DOES.
//
// An agent can file tasks under a thread, and they wait in Later for a yes.
// After a day unanswered the desktop puts the THREAD back in Needs you
// (list-rules.ts `threadsOwedAnAnswer`, read by App.tsx's inbox). The app's tab
// rules (mobile/src/lib/tabs.ts) never asked it, so on the phone that thread
// stayed wherever it was: Codex's parity audit, finding 11, reproduced here by
// building the tabs from a parent and a proposal filed 25 hours ago.
import { describe, it, expect } from 'vitest';
import { phoneView } from '../renderer/src/phone-rows';
import { phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.UTC(2026, 9, 20, 12);
const HOUR = 3_600_000;
const DEV = 'a1b2c3d4e5f6';
const iso = (ms) => new Date(ms).toISOString();
const her = (ts) => ({ ts, source: 'founder' });
const agent = (ts) => ({ ts, source: 'agent' });

function rows(threads) {
  return {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: threads.map((item) => ({
      device: DEV, project: 'alpha', item: item.id, updated_at: iso(item.updatedAt ?? NOW),
      snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], priority: 0, createdAt: NOW - 30 * HOUR, updatedAt: NOW - 20 * HOUR, ...item }, history: [] },
    })),
    commands: [],
  };
}
const tabsOf = (r) => phoneTabs(phoneView(r, NOW), NOW);
const ids = (list) => list.map((row) => row.id);
// The thread she wrote, answered by an agent and then closed by it: Done, not news.
const parent = (extra = {}) => ({ id: 'w-p', title: 'Plan the launch', status: 'done', labels: [], result: 'Filed two tasks.', wrote: { status: agent(NOW - 20 * HOUR) }, ...extra });
// A task an agent filed under it, waiting for a yes.
const filed = (ageHours) => ({ id: 'w-c', title: 'Draw the poster', parent: 'w-p', status: 'open', labels: [], createdAt: NOW - ageHours * HOUR, updatedAt: NOW - ageHours * HOUR });

describe('a thread whose filed tasks have waited', () => {
  it('a day and an hour comes back to Needs you', () => {
    const t = tabsOf(rows([parent(), filed(25)]));
    expect(ids(t.inbox)).toEqual(['w-p']);
    expect(ids(t.done)).toEqual([]);
  });

  it('an hour short of a day stays where it was', () => {
    const t = tabsOf(rows([parent(), filed(23)]));
    expect(ids(t.inbox)).toEqual([]);
    expect(ids(t.done)).toEqual(['w-p']);
  });

  it('and the filed task itself never comes to Needs you: it waits in Later', () => {
    const t = tabsOf(rows([parent(), filed(25)]));
    expect(ids(t.snoozed)).toEqual(['w-c']);
  });

  it('but a thread she closed herself stays closed, however long they wait', () => {
    const t = tabsOf(rows([parent({ wrote: { status: her(NOW - 20 * HOUR) } }), filed(48)]));
    expect(ids(t.inbox)).toEqual([]);
    expect(ids(t.done)).toEqual(['w-p']);
  });
});
