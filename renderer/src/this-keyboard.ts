// Which keyboard is in front of the window, asked once. The glyphs come out of
// shared/key-caps.mjs; this is the one answer that file is handed.
//
// `navigator` rather than the bridge, because the same page is served to a
// browser tab and to a phone (main/serve.mjs), where there is no preload.
//
// A Mac is the answer where there is no window at all, which is every test
// here; one that wants the other keyboard passes `false` itself. The question
// has to be `document` and not `navigator`, because node has a navigator of its
// own and answers `platform` with the machine node is on, which drew a
// different key on each machine from the same source.

import { capNameOf, capsOf, chordOf, everyChord, sayTheKeys } from '../../shared/key-caps.mjs';

/** Whether this keyboard has a Command key. */
export const MAC: boolean = typeof document === 'undefined' || typeof navigator === 'undefined'
  ? true
  : /mac/i.test(navigator.platform || '') || /Macintosh/i.test(navigator.userAgent || '');

/** One cap per key, in this keyboard's glyphs. */
export const caps = (key: string): string[] => capsOf(key, MAC);

/** A whole chord as one label, for a single cap or a tooltip. */
export const chord = (key: string): string => chordOf(key, MAC);

/** The word inside a cap beside its glyph, or null when the cap says it. */
export const capName = (cap: string): string | null => capNameOf(cap, MAC);

/** A row of keys that do the same thing, with the ones that collapse said once. */
export const chords = (keys: string[]): string[] => everyChord(keys, MAC);

/** The keys inside a sentence, in this keyboard's words. */
export const sayKeys = (text: string): string => sayTheKeys(text, MAC);

/** Send, as every card in the app labels it. */
export const SEND = chord('⌘↵');
