// ⌘A acts on what is in front of you: the list when the list is on screen,
// otherwise the words you are reading.
import { whereToFind } from './find-in-page';

export function commandATicksTheList(open: { threadOpen: boolean; repeatOpen: boolean; cardOpen: boolean }): boolean {
  return !open.threadOpen && !open.repeatOpen && !open.cardOpen;
}

// An open file's text, in the order the pane draws its kinds. The line numbers
// are drawn by CSS, so selecting `.code-file` copies the file and nothing else.
const FILE_TEXT = '.code-scroll > .code-file, .av-code-sheet > .code-file, .doc-rich-content, .av-doc';
const CONVERSATION = '.focus-body';

/** The part the selection is already in, else the first one there. */
export function partToSelect<T>(parts: (T | null)[], holdsTheSelection: (part: T) => boolean): T | null {
  const there = parts.filter((p): p is T => p != null);
  return there.find(holdsTheSelection) ?? there[0] ?? null;
}

/** Selects the open file's text or the conversation. False when neither is on screen. */
export function selectWhatYouAreReading(doc: Document): boolean {
  const sel = doc.getSelection();
  if (!sel) return false;
  // A file opened full screen covers the thread, so only what it holds counts.
  const root = whereToFind(doc);
  const shown = (s: string) => [...root.querySelectorAll<HTMLElement>(s)].find((el) => el.getClientRects().length > 0) ?? null;
  const part = partToSelect([shown(FILE_TEXT), shown(CONVERSATION)], (p) => sel.rangeCount > 0 && p.contains(sel.anchorNode));
  if (!part) return false;
  sel.selectAllChildren(part);
  return true;
}
