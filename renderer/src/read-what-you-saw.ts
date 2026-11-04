// WAS THE MESSAGE THAT JUST LANDED IN FRONT OF YOU.
//
// The dot is the only thing that brings you back to an answer you have not
// read, and it is the row's newest `result` against the moment you last opened
// the thread (./unread). So marking a thread read says you have seen
// everything on it, and a thread being OPEN was taken as proof of that. A
// conversation scrolled up has the new paragraph off the screen, and the next
// turn overwrites `result`, so nothing points at it again (w-a3487b7f7b).
import { gapToBottom, LEAVE_SLACK, type Scroller } from './thread-bottom';

/**
 * The scrolling box one thread is drawn in (Focus.tsx). Addressed BY THREAD, so
 * a pane still mounted for the one you just left cannot answer for this one.
 */
export const threadPane = (id: string) => `.focus-scroll[data-thread-id="${id}"]`;

/** A thread's scrolling box, and the one event a person makes on it. */
export type Pane = Scroller & {
  addEventListener: (type: 'scroll', watch: () => void, opts?: { passive?: boolean }) => void;
  removeEventListener: (type: 'scroll', watch: () => void) => void;
};

/** What this rule needs of a window: whether you are at it, and its thread pane. */
export type Looking = {
  hasFocus: () => boolean;
  visibilityState: string;
  querySelector: (selector: string) => Pane | null;
};

/**
 * Whether a message that has just arrived on thread `id` was on the screen.
 *
 * `LEAVE_SLACK` rather than a slack of its own: it is the distance
 * `holdAtBottom` treats as "they scrolled away", so the stick and the dot
 * cannot come to disagree about where the end of a conversation is.
 *
 * No pane answers false. Either the thread is not drawn, or it is drawn
 * somewhere this does not know about, and unread is the direction that costs a
 * glance rather than the message.
 */
export function sawWhatLanded(page: Looking, id: string, slack = LEAVE_SLACK): boolean {
  if (!page.hasFocus() || page.visibilityState !== 'visible') return false;
  const box = page.querySelector(threadPane(id));
  return !!box && gapToBottom(box) <= slack;
}

/** The window, which is where coming back from another app is heard. */
export type Returning = {
  addEventListener: (type: 'focus', watch: () => void) => void;
  removeEventListener: (type: 'focus', watch: () => void) => void;
};

/**
 * Read it once it is in front of them: now, or the moment they scroll down to
 * it, or on the way back from another app. Returns the release, which is what
 * the caller's own cleanup calls.
 *
 * The arrival asks once, so without a watch a message that landed above the
 * fold kept its dot through the whole thing being read (Codex, 2026-11-02).
 *
 * BOTH WAYS IT COMES INTO VIEW BELONG TO THIS ONE WATCH, and it marks a
 * message read ONCE, letting go of everything as it does. A second place
 * marking it read behind this watch's back left the watch armed, and the next
 * scroll then undid a Mark Unread (Codex, round two).
 */
export function readWhenTheySeeIt(
  page: Looking,
  id: string,
  markRead: () => void,
  { back = null, slack = LEAVE_SLACK }: { back?: Returning | null; slack?: number } = {},
): () => void {
  let already = false;
  const box = page.querySelector(threadPane(id));
  const release = () => {
    box?.removeEventListener('scroll', watch);
    back?.removeEventListener('focus', watch);
  };
  function watch() {
    if (already || !sawWhatLanded(page, id, slack)) return;
    already = true;
    release();
    markRead();
  }
  watch();
  if (already || !box) return release;
  box.addEventListener('scroll', watch, { passive: true });
  back?.addEventListener('focus', watch);
  return release;
}
