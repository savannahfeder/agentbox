// PURE. What the toast draws, and which press opens the task it is about.
//
// w-f0bfe32859. The toast after a send or an answer could only be opened with
// the mouse, and it said its keys in prose: "Started in Agentbox Team · Z to
// undo  Open it". Now Z and O are drawn as keycaps, and O works.

export type ToastGoes = { product: string; id: string };

// The undo clause about a dozen callers bake onto the end of their sentence.
// Only a trailing one after a middle dot: a sentence that MENTIONS Z in the
// middle is the toast explaining something and keeps its words.
const UNDO_TAIL = / · (?:press )?Z to undo$/;

export function toastParts(text: string): { line: string; undo: boolean } {
  return UNDO_TAIL.test(text)
    ? { line: text.replace(UNDO_TAIL, ''), undo: true }
    : { line: text, undo: false };
}

/**
 * O OPENS THE TASK THE TOAST IS ABOUT, while that toast is on screen. A toast
 * with nowhere to go, or none at all, leaves O alone: the key is only ever
 * promised by the cap drawn on the toast, so it only works while that cap is
 * there to be read.
 */
export function opensTheToast(key: string, toast: { goes?: ToastGoes } | null): ToastGoes | null {
  if (key !== 'o' && key !== 'O') return null;
  return toast?.goes ?? null;
}
