// The note the app writes on a row once its ship lands (main/store.mjs), and
// the one reader that has to know it is the app's and not an agent's
// (renderer/src/format.ts, offerIsLive). `closed` is a row the project's
// ship setting closed (shared/ship-mode.mjs).
export const shippedNote = (sha, closed = false) => `Shipped to main${sha ? ` as ${sha}` : ''}${closed ? ', and closed itself' : ''}.`;

export const isShippedNote = (text) => /^Shipped to main(?: as [0-9a-f]{7,40})?(?:, and closed itself)?\.$/.test(String(text ?? '').trim());
