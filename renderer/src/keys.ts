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
export const OPENS_A_TEXT_FIELD = new Set(['r', 's', 'c', 'n', '/']);

export function opensATextField(key: string): boolean {
  return OPENS_A_TEXT_FIELD.has(key.toLowerCase());
}
