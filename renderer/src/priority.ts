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

/* ------------------------- the level that sticks -------------------------- */

// The new task card forgot. It opened on the draft's level or on nothing, and
// a send CLEARS the draft, so the level she had just chosen died with it: tag
// one task urgent, send it, open the card again and it says Medium. The card
// already remembers the PROJECT across sends (`zero.lastProduct`), because a
// founder filing five things for one product should not pick it five times.
// The level is the same fact about the same card and it was simply missing.
//
// Which is why this lives here rather than in ../drafts.ts. A draft is the one
// unsent card, and it dies when that card is sent; this outlives the send. Same
// shape and the same reason as the project.
//
// NOT THE REPLY BOX. The dock's tag already retains, one better: it shows the
// THREAD's own level, so a reply to an urgent thread says "Urgent priority."
// and an untouched reply leaves that level alone (deliberately, because a
// reply box reading "medium" on an urgent thread read as the reply demoting
// it). Carrying a global last-pick in there instead would silently escalate
// every thread she answered after tagging one task urgent.

/** Just enough of the Storage interface to be handed a fake in a test. */
export interface LevelStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LAST_PRIORITY_KEY = 'zero.lastPriority';

const levelStore = (store?: LevelStore): LevelStore | null =>
  store ?? (globalThis as unknown as { localStorage?: LevelStore }).localStorage ?? null;

/**
 * The level the next new task card opens on, or null for untagged.
 *
 * Anything that is not one of the four words reads as null rather than
 * throwing. A card that refuses to open because of a stale string in storage is
 * worse than a card that opens untagged, and she has no way to clear it.
 */
export function readLastPriority(store?: LevelStore): PriorityId | null {
  let raw: string | null = null;
  try { raw = levelStore(store)?.getItem(LAST_PRIORITY_KEY) ?? null; } catch { return null; }
  return PRIORITIES.some((p) => p.id === raw) ? (raw as PriorityId) : null;
}

/**
 * Remember what she just picked, at the moment she picks it.
 *
 * On the pick and not on the send, exactly as the project is remembered: a
 * level she chose and then thought better of sending is still the level she
 * chose. Never throws, because it runs inside a click handler on a card whose
 * whole job is to not lose what she is doing.
 */
export function writeLastPriority(id: PriorityId, store?: LevelStore): void {
  try { levelStore(store)?.setItem(LAST_PRIORITY_KEY, id); } catch { /* the card still sends */ }
}
