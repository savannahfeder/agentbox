// A HIGH OR URGENT THREAD IS MARKED ON THE PHONE'S LIST (QA M-32, 2026-11-04).
//
// A thread sent from the phone at High priority kept its priority, but its row
// in the list showed nothing: measured in the UI tree of the Android app, the
// row held the title, the project and the age. The board drew the bars; the
// list never did. Rows now carry the level and the list draws High and Urgent.
// Low and Medium stay unmarked, since most threads sit there and a mark on
// every row stands out on none.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView } from '../renderer/src/phone-rows';
import { phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.UTC(2026, 10, 4, 12);
const DEV = 'a1b2c3d4e5f6';
const iso = (ms) => new Date(ms).toISOString();

function inbox(priority) {
  const rows = {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: [{
      device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(NOW),
      snapshot: { v: 3, item: { id: 'w-1', kind: 'directive', labels: ['founder'], status: 'done', priority, title: 'List', createdAt: NOW - 9e6, updatedAt: NOW - 1000, wrote: { status: { ts: NOW - 1000, source: 'agent' } } }, history: [] },
    }],
    commands: [],
  };
  return phoneTabs(phoneView(rows, NOW), NOW).inbox;
}

describe('the level a list row carries', () => {
  it('is high at 7 and urgent at 9', () => {
    expect(inbox(7)[0].priority).toBe('high');
    expect(inbox(9)[0].priority).toBe('urgent');
  });
  it('is nothing for medium, just under high, or low', () => {
    expect(inbox(5)[0].priority).toBe(null);
    expect(inbox(6)[0].priority).toBe(null);
    expect(inbox(1)[0].priority).toBe(null);
    expect(inbox(undefined)[0].priority).toBe(null);
  });
});

describe('the list row', () => {
  it('draws the bars for the level it carries', () => {
    const src = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const row = src.slice(src.indexOf('function ThreadRow'), src.indexOf('function MentionRow'));
    expect(row).toMatch(/row\.priority\s*&&[\s\S]*PriorityBars/);
  });
});
