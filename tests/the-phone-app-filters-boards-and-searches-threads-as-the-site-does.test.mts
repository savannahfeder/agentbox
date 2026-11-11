// THE PHONE APP FILTERS, BOARDS AND SEARCHES THREADS AS THE PHONE SITE DOES.
//
// Codex's parity audit (findings 28, 29 and 33) and a walk through the phone
// site at 402px: the site offers View and filters (List or Board, Sort by,
// Priority, Project, Updated, "Showing N of M", Clear filters), a search over
// every thread in every tab, a "not started" and a "2 tasks to approve" after a
// row's title, and an empty inbox that says what is running. The app had none
// of it. Each case below is built on the site's own rules (page-rules.ts,
// threads/search.ts, threads-made.ts) through mobile/src/lib/tabs.ts, so the
// two cannot answer differently.
import { describe, it, expect } from 'vitest';
import { phoneView } from '../renderer/src/phone-rows';
import { DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules';
import { phoneBoard, phoneSearch, phoneTabs, shownTabs } from '../mobile/src/lib/tabs';

const NOW = Date.UTC(2026, 9, 20, 12);
const HOUR = 3_600_000;
const DEV = 'a1b2c3d4e5f6';
const iso = (ms) => new Date(ms).toISOString();
const her = (ts) => ({ ts, source: 'founder' });
const agent = (ts) => ({ ts, source: 'agent' });

function rows(threads) {
  return {
    projects: [['alpha', 'Alpha'], ['beta', 'Beta']].map(([project, name]) => ({ device: DEV, project, name, updated_at: iso(NOW) })),
    threads: threads.map(({ project = 'alpha', live, ...item }) => ({
      device: DEV, project, item: item.id, updated_at: iso(item.updatedAt ?? NOW),
      snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], priority: 0, createdAt: NOW - 30 * HOUR, updatedAt: NOW - HOUR, ...item }, history: [], ...(live ? { live } : {}) },
    })),
    commands: [],
  };
}
const ids = (list) => list.map((row) => row.id);
const asks = (id, extra = {}) => ({ id, title: `Thread ${id}`, status: 'blocked', result: 'Which one?', wrote: { body: her(NOW - 30 * HOUR), result: agent(NOW - HOUR) }, ...extra });
const view = (r) => phoneView(r, NOW);
const order = (v) => v.products.map((p) => p.slug);
const shown = (r, display) => { const v = view(r); return shownTabs(phoneTabs(v, NOW), display, NOW, order(v)); };

describe('a row says what the site\'s row says after its title', () => {
  it('"not started" on a thread added to Later and not begun', () => {
    const t = phoneTabs(view(rows([{ id: 'w-1', status: 'open', start: 'later', wrote: { body: her(NOW - HOUR) } }])), NOW);
    expect(t.snoozed[0]).toMatchObject({ id: 'w-1', held: true });
  });

  it('nothing on a thread that is running', () => {
    const t = phoneTabs(view(rows([{ id: 'w-1', status: 'claimed', wrote: { body: her(NOW - HOUR) } }])), NOW);
    expect(t.progress[0]).toMatchObject({ held: false, toApprove: '' });
  });

  it('how many tasks it filed still wait for a yes', () => {
    const filed = (id) => ({ id, title: id, parent: 'w-p', status: 'open', labels: [], createdAt: NOW - HOUR, updatedAt: NOW - HOUR });
    const t = phoneTabs(view(rows([asks('w-p'), filed('w-c1'), filed('w-c2')])), NOW);
    expect(t.inbox.find((r) => r.id === 'w-p')).toMatchObject({ toApprove: '2 tasks to approve' });
  });

  it('but not one already answered', () => {
    const t = phoneTabs(view(rows([asks('w-p'), { id: 'w-c', parent: 'w-p', status: 'open', labels: [], answer: 'Yes', createdAt: NOW - HOUR, updatedAt: NOW - HOUR }])), NOW);
    expect(t.inbox.find((r) => r.id === 'w-p')).toMatchObject({ toApprove: '' });
  });
});

describe('View and filters', () => {
  const tenDays = NOW - 10 * 24 * HOUR;
  const two = rows([asks('w-u', { priority: 9 }), asks('w-l', { priority: 1, project: 'beta' }), asks('w-old', { priority: 9, createdAt: tenDays, updatedAt: tenDays, wrote: { body: her(tenDays) } })]);

  it('keeps everything with no filter on, and counts it all', () => {
    const s = shown(two, DEFAULT_DISPLAY.inbox);
    expect(ids(s.rows.inbox).sort()).toEqual(['w-l', 'w-old', 'w-u']);
    expect(s.whole.inbox).toBe(3);
  });

  it('a priority keeps only that level, and the whole count still counts what is hidden', () => {
    const s = shown(two, { ...DEFAULT_DISPLAY.inbox, priorities: ['urgent'] });
    expect(ids(s.rows.inbox).sort()).toEqual(['w-old', 'w-u']);
    expect(s.whole.inbox).toBe(3);
  });

  it('a project keeps only its threads', () => {
    const v = view(two);
    const beta = v.products.find((p) => p.name === 'Beta').slug;
    const s = shownTabs(phoneTabs(v, NOW), { ...DEFAULT_DISPLAY.inbox, projects: [beta] }, NOW, order(v));
    expect(ids(s.rows.inbox)).toEqual(['w-l']);
  });

  it('Sent this week drops a thread you wrote ten days ago', () => {
    const s = shown(two, { ...DEFAULT_DISPLAY.inbox, updated: 'week' });
    expect(ids(s.rows.inbox)).not.toContain('w-old');
  });

  it('Sort by Sent puts the one you wrote to last first, whatever its priority', () => {
    const r = rows([asks('w-a', { priority: 9, wrote: { body: her(NOW - 5 * HOUR) } }), asks('w-b', { priority: 1, wrote: { body: her(NOW - HOUR) } })]);
    expect(ids(shown(r, { ...DEFAULT_DISPLAY.inbox, sort: 'updated' }).rows.inbox)).toEqual(['w-b', 'w-a']);
    expect(ids(shown(r, DEFAULT_DISPLAY.inbox).rows.inbox)).toEqual(['w-a', 'w-b']);
  });
});

describe('the board', () => {
  it('puts each thread in the column its tab gives it, Needs you first', () => {
    const r = rows([asks('w-1'), { id: 'w-2', status: 'claimed', wrote: { body: her(NOW - HOUR) } }]);
    const v = view(r);
    const cols = phoneBoard(v, phoneTabs(v, NOW), DEFAULT_DISPLAY.inbox, NOW);
    expect(cols.map((c) => c.label)).toEqual(['Needs you', 'In progress', 'Later', 'Done today']);
    expect(cols[0].rows.map((e) => e.item.id)).toEqual(['w-1']);
    expect(cols[1].rows.map((e) => e.item.id)).toEqual(['w-2']);
  });

  it('Done today holds only what was finished today', () => {
    const closed = (id, at) => ({ id, status: 'done', updatedAt: at, wrote: { body: her(NOW - 30 * HOUR), status: her(at) } });
    const v = view(rows([closed('w-today', NOW - HOUR), closed('w-before', NOW - 3 * 24 * HOUR)]));
    const done = phoneBoard(v, phoneTabs(v, NOW), DEFAULT_DISPLAY.inbox, NOW).find((c) => c.state === 'done');
    expect(done.rows.map((e) => e.item.id)).toEqual(['w-today']);
  });
});

describe('search', () => {
  const r = rows([
    asks('w-1', { title: 'Plan the phone app', updatedAt: NOW - 2 * HOUR }),
    { id: 'w-2', title: 'Rename the menu', body: 'Call it View.', status: 'done', updatedAt: NOW - 3 * 24 * HOUR, wrote: { body: her(NOW - 30 * HOUR), status: her(NOW - 3 * 24 * HOUR) } },
    asks('w-3', { title: 'Try a light theme for the phone', updatedAt: NOW - HOUR }),
  ]);

  it('finds a closed thread as well as an open one', () => {
    expect(phoneSearch(view(r), 'menu', NOW).map((h) => h.id)).toEqual(['w-2']);
  });

  it('marks the words it found in the title', () => {
    const hit = phoneSearch(view(r), 'phone', NOW).find((h) => h.id === 'w-1');
    expect(hit.title.filter((run) => run.hit).map((run) => run.text)).toEqual(['phone']);
  });

  it('with nothing typed lists every thread, newest first, and marks nothing', () => {
    const all = phoneSearch(view(r), '', NOW);
    expect(all.map((h) => h.id)).toEqual(['w-3', 'w-1', 'w-2']);
    expect(all.every((h) => h.title.every((run) => !run.hit))).toBe(true);
  });

  it('finds nothing for words no thread has', () => {
    expect(phoneSearch(view(r), 'zebra', NOW)).toEqual([]);
  });
});
