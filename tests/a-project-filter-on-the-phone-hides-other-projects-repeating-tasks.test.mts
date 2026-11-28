// A PROJECT FILTER ON THE PHONE HIDES OTHER PROJECTS' REPEATING TASKS
// (product loop, 2026-11-24).
//
// With View and filters set to Website, Later still listed the Agentbox Daily
// report beside the two Website reminders: reproduced in the phone preview with
// `phone`. The inbox screen drew every repeating task in Later, on the board and
// in Later's count, whatever project the filter picked; only threads were filtered.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { repeatsKept } from '../mobile/src/lib/tabs';
import { DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules';

const rules = [
  { id: 'r-1', product: 'dev/agentbox', title: 'Daily report' },
  { id: 'r-2', product: 'dev/site', title: 'Check the launch page numbers' },
  { id: 'r-3', product: 'dev/film', title: 'Render the cut' },
];
const filtered = (projects: string[]) => ({ ...DEFAULT_DISPLAY.inbox, projects });

describe('the repeating tasks Later lists', () => {
  it('are all there with no project picked', () => {
    expect(repeatsKept(rules, DEFAULT_DISPLAY.inbox).map((r) => r.id)).toEqual(['r-1', 'r-2', 'r-3']);
  });

  it('are only the picked project’s, so Website hides the Agentbox Daily report', () => {
    expect(repeatsKept(rules, filtered(['dev/site'])).map((r) => r.id)).toEqual(['r-2']);
  });

  it('are every picked project’s when two are picked', () => {
    expect(repeatsKept(rules, filtered(['dev/site', 'dev/film'])).map((r) => r.id)).toEqual(['r-2', 'r-3']);
  });

  it('are none when the picked project has none', () => {
    expect(repeatsKept(rules, filtered(['dev/other']))).toEqual([]);
  });

  it('reach the inbox screen only through the filter', () => {
    const screen = fs.readFileSync(new URL('../mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const reads = screen.match(/\bc0?\.repeats\b/g) ?? [];
    const filteredReads = screen.match(/repeatsKept\(c0?\.repeats,/g) ?? [];
    expect(filteredReads.length).toBeGreaterThan(0);
    expect(reads.length).toBe(filteredReads.length);
  });
});
