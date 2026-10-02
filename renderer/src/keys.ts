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
