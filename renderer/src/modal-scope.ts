// PURE. Which of the app's modals belong to an OPEN TASK, and therefore cannot
// outlive it.
//
// `modal` is one piece of state with several values, and they are not all the
// same KIND of thing. Most of them belong to the app: the palette, the new-task
// card, the shelf, standing instructions. One belongs to a task — the reply
// dock, which is drawn inside the opened task and nowhere else.
//
// What was preventing it was a modal that had outlived its task. The route in
// takes three ordinary steps and no mistakes:
//
//   1. The dock opens, by R or by itself — a thread with a saved draft in it
//      opens its own dock, so the words she left are simply there.
//   2. The dock cannot be dismissed while a draft is in it. Click-away is
//      switched off on purpose (folding a box she has typed into is the failure
//      this repo keeps coming back to) and Escape only blurs.
//   3. She leaves by the back arrow, which clears the TASK.
//
// `modal` is then still 'reply' with nothing on screen to say so, and the guard
// at the top of the key handler — `if (modal || inInput) return;` — swallows
// every single-letter shortcut in the app. Not just C: E, R, S, J, K, A, Z and
// the arrows are all dead too. ⌘K keeps working because it is handled ABOVE that
// guard, which is exactly why her screenshot shows the palette open on the same
// screen where C did nothing.
//
// Her second sentence is the same bug read from the other end: opening the card
// by hand writes 'compose' over the stale value and closing it writes null, so
// the key comes back to life and stays alive until the next time she leaves a
// reply behind.
//
// SO THE RULE IS APPLIED TO THE STATE, ONCE, rather than to each way out.
// There are at least four routes out of an open task — the back arrow, the "esc
// back" button, Escape, and closing the row — and patching the ones you can
// find is how the next one gets missed. `renderer/src/keys.ts` carries the same
// lesson from the S key, where two branches opened the same picker and only one
// of them was fixed.
//
// ADDING A MODAL MEANS ANSWERING THIS. If it is drawn inside an opened task,
// its name goes in the set below. If it floats over the app, it does not.
// `tests/a-modal-cannot-outlive-its-task.test.mjs` fails on a value that is in
// neither list.

/** Every value `modal` can hold. Kept here so the two lists below are total. */
export const EVERY_MODAL = ['compose', 'filter', 'palette', 'reply', 'snooze', 'standing'] as const;

export type ModalName = (typeof EVERY_MODAL)[number];

/** Drawn inside the opened task, so it dies with the task. */
export const BELONGS_TO_A_TASK: ReadonlySet<string> = new Set<ModalName>(['reply']);

/** Floats over the app, so leaving a task leaves it exactly where it was. */
export const BELONGS_TO_THE_APP: ReadonlySet<string> = new Set<ModalName>([
  // 'writing-rules' used to be here: the same Standing card, opened from the
  // Settings screen's Edit button. Both files are open fields on that page
  // now, so nothing opens it any more and the name is gone. So is 'themes',
  // the theme picker, which went with the themes (w-9e434e8671).
  // 'filter' is the menu under the corner's filter icon (w-aa3fa4cbf0). It is
  // about the box, never about a task.
  'compose', 'filter', 'palette', 'snooze', 'standing',
]);

/**
 * What `modal` should be once no task is open. The identity for anything that
 * floats over the app, so this can be applied on every render of the list
 * without fighting a modal she opened from the list itself.
 */
export function modalAfterLeavingATask<T extends string | null>(modal: T): T | null {
  return modal && BELONGS_TO_A_TASK.has(modal) ? null : modal;
}
