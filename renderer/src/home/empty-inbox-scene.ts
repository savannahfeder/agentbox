// Home's mountains and birds, as the empty Inbox wears them (approved 2026-11-24).

import type { Mountains } from './mountains';

type Box = { x: number; y: number; w: number; h: number };

/** Home's four. */
export const EMPTY_INBOX_BIRDS = 4;
/** Where the birds keep, in shares of the card: under the tabs, over the heading. */
export const EMPTY_INBOX_SKY = { top: 0.17, bottom: 0.42 };

/** Home's ranges on a W×H card, thinned out round `words` (the heading down to the writing box) once it is found. */
export function emptyInboxHills(base: Mountains, words: Box | null, W: number, H: number): Mountains {
  const quiet = words ? { x: (words.x + words.w / 2) / W, y: 1 - (words.y + words.h / 2) / H, rx: 0.3, ry: 0.16 } : null;
  return { ...base, lift: 1, quiet };
}
