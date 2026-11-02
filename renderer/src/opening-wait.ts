// PURE. How long an opened file may take, and what the screen says while it does.

export const OPEN_WITHIN_MS = 20_000;

export const didNotOpen = (name: string) => `${name} did not open.`;

/** A skeleton of lines promises words, so only a document gets one. */
export const opensLike = (kind: string | null): 'words' | 'plain' => (kind === 'markdown' ? 'words' : 'plain');
