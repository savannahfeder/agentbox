// THE PHONE'S NEEDS YOU RUNS IN THE DESKTOP'S ORDER (QA m19, 2026-11-15).
//
// Paired with a desktop on one account, the Android app drew Needs you grouped
// by project (Fizz JS, Readme Only, Stack JS...) while the desktop put the
// Urgent thread first; a High thread sat 7th on the phone and 1st on the
// desktop, in 4 of 4 looks. The phone ranked projects by the order its list of
// projects happened to arrive in. The desktop ranks them by your running order
// of projects (`supervisor.productOrder`), which is often empty, and then by
// level. The phone now reads that running order from the computer's settings
// copy, so both draw the same order.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { phoneTabs, shownTabs, phoneProjectOrder } from '../mobile/src/lib/tabs';
import { DEFAULT_DISPLAY, sorted } from '../renderer/src/threads/page-rules';
import type { WorkItem } from '../renderer/src/types';

const NOW = Date.UTC(2026, 10, 15, 19);
const MIN = 60_000;
const DEV = 'a1b2c3d4e5f6';
const OTHER = 'ffff00001111';
const iso = (ms: number) => new Date(ms).toISOString();

// Done threads an agent closed wait in Needs you; each carries its project, level and age.
const thread = (project: string, id: string, priority: number | undefined, ago: number): WorkItem => ({
  id, product: project, kind: 'bug', labels: ['founder'], status: 'done', priority, title: id,
  createdAt: NOW - 9e6, updatedAt: NOW - ago * MIN, wrote: { status: { ts: NOW - ago * MIN, source: 'agent' } },
} as unknown as WorkItem);

const ITEMS = [
  thread('fizz', 'F', 5, 50),
  thread('fizz', 'A', 5, 40),
  thread('readme', 'L', 2, 5),
  thread('stack', 'K', 9, 3),
  thread('stack', 'E', 7, 30),
  thread('readme', 'M', 5, 1),
];

const settings = (device: string, productOrder: string[], at = NOW) => ({ device, name: 'Mac', updated_at: iso(at), settings: { workspace: { productOrder } } });

function phone(order: ReturnType<typeof settings>[]) {
  const rows = {
    projects: ['fizz', 'readme', 'stack'].map((p) => ({ device: DEV, project: p, name: p, updated_at: iso(NOW) })),
    threads: ITEMS.map((i) => ({ device: DEV, project: i.product, item: i.id, updated_at: iso(NOW), snapshot: { v: 3, item: i, history: [] } })),
    commands: [],
  };
  const view = { ...phoneView(rows as never, NOW), projectOrder: phoneProjectOrder(order as never) };
  return { view, tabs: phoneTabs(view, NOW) };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const desktop = (productOrder: string[]) => ids(sorted(ITEMS, DEFAULT_DISPLAY.inbox, 'inbox', productOrder));

describe("the phone's Needs you", () => {
  it('runs by level then age across projects when the computer has no running order, as the desktop does', () => {
    const { tabs } = phone([settings(DEV, [])]);
    expect(ids(tabs.inbox)).toEqual(desktop([]));
    expect(ids(tabs.inbox).slice(0, 2)).toEqual(['K', 'E']);
  });

  it('does the same before any settings copy has arrived', () => {
    expect(ids(phone([]).tabs.inbox)).toEqual(desktop([]));
  });

  it("keeps the computer's running order of projects when it has one", () => {
    const { tabs } = phone([settings(DEV, ['readme', 'fizz'])]);
    expect(ids(tabs.inbox)).toEqual(desktop(['readme', 'fizz']));
    expect(ids(tabs.inbox)[0]).toBe('M');
  });

  it("does not take another computer's running order for this one's projects", () => {
    const { tabs } = phone([settings(OTHER, ['readme', 'fizz'])]);
    expect(ids(tabs.inbox)).toEqual(desktop([]));
  });

  it('is drawn in that order under the Display menu, as the screen reads it', () => {
    const { view, tabs } = phone([settings(DEV, [])]);
    expect(ids(shownTabs(tabs, DEFAULT_DISPLAY.inbox, NOW, view.projectOrder).rows.inbox)).toEqual(desktop([]));
  });
});

describe('the running order the phone reads', () => {
  it("is each computer's order in its own projects' names, newest copy of each computer only", () => {
    expect(phoneProjectOrder([
      settings(DEV, ['b', 'a'], NOW),
      settings(OTHER, ['c'], NOW - MIN),
      settings(DEV, ['a', 'b'], NOW - 2 * MIN),
    ] as never)).toEqual([phoneSlug(DEV, 'b'), phoneSlug(DEV, 'a'), phoneSlug(OTHER, 'c')]);
  });
  it('skips a copy with no order and anything that is not a project name', () => {
    expect(phoneProjectOrder([{ device: DEV, name: 'Mac', updated_at: iso(NOW), settings: { workspace: { productOrder: ['a', 7, ''] } } }, { device: OTHER, name: 'x', updated_at: iso(NOW), settings: {} }] as never))
      .toEqual([phoneSlug(DEV, 'a')]);
  });
});
