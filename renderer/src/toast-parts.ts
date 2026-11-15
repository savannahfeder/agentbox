// PURE. What the toast draws, and which press opens the task it is about.
//
// w-f0bfe32859. The toast after a send or an answer could only be opened with
// the mouse, and it said its keys in prose: "Started in Agentbox Team · Z to
// undo  Open it". Now Z and O are drawn as keycaps, and O works.

// `repeat` when it is a repeating task's rule rather than a thread: its id is a
// rule's, so it is opened the way the Later list opens one. `sent` when it is a
// reply, an approval or a picked option going to that thread. `at` when that
// reply waits for a time, in the words its caret said.
export type ToastGoes = { product: string; id: string; repeat?: boolean; sent?: boolean; at?: string };
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

/** How long an O pressed ahead of its thread is kept. */
export const O_WAITS_MS = 10_000;
export type OWaits = { at: number; screen: string; goes?: ToastGoes };

/**
 * AN O PRESSED WHILE A SEND IS IN THE AIR. "Starting in…" is up before the
 * thread has an id, so the O is held for the toast that names it.
 */
export function oWaitsForTheSend(key: string, toast: { goes?: ToastGoes } | null, sentAt: number, now: number): boolean {
  return (key === 'o' || key === 'O') && !toast?.goes && sentAt > 0 && now - sentAt < O_WAITS_MS;
}

/**
 * Whether this press is the toast's O, opening its thread or waiting for it.
 * The pages that keep the keyboard to themselves (Files, Connections,
 * Teammates) let it through, because the toast and its cap are drawn over them.
 */
export function oIsTheToasts(key: string, toast: { goes?: ToastGoes } | null, sentAt: number, now: number): boolean {
  return !!opensTheToast(key, toast) || oWaitsForTheSend(key, toast, sentAt, now);
}

/**
 * What a held O does now: open its thread once that thread is in the lists
 * (`ready`), keep waiting, or let go. It lets go when the window is up or the
 * screen has moved since, so it never pulls you off something you opened.
 */
export function oWaitsFor(
  w: OWaits | null, toast: { goes?: ToastGoes } | null, now: number, screen: string, ready: (to: ToastGoes) => boolean,
): { open: ToastGoes | null; keep: OWaits | null } {
  if (!w || now - w.at > O_WAITS_MS || w.screen !== screen) return { open: null, keep: null };
  const goes = w.goes ?? toast?.goes;
  if (!goes) return { open: null, keep: w };
  return ready(goes) ? { open: goes, keep: null } : { open: null, keep: { ...w, goes } };
}

/** Everyone in a conversation but you, by first name: "Lena", "Lena and Sam". */
export function othersIn(team: { people: readonly string[]; sharedBy: string | null } | null | undefined, me: string | null, nameOf: (id: string) => string | undefined): string {
  const others = [...new Set([...(team?.people ?? []), ...(team?.sharedBy ? [team.sharedBy] : [])])].filter((id) => id !== me);
  const names = others.map((id) => nameOf(id)?.split(/\s+/)[0]).filter((n): n is string => !!n);
  return names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Sent to Lena" for a send into a conversation. */
export function sentToWhom(team: { people: readonly string[]; sharedBy: string | null } | null | undefined, me: string | null, nameOf: (id: string) => string | undefined): string {
  const who = othersIn(team, me, nameOf);
  return who ? `Sent to ${who}` : 'Sent';
}

/** "Handed to Theo" once a thread has gone to them. */
export function handedToWhom(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Handed to ${first}` : 'Handed on';
}

/** Said at the press, since the cloud can take seconds to answer. */
export const sendingTo = (names: string): string => `Sending to ${names}…`;

/** A conversation's row is titled by whatever was first sent in it, so its toast draws no title; its line names who. */
export function toastTitle(title: string, { conversation }: { conversation: boolean }): string | null {
  return conversation ? null : title;
}
