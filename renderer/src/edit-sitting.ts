// PURE. A document in the big view is typed into directly and saves itself.
// One sitting is one version: the words are kept on this computer as they are
// typed, and become the next version on a pause, on leaving, or on looking away.

/** How long typing has to stop before the sitting's words become a version. */
export const SAVE_AFTER_A_PAUSE_MS = 30_000;

/**
 * What the next save posts, or null when there is nothing new. `typed` is the
 * editor's words, null when they match the version the sitting opened on.
 * Typing back to those words after a save is still a change from the saved one.
 */
export function wordsToSave({ typed, posted, original }: { typed: string | null; posted: string | null; original: string }): string | null {
  const out = typed ?? (posted !== null ? original : null);
  return out === null || out === posted ? null : out;
}

/**
 * Whether the version a save made has reached the view. `count` is how many
 * versions the family held when the save was made, never a version's number:
 * numbers come from the file's line and can run ahead of what a thread holds.
 */
export function savedVersionArrived(family: { versions: unknown[] } | undefined, count: number): boolean {
  return !!family && family.versions.length > count;
}

/** Whether to open an editor on this version now. */
export function opensForTyping({ canEdit, compare, editing, unreadable, version }: {
  canEdit: boolean; compare: boolean; editing: boolean; unreadable: string | null; version: string | null;
}): boolean {
  return canEdit && !compare && !editing && !!version && unreadable !== version;
}
