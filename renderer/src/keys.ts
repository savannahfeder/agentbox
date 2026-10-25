// PURE. The single-letter shortcuts that put a focused text field on screen.
//
// A SHORTCUT THAT OPENS A TEXT FIELD MUST SWALLOW ITS OWN KEYSTROKE, or the
// key that opened the field is then typed into it. the "s" that opened the
// schedule picker landed in the picker's input, the time was typed on top of
// it, and the box read "stomorrow". The grammar could not read that, and the
// Enter handler silently applied the first preset instead, "In 30 minutes".
// The row came back half an hour later carrying a time nobody picked, which
// looked like snoozing being broken, and it was not.
//
// This lives in its own file because there were TWO branches that open the
// picker, the focus-mode one and the list one, and only one of them was found
// the first time. Fixing branches is how the second one gets missed; the rule
// is applied once, to the key, before either branch runs.
// `/` opens the search field, which is the tab row itself. Without this the
// slash that opened it is the first character of the query, and every search
// starts by returning nothing.
//
// AND THE SCHEDULE PICKER IS ON L NOW, NOT S (2026-10-01). S opens the
// summary inside a thread (threads/Summary.tsx) and opened the picker
// everywhere else, so one letter meant two things and an office manager
// testing the app hit both in a minute. S is the summary's everywhere; L is
// "later" and is the one key that schedules. The paragraph above still
// describes what goes wrong, with L in place of S: it is the key that opens
// the picker that has to be swallowed, whichever letter that is.
export const OPENS_A_TEXT_FIELD = new Set(['r', 'l', 'c', 'n', '/']);

export function opensATextField(key: string): boolean {
  return OPENS_A_TEXT_FIELD.has(key.toLowerCase());
}

// THE KEYBOARD TAKES THE LIST BACK, and Escape is one of the keys that does it.
//
// A pointer left sitting on a row owns R, E and Enter for as long as it sits
// there (`pointed` in App.tsx), which is right while the hand is on the mouse
// and wrong the moment the hand goes back to the keys. J and K have cleared
// the hover for that reason since they were written.
//
// Escape out of a thread was the hole. The pointer has not moved since before
// the thread was opened, so it is still on whichever row was under it then,
// and Enter straight after, the way anyone walks an inbox, opened THAT row
// rather than the one lit at the top of the list. Twice in one tester's
// evening (power-test-2, issue 46): "I didn't notice the selection had moved
// until the thread opened."
//
// Same shape as the rule above and for the same reason: applied once, to the
// key, above the branches, because there are several branches and fixing them
// one at a time is how the next one gets missed.
const TAKES_THE_LIST_BACK = new Set(['j', 'k', 'arrowdown', 'arrowup', 'escape', 'tab']);

export function takesTheListBack(key: string): boolean {
  return TAKES_THE_LIST_BACK.has(key.toLowerCase());
}

// WHAT A KEY MEANS WHILE A BOX IS OPEN, which is not one answer but three.
//
// Typing owns the keyboard: a caret in any field takes every key, and a modal
// owns its own screen. Both were one condition, and the reply dock sat inside
// it: Escape in a box you have typed into keeps the box and takes the caret
// out (Focus.tsx, a draft holds it open on purpose), so `modal` stayed 'reply'
// with nothing focused and L, E and J were dead until a second Escape. The
// click-away out of the dock found the same gate from the other side.
//
// The reply dock is the one box that is not a modal — it is drawn into the card
// and has no backdrop — so with the caret elsewhere the thread under it is
// what the keyboard is pointed at.
export type WhileABoxIsOpen = 'close-the-modal' | 'swallow' | 'through';

export function keyWhileABoxIsOpen(
  { modal, inInput, key }: { modal: string | null; inInput: boolean; key: string },
): WhileABoxIsOpen {
  if (!modal && !inInput) return 'through';
  if (key === 'Escape' && !inInput) return 'close-the-modal';
  return modal === 'reply' && !inInput ? 'through' : 'swallow';
}
