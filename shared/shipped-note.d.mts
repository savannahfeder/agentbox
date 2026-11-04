// Types for shared/shipped-note.mjs, which stays .mjs while plain Node on the Mac loads it.
export declare const shippedNote: (sha?: string | null) => string;
export declare const isShippedNote: (text: unknown) => boolean;
