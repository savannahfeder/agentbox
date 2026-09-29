// PURE. Narrowing a box by project, priority, or which agent did the work.
//
// w-aa3fa4cbf0. Every box (inbox, in progress, closed, scheduled and the rest)
// can be narrowed by project or urgency, and by Claude Code versus Codex. The
// control is one small icon left of the plus, a menu under it, and a tag beside
// it for each part that is on, because a filtered state is easy to forget and a
// tag is a clearer reminder than a change of color.
//
// THE FILTER IS APPLIED LAST, to the box on screen, and never to the lists
// underneath. The inbox count, the dock badge and the thread mask all read the
// whole box, so narrowing what she sees never changes what the app believes is
// waiting. It also means the menu can count every choice honestly, off the same
// rows. `tests/a-box-can-be-filtered-by-project-priority-or-agent.test.mjs`.

import { engineLabel } from '../../shared/engines.mjs';
import { PRIORITIES, priorityIdOf, type PriorityId } from './priority';
import type { WorkItem } from './types';

export type Harness = 'claude' | 'codex';

export interface BoxFilter {
  project: string | null;
  priority: PriorityId | null;
  harness: Harness | null;
}

export type FilterPart = keyof BoxFilter;

export const NO_FILTER: BoxFilter = { project: null, priority: null, harness: null };

const HARNESSES: Harness[] = ['claude', 'codex'];

// The labels that mark a conversation as Codex's, the same set the byline reads
// (`bylineFacts`). Exact words, so a label that merely contains "codex" is not one.
const CODEX_LABELS = new Set(['codex', 'codex-import', 'not-imported']);

/**
 * WHICH AGENT A ROW BELONGS TO. Measured on her store 2026-09-28: 11 rows carry
 * `engine: codex` and about 50 carry a codex label instead (brought in from
 * Codex), and nothing else names Codex at all. Everything unmarked was Claude
 * Code, which is the reading `engineOf` makes in main/supervisor.mjs too.
 */
export function harnessOf(item: Pick<WorkItem, 'labels'> & { engine?: string | null }): Harness {
  if (item.engine === 'codex') return 'codex';
  if ((item.labels ?? []).some((l) => CODEX_LABELS.has(l) || l.startsWith('codex:'))) return 'codex';
  return 'claude';
}

type Row = Pick<WorkItem, 'product' | 'priority' | 'labels'> & { engine?: string | null };

function matchesPart(item: Row, f: BoxFilter, part: FilterPart): boolean {
  if (part === 'project') return !f.project || item.product === f.project;
  if (part === 'priority') return !f.priority || priorityIdOf(item.priority) === f.priority;
  return !f.harness || harnessOf(item) === f.harness;
}

const PARTS: FilterPart[] = ['project', 'priority', 'harness'];

export function matchesBoxFilter(item: Row, f: BoxFilter, except?: FilterPart): boolean {
  return PARTS.every((part) => part === except || matchesPart(item, f, part));
}

export function isFiltering(f: BoxFilter): boolean {
  return PARTS.some((part) => f[part] !== null);
}

/** Picking the value that is already on takes it off; anything else replaces it. */
export function toggleFilter<P extends FilterPart>(f: BoxFilter, part: P, value: BoxFilter[P]): BoxFilter {
  return { ...f, [part]: f[part] === value ? null : value };
}

export function clearFilterPart(f: BoxFilter, part: FilterPart): BoxFilter {
  return { ...f, [part]: null };
}

type Product = { slug: string; name: string };

const projectName = (slug: string, products: Product[]) => products.find((p) => p.slug === slug)?.name ?? slug;
const priorityName = (id: PriorityId) => PRIORITIES.find((p) => p.id === id)!.label;

export interface FilterTag { part: FilterPart; label: string }

/** One tag per part that is on, in the order the menu lists them. */
export function filterTags(f: BoxFilter, products: Product[]): FilterTag[] {
  const tags: FilterTag[] = [];
  if (f.project) tags.push({ part: 'project', label: projectName(f.project, products) });
  if (f.priority) tags.push({ part: 'priority', label: priorityName(f.priority) });
  if (f.harness) tags.push({ part: 'harness', label: engineLabel(f.harness) });
  return tags;
}

export interface MenuRow<V extends string = string> { value: V; label: string; count: number; on: boolean }

export interface FilterMenu {
  projects: MenuRow[];
  /** One step in, behind "More projects". Empty when five or fewer. */
  moreProjects: MenuRow[];
  priorities: MenuRow<PriorityId>[];
  /** Empty unless this box holds work from both agents, or one is already picked. */
  harnesses: MenuRow<Harness>[];
}

const UP_FRONT = 5;

/**
 * The menu for the box on screen. `rows` is the WHOLE box, before the filter.
 * Each count is what picking that choice would leave, so it applies every OTHER
 * part that is on and ignores its own: with High picked, Urgent still says how
 * many urgent rows there are, rather than a row of zeroes.
 */
export function filterMenu(rows: Row[], f: BoxFilter, products: Product[]): FilterMenu {
  const count = <K extends string>(part: FilterPart, key: (r: Row) => K) => {
    const m = new Map<K, number>();
    for (const r of rows) if (matchesBoxFilter(r, f, part)) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return m;
  };

  const byProject = count('project', (r) => r.product);
  byProject.delete('');
  if (f.project && !byProject.has(f.project)) byProject.set(f.project, 0);
  const ranked = [...byProject.entries()]
    .sort((a, b) => b[1] - a[1] || projectName(a[0], products).localeCompare(projectName(b[0], products)))
    .map(([value, n]) => ({ value, label: projectName(value, products), count: n, on: value === f.project }));
  let projects = ranked.slice(0, UP_FRONT);
  let moreProjects = ranked.slice(UP_FRONT);
  const picked = moreProjects.find((p) => p.on);
  if (picked) {
    projects = [...projects.slice(0, UP_FRONT - 1), picked];
    moreProjects = ranked.filter((p) => !projects.includes(p));
  }

  const byLevel = count('priority', (r) => priorityIdOf(r.priority));
  const priorities = PRIORITIES.map((p) => ({ value: p.id, label: p.label, count: byLevel.get(p.id) ?? 0, on: f.priority === p.id }));

  const byHarness = count('harness', harnessOf);
  const both = HARNESSES.every((h) => (byHarness.get(h) ?? 0) > 0);
  const harnesses = both || f.harness
    ? HARNESSES.map((h) => ({ value: h, label: engineLabel(h), count: byHarness.get(h) ?? 0, on: f.harness === h }))
    : [];

  return { projects, moreProjects, priorities, harnesses };
}
