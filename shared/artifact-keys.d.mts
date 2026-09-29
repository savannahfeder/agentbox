// Types for shared/artifact-keys.mjs, which is plain ESM so that main (Node)
// and the pane (Vite) can share one copy of the rule. The whole reason this
// rule exists is that it was applied in three places and disagreed in all
// three; see the module itself for the measurements.

export interface KeyPress {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

export function theAppKeepsThisKey(e: KeyPress | null | undefined): boolean;
export function theAppKeepsThisInput(
  input: { key?: string; meta?: boolean; control?: boolean; alt?: boolean } | null | undefined,
): boolean;
export function whatTheFileSentUp(
  k: { key?: string; meta?: boolean; ctrl?: boolean; alt?: boolean } | null | undefined,
): 'close' | 'palette' | 'app' | null;

// Her own single-letter shortcuts, which a PAGE has no claim on because there
// is nothing in a page to type.
export const HER_LETTERS_IN_A_PAGE: Set<string>;
export function theAppKeepsThisLetterInAPage(
  input: { key?: string; meta?: boolean; control?: boolean; alt?: boolean } | null | undefined,
): boolean;
// Asked OF the page, by main, because only a frame can see its own focus.
export const IS_SHE_TYPING_IN_THE_PAGE: string;
