// PURE. What the toast draws, and which press opens the task it is about.
//
// w-f0bfe32859. The toast after a send or an answer could only be opened with
// the mouse, and it said its keys in prose: "Started in Agentbox Team · Z to
// undo  Open it". Now Z and O are drawn as keycaps, and O works.

// `repeat` when it is a repeating task's rule rather than a thread: its id is a
// rule's, so it is opened the way the Later list opens one. `sent` when it is a
// reply, an approval or a picked option going to that thread.
export type ToastGoes = { product: string; id: string; repeat?: boolean; sent?: boolean };
type Here = { product: string; id: string } | null;

// The undo clause about a dozen callers bake onto the end of their sentence.
// Only a trailing one after a middle dot: a sentence that MENTIONS Z in the
// middle is the toast explaining something and keeps its words.
const UNDO_TAIL = / · (?:press )?Z to undo$/;

/**
 * THE TAIL ITSELF, for an action that writes straight away and raises its own
 * toast; anything held behind the grace window gets it from `deferCommit`. It
 * is a flag and not copy, because `toastParts` takes it off again and the Undo
 * cap is what reaches the screen. Four actions forgot it and so looked as
 * though they could not be taken back at all (F-50).
 */
export const SAYS_UNDO = ' · press Z to undo';

export function toastParts(text: string): { line: string; undo: boolean } {
  return UNDO_TAIL.test(text)
    ? { line: text.replace(UNDO_TAIL, ''), undo: true }
    : { line: text, undo: false };
}

/**
 * WHETHER THE TOAST OFFERS O: it names somewhere to go, and that is not the
 * thread already open (`here`).
 *
 * w-5513afd09a: "normally when I send, start agent threads, or reply to them,
 * I can hit O to see them. Sometimes the toast just doesn't have that." Every
 * send, start and reply names its thread now, including a reply that keeps
 * you on it, so that O works the moment you leave. While you are still on it
 * the cap is not drawn, because pressing it would go nowhere.
 */
export function toastOpens(toast: { goes?: ToastGoes } | null, here: Here): boolean {
  const goes = toast?.goes;
  if (!goes) return false;
  return goes.repeat || !here || here.id !== goes.id || here.product !== goes.product;
}

/**
 * WHETHER A SEND IS SAID ON THE LINE ABOVE THE REPLY BOX (./components/SentLine)
 * rather than on the corner card: it moved her to another thread. Kept on the
 * thread it went to, her words are already on screen.
 */
export function saysWhereItWent(toast: { goes?: ToastGoes } | null, here: Here): boolean {
  const goes = toast?.goes;
  return !!goes?.sent && !goes.repeat && toastOpens(toast, here) && !!here;
}

/**
 * O OPENS THE TASK THE TOAST IS ABOUT, while that toast is on screen. A toast
 * with nowhere to go, or none at all, leaves O alone: the key is only ever
 * promised by the cap drawn on the toast, so it only works while that cap is
 * there to be read.
 */
export function opensTheToast(key: string, toast: { goes?: ToastGoes } | null, here: Here = null): ToastGoes | null {
  if (key !== 'o' && key !== 'O') return null;
  return toastOpens(toast, here) ? toast!.goes! : null;
}
