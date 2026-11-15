// THE PHONE FILTERS THREADS BY AGENT, AS THE DESKTOP DOES.
//
// The desktop's filter narrows a box by project, priority or agent (Claude
// Code or Codex, renderer/src/box-filter.ts). The phone's View and filters had
// project and priority only: read off mobile/src/ui/Filters.tsx, which drew no
// Agent line, and mobile/src/lib/tabs.ts, whose `shownTabs` took no agent. The
// cases below run the desktop's own `harnessOf` and `filterMenu` through the
// phone's lists, so the two cannot disagree about which agent a thread is.
import { describe, it, expect } from 'vitest';
import { phoneView } from '../renderer/src/phone-rows';
import { DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules';
import { phoneBoard, phoneTabs, shownTabs } from '../mobile/src/lib/tabs';
import { agentChoices, phoneFiltered } from '../mobile/src/lib/agent-filter';
import { previewRows } from '../mobile/src/lib/preview';

const NOW = Date.UTC(2026, 10, 8, 12);
const HOUR = 3_600_000;
const DEV = 'a1b2c3d4e5f6';
const iso = (ms) => new Date(ms).toISOString();
const her = (ts) => ({ ts, source: 'founder' });
const agent = (ts) => ({ ts, source: 'agent' });

function rows(threads) {
  return {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: threads.map((item) => ({
      device: DEV, project: 'alpha', item: item.id, updated_at: iso(NOW),
      snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], priority: 0, createdAt: NOW - 30 * HOUR, updatedAt: NOW - HOUR, ...item }, history: [] },
    })),
    commands: [],
  };
}
const asks = (id, extra = {}) => ({ id, title: `Thread ${id}`, status: 'blocked', result: 'Which one?', wrote: { body: her(NOW - 30 * HOUR), result: agent(NOW - HOUR) }, ...extra });
const ids = (list) => list.map((r) => r.id);
const tabsOf = (r) => { const v = phoneView(r, NOW); return { v, tabs: phoneTabs(v, NOW), order: v.products.map((p) => p.slug) }; };

const both = rows([asks('w-claude'), asks('w-codex', { engine: 'codex' }), asks('w-imported', { labels: ['founder', 'codex-import'] })]);
const claudeOnly = rows([asks('w-1'), asks('w-2')]);

describe('the Agent line in View and filters', () => {
  it('offers Claude Code and Codex in the desktop\'s words when the tab holds both', () => {
    const { tabs } = tabsOf(both);
    expect(agentChoices(tabs.inbox, DEFAULT_DISPLAY.inbox, NOW, null).map((c) => [c.value, c.label, c.on]))
      .toEqual([['claude', 'Claude Code', false], ['codex', 'Codex', false]]);
  });

  it('is not offered when every thread in the tab is one agent\'s', () => {
    const { tabs } = tabsOf(claudeOnly);
    expect(agentChoices(tabs.inbox, DEFAULT_DISPLAY.inbox, NOW, null)).toEqual([]);
  });

  it('stays while one is picked, so it can be taken off again', () => {
    const { tabs } = tabsOf(claudeOnly);
    expect(agentChoices(tabs.inbox, DEFAULT_DISPLAY.inbox, NOW, 'codex').map((c) => [c.value, c.on])).toEqual([['claude', false], ['codex', true]]);
  });

  it('is read after the other filters, as the desktop counts each part', () => {
    const { tabs } = tabsOf(rows([asks('w-claude', { priority: 9 }), asks('w-codex', { engine: 'codex', priority: 1 })]));
    expect(agentChoices(tabs.inbox, { ...DEFAULT_DISPLAY.inbox, priorities: ['urgent'] }, NOW, null)).toEqual([]);
  });

  it('shows in the browser preview, which has a Codex thread among Claude ones', () => {
    const { tabs } = tabsOf(previewRows(NOW));
    expect(agentChoices(tabs.inbox, DEFAULT_DISPLAY.inbox, NOW, null).map((c) => c.value)).toEqual(['claude', 'codex']);
  });
});

describe('picking an agent', () => {
  it('keeps only that agent\'s threads, a thread brought in from Codex counting as Codex', () => {
    const { tabs, order } = tabsOf(both);
    expect(ids(shownTabs(tabs, DEFAULT_DISPLAY.inbox, NOW, order, 'codex').rows.inbox).sort()).toEqual(['w-codex', 'w-imported']);
    expect(ids(shownTabs(tabs, DEFAULT_DISPLAY.inbox, NOW, order, 'claude').rows.inbox)).toEqual(['w-claude']);
  });

  it('keeps everything with no agent picked', () => {
    const { tabs, order } = tabsOf(both);
    expect(shownTabs(tabs, DEFAULT_DISPLAY.inbox, NOW, order, null).rows.inbox).toHaveLength(3);
  });

  it('leaves the whole tab\'s count alone, so an emptied tab says how many it hides', () => {
    const { tabs, order } = tabsOf(claudeOnly);
    const shown = shownTabs(tabs, DEFAULT_DISPLAY.inbox, NOW, order, 'codex');
    expect(shown.rows.inbox).toHaveLength(0);
    expect(shown.whole.inbox).toBe(2);
  });

  it('narrows the board too', () => {
    const { v, tabs } = tabsOf(both);
    const cards = (b) => b.flatMap((c) => c.rows.map((e) => e.item.id));
    expect(cards(phoneBoard(v, tabs, DEFAULT_DISPLAY.inbox, NOW, 'claude'))).toEqual(['w-claude']);
    expect(cards(phoneBoard(v, tabs, DEFAULT_DISPLAY.inbox, NOW, null))).toHaveLength(3);
  });

  it('counts as a filter for the dot on View and filters, and not with none picked', () => {
    expect(phoneFiltered(DEFAULT_DISPLAY.inbox, 'codex')).toBe(true);
    expect(phoneFiltered(DEFAULT_DISPLAY.inbox, null)).toBe(false);
    expect(phoneFiltered({ ...DEFAULT_DISPLAY.inbox, priorities: ['high'] }, null)).toBe(true);
  });
});
