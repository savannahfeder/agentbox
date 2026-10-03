// SELECT MODE ON THE PROJECTS PAGE: what it says and which projects it holds.
// Pure, so the words and the ticks are tested without a window
// (tests/a-project-can-be-archived-and-brought-back.test.mjs).

const projects = (n: number) => `${n} project${n === 1 ? '' : 's'}`;

/** The table's header line while selecting. */
export function selectionLine(count: number): string {
  return count ? `${count} selected` : 'Select the projects to archive';
}

/** The button on that line: what one press will do. */
export function archiveLabel(count: number): string {
  return count ? `Archive ${projects(count)}` : 'Archive';
}

/** The same line just after, beside Undo. */
export function archivedLine(count: number): string {
  return `Archived ${projects(count)}`;
}

/** Tick or untick one project, as a new set. */
export function togglePick(picked: Set<string>, slug: string): Set<string> {
  const next = new Set(picked);
  if (next.has(slug)) next.delete(slug);
  else next.add(slug);
  return next;
}

/** Ticks only on projects the list still shows: a press must never archive
 *  something that is off the screen. */
export function keepShown(picked: Set<string>, shown: string[]): Set<string> {
  const on = new Set(shown);
  return new Set([...picked].filter((s) => on.has(s)));
}
