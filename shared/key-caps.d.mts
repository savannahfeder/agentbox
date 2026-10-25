/** One cap per key, in this keyboard's glyphs. */
export declare function capsOf(key: string, mac?: boolean): string[];

/** A whole chord as one label: `⌘↵`, or `Ctrl+Enter` with no command key. */
export declare function chordOf(key: string, mac?: boolean): string;

/** The word inside a cap beside its glyph, or null when the cap says it. */
export declare function capNameOf(cap: string, mac?: boolean): string | null;

/** A row of keys that do the same thing, with the ones that collapse said once. */
export declare function everyChord(keys: readonly string[], mac?: boolean): string[];

/** The keys inside a sentence, in this keyboard's words. */
export declare function sayTheKeys(text: string, mac?: boolean): string;
