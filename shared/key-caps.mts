// Every key the app draws, in the glyphs the keyboard in front of it has.
//
// This file never asks which keyboard that is: the renderer answers once in
// renderer/src/this-keyboard.ts and main answers with `process.platform`, so a
// test can draw either keyboard with no machine to run it on.

/** The word for each Mac glyph on a keyboard that has none of them. */
const PLAIN = {
  '⌘': 'Ctrl',
  '⌃': 'Ctrl',
  '⌥': 'Alt',
  '⇧': 'Shift',
  '↵': 'Enter',
  '⇥': 'Tab',
  '⌫': 'Backspace',
};

/** The keys written as a word rather than a glyph on both keyboards. */
const WORDS = ['esc', 'Ctrl', 'Alt', 'Shift', 'Enter', 'Tab', 'Backspace'];

/**
 * One cap per key. Anything that is one physical key stays whole however many
 *  characters it is written with, which keeps `esc` and `Ctrl+K` from being
 *  drawn letter by letter.
 */
export function capsOf(key, mac = true) {
  if (!key) return [];
  for (const word of WORDS) if (key === word) return [key];
  // Something already written out for this keyboard, such as the Ctrl+K the
  // shortcuts page lists beside ⌘K.
  if (!mac && key.includes('+')) return key.split('+');
  return [...key].map((c) => (mac ? c : PLAIN[c] ?? c));
}

/** A whole chord as one label: `⌘↵` on a Mac, `Ctrl+Enter` where there is no ⌘. */
export function chordOf(key, mac = true) {
  return capsOf(key, mac).join(mac ? '' : '+');
}

/**
 * The name written inside a cap beside its glyph, or null for a cap that says
 *  its own name. Only ⇥ on a Mac, which reads "⇥ Tab"; a keyboard whose cap is
 *  the word already would otherwise say "Tab Tab".
 */
export function capNameOf(cap, mac = true) {
  if (!mac) return null;
  return cap === '⇥' ? 'Tab' : null;
}

/**
 * A row of keys that do the same thing, with the ones that collapse said once.
 *  The shortcuts page lists ⌘K and Ctrl+K together because a Mac answers both;
 *  on Linux they are one key, and drawn twice the page looks like it is guessing.
 */
export function everyChord(keys, mac = true) {
  const out = [];
  for (const key of keys ?? []) {
    const chord = chordOf(key, mac);
    if (!out.includes(chord)) out.push(chord);
  }
  return out;
}

/** The keys inside a sentence, in this keyboard's words. */
export function sayTheKeys(text, mac = true) {
  if (mac || !text) return text;
  return text.replace(/[⌘⌃⌥⇧][⌘⌃⌥⇧]*[^\s,.;:!?]?/gu, (chord) => chordOf(chord, false));
}
