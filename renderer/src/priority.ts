// The priority vocabulary, and what ⌘K offers for it.
//
// ONE list of the four words. The picker in ./components/Priority.tsx exists
// because two copies drifted apart once already. The words live here, apart
// from the component, so that every consumer reads the same list and so this is
// testable without rendering anything.
//
// THERE IS NO CHORD.⌘1..4 used to set the level from inside the new task card
// and the reply box, and the drawer advertised it in a column down its right
// edge. All of it is gone: the handlers, the hint column, and the ⌘K key hints,
// because a hint pointing at a chord that no longer fires is worse than no
// hint. The levels are still in ⌘K by NAME, which is how people find them
// anyway. DO NOT PUT THE CHORD BACK without a product decision.

/** Display order, top to bottom. */
export const PRIORITIES = [
  { id: 'urgent', label: 'Urgent', value: 9 },
  { id: 'high', label: 'High', value: 7 },
  { id: 'medium', label: 'Medium', value: 5 },
  { id: 'low', label: 'Low', value: 2 },
] as const;

export type PriorityId = (typeof PRIORITIES)[number]['id'];

/** The level a stored numeric priority displays as. */
export function priorityIdOf(value: number | null | undefined): PriorityId {
  const n = value ?? 5;
  if (n >= 9) return 'urgent';
  if (n >= 7) return 'high';
  if (n <= 2) return 'low';
  return 'medium';
}

export function priorityValueOf(id: PriorityId): number {
  return PRIORITIES.find((p) => p.id === id)!.value;
}

export function priorityLabelOf(id: PriorityId): string {
  return PRIORITIES.find((p) => p.id === id)!.label;
}

export interface PriorityCommand {
  id: string;
  label: string;
  value: number;
  /** The level these rows are already on, if they agree about it. */
  current: boolean;
}

/**
 * The palette's priority entries for whatever is selected, focused, or ticked.
 *
 * ⌘K is now the ONLY way to set a level from the keyboard, so this entry is
 * load-bearing rather than a convenience: a founder who reached for the palette
 * to raise a row once found an empty list under the word that was typed.
 * Every label carries both the level and the word "Priority", so "high" and
 * "prio" both find it. No key hint, because there is no key.
 *
 * A selection that disagrees about its level has no current one. Marking one
 * anyway would be a plain lie about the other rows, and this is a control that
 * decides which answers ride the session cap.
 */
export function priorityCommands(targets: { priority?: number | null }[]): PriorityCommand[] {
  if (!targets.length) return [];
  const levels = new Set(targets.map((t) => priorityIdOf(t.priority)));
  const shared = levels.size === 1 ? [...levels][0] : null;
  const many = targets.length > 1 ? ` (${targets.length} selected)` : '';
  return PRIORITIES.map((p) => ({
    id: `priority-${p.id}`,
    label: `Priority: ${p.label}${many}${p.id === shared ? ' (current)' : ''}`,
    value: p.value,
    current: p.id === shared,
  }));
}

/* ------------------- every new thread opens on Medium --------------------- */

// The new task card used to remember the last level picked, across sends, in
// `zero.lastPriority`. So one Urgent thread made the next one Urgent too, and
// the one after, and because that memory lived on the Mac rather than in the
// account, a tester on a brand-new account found every thread preset to
// Urgent. Urgent rows rise above everything in the inbox, so a level that
// spreads by itself stops meaning anything. The founder's call, 2026-10-05:
// all new threads default to Medium. Unlike the project, the level is not
// carried to the next card. Anything still sitting under `zero.lastPriority`
// is simply never read.
//
// A level still holds for the card it was picked on: a half-written card that
// comes back (../drafts.ts) keeps its own tag until it is sent.
//
// NOT THE REPLY BOX. The dock's tag already retains, one better: it shows the
// THREAD's own level, so a reply to an urgent thread says "Urgent priority."
// and an untouched reply leaves that level alone (deliberately, because a
// reply box reading "medium" on an urgent thread read as the reply demoting
// it). Carrying a global last-pick in there would silently escalate every
// thread answered after tagging one task urgent.

/**
 * The level a new task card opens on: its own draft's tag, or null for
 * untagged, which shows and sends as Medium.
 *
 * Anything that is not one of the four words reads as null rather than
 * throwing. A card that refuses to open because of a stale string in storage is
 * worse than a card that opens untagged.
 */
export function startingPriority(draft: string | null | undefined): PriorityId | null {
  return PRIORITIES.some((p) => p.id === draft) ? (draft as PriorityId) : null;
}
