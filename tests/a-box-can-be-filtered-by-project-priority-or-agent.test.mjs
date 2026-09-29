// A box can be narrowed by project, by priority, or by which agent did the work.
//
// w-aa3fa4cbf0. Every box (inbox, in progress, closed, scheduled and the rest)
// can be filtered by project or urgency, and by Claude Code versus Codex, since
// sometimes only one agent's work should be visible.
//
// Before this, the only filter the app had was one project, reachable only from
// ⌘K. Codex work is marked two different ways (an `engine` of codex on some
// rows, a codex label on the rest), which is why the harness rule is written
// down here rather than guessed at in two places.

import { describe, it, expect } from 'vitest';
import {
  NO_FILTER, harnessOf, matchesBoxFilter, isFiltering, filterTags, filterMenu, toggleFilter, clearFilterPart,
} from '../renderer/src/box-filter';

const products = [
  { slug: 'astral', name: 'Agentbox' },
  { slug: 'gilded', name: 'Gilded' },
  { slug: 'personal', name: 'Personal' },
];
const row = (id, product, priority = 5, extra = {}) => ({ id, product, priority, labels: [], ...extra });

describe('which agent a row belongs to', () => {
  it('reads Claude Code when nothing says otherwise', () => {
    expect(harnessOf(row('w-1', 'astral'))).toBe('claude');
  });
  it('reads Codex off the engine she picked for the row', () => {
    expect(harnessOf(row('w-2', 'astral', 5, { engine: 'codex' }))).toBe('codex');
  });
  it('reads Codex off a conversation brought in from Codex', () => {
    expect(harnessOf(row('w-3', 'astral', 5, { labels: ['codex-import', 'codex:01a0'] }))).toBe('codex');
    expect(harnessOf(row('w-4', 'astral', 5, { labels: ['codex'] }))).toBe('codex');
    expect(harnessOf(row('w-5', 'astral', 5, { labels: ['not-imported'] }))).toBe('codex');
  });
  it('does not read Codex out of a label that only contains the word', () => {
    expect(harnessOf(row('w-6', 'astral', 5, { labels: ['not-codex-related'] }))).toBe('claude');
    expect(harnessOf(row('w-7', 'astral', 5, { engine: 'claude' }))).toBe('claude');
  });
});

describe('what a filter lets through', () => {
  const f = { ...NO_FILTER, project: 'gilded' };
  it('lets everything through when nothing is picked', () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(matchesBoxFilter(row('w-1', 'astral'), NO_FILTER)).toBe(true);
  });
  it('keeps the picked project and drops the others', () => {
    expect(matchesBoxFilter(row('w-1', 'gilded'), f)).toBe(true);
    expect(matchesBoxFilter(row('w-2', 'astral'), f)).toBe(false);
    // A row with no project is not in Gilded either.
    expect(matchesBoxFilter(row('w-3', ''), f)).toBe(false);
  });
  it('matches a priority by its level, on both edges of it', () => {
    const high = { ...NO_FILTER, priority: 'high' };
    expect(matchesBoxFilter(row('w-1', 'astral', 7), high)).toBe(true);
    expect(matchesBoxFilter(row('w-2', 'astral', 8), high)).toBe(true);
    expect(matchesBoxFilter(row('w-3', 'astral', 9), high)).toBe(false); // that is Urgent
    expect(matchesBoxFilter(row('w-4', 'astral', 6), high)).toBe(false); // that is Medium
    // A row with no priority is Medium, which is what the rest of the app reads it as.
    expect(matchesBoxFilter({ id: 'w-5', product: 'astral', labels: [] }, { ...NO_FILTER, priority: 'medium' })).toBe(true);
  });
  it('matches the agent', () => {
    const codex = { ...NO_FILTER, harness: 'codex' };
    expect(matchesBoxFilter(row('w-1', 'astral', 5, { engine: 'codex' }), codex)).toBe(true);
    expect(matchesBoxFilter(row('w-2', 'astral'), codex)).toBe(false);
  });
  it('needs every picked part to match at once', () => {
    const both = { project: 'gilded', priority: 'high', harness: null };
    expect(matchesBoxFilter(row('w-1', 'gilded', 7), both)).toBe(true);
    expect(matchesBoxFilter(row('w-2', 'gilded', 5), both)).toBe(false);
    expect(matchesBoxFilter(row('w-3', 'astral', 7), both)).toBe(false);
  });
});

describe('picking and unpicking', () => {
  it('picks a value, and picking it again takes it off', () => {
    const on = toggleFilter(NO_FILTER, 'project', 'gilded');
    expect(on.project).toBe('gilded');
    expect(toggleFilter(on, 'project', 'gilded').project).toBe(null);
  });
  it('replaces the value within one part and leaves the other parts alone', () => {
    const on = toggleFilter(toggleFilter(NO_FILTER, 'project', 'gilded'), 'priority', 'urgent');
    const moved = toggleFilter(on, 'project', 'astral');
    expect(moved).toEqual({ project: 'astral', priority: 'urgent', harness: null });
    expect(clearFilterPart(moved, 'project')).toEqual({ project: null, priority: 'urgent', harness: null });
  });
});

describe('the tags beside the icon', () => {
  // A filtered state is easy to forget, and a tag is a clearer reminder than a
  // change of color. One tag per part, capitalised, because "urgent" in lower
  // case looks odd.
  it('names each part that is on, capitalised', () => {
    expect(filterTags({ project: 'gilded', priority: 'urgent', harness: 'codex' }, products).map((t) => t.label))
      .toEqual(['Gilded', 'Urgent', 'Codex']);
  });
  it('says nothing when nothing is on', () => {
    expect(filterTags(NO_FILTER, products)).toEqual([]);
  });
  it('falls back to the slug for a project it cannot name', () => {
    expect(filterTags({ ...NO_FILTER, project: 'gone' }, products)[0].label).toBe('gone');
  });
});

describe('the menu', () => {
  const box = [
    ...Array.from({ length: 6 }, (_, i) => row(`w-a${i}`, 'astral', i < 2 ? 9 : 5)),
    ...Array.from({ length: 3 }, (_, i) => row(`w-g${i}`, 'gilded', 7, i === 0 ? { engine: 'codex' } : {})),
    row('w-p0', 'personal', 2),
  ];

  it('lists the projects in this box, busiest first, with how many each holds', () => {
    const m = filterMenu(box, NO_FILTER, products);
    expect(m.projects.map((p) => [p.label, p.count])).toEqual([['Agentbox', 6], ['Gilded', 3], ['Personal', 1]]);
    expect(m.moreProjects).toEqual([]);
  });

  it('puts only the five busiest up front and the rest one step in', () => {
    const many = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 - i }, (_, j) => row(`w-${i}${j}`, `p${i}`))).flat();
    const m = filterMenu(many, NO_FILTER, []);
    expect(m.projects.map((p) => p.value)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(m.moreProjects.map((p) => p.value)).toEqual(['p5', 'p6', 'p7']);
  });

  it('keeps the picked project up front even when it is not among the busiest', () => {
    const many = Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 - i }, (_, j) => row(`w-${i}${j}`, `p${i}`))).flat();
    const m = filterMenu(many, { ...NO_FILTER, project: 'p7' }, []);
    expect(m.projects.map((p) => p.value)).toContain('p7');
    expect(m.projects.find((p) => p.value === 'p7').on).toBe(true);
    expect(m.moreProjects.map((p) => p.value)).not.toContain('p7');
  });

  it('counts each choice with the OTHER picked parts applied, so the number is what she would get', () => {
    const m = filterMenu(box, { ...NO_FILTER, priority: 'high' }, products);
    expect(m.projects.map((p) => [p.label, p.count])).toEqual([['Gilded', 3]]);
    // And the priority counts ignore the priority pick itself, or every other level would read zero.
    expect(m.priorities.map((p) => [p.label, p.count])).toEqual([['Urgent', 2], ['High', 3], ['Medium', 4], ['Low', 1]]);
  });

  it('always offers the four priorities, in her capitalised words', () => {
    expect(filterMenu([], NO_FILTER, products).priorities.map((p) => p.label)).toEqual(['Urgent', 'High', 'Medium', 'Low']);
  });

  it('offers the agents only when this box holds work from both, or one is already picked', () => {
    expect(filterMenu(box, NO_FILTER, products).harnesses.map((h) => [h.label, h.count]))
      .toEqual([['Claude Code', 9], ['Codex', 1]]);
    const claudeOnly = box.filter((r) => !r.engine);
    expect(filterMenu(claudeOnly, NO_FILTER, products).harnesses).toEqual([]);
    expect(filterMenu(claudeOnly, { ...NO_FILTER, harness: 'codex' }, products).harnesses.map((h) => h.on)).toEqual([false, true]);
  });
});
