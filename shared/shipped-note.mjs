// The note the app writes on a row once its ship lands (main/store.mjs), and
// the one reader that has to know it is the app's and not an agent's
// (renderer/src/format.ts, offerIsLive).
export const shippedNote = (sha) => (sha ? `Shipped to main as ${sha}.` : 'Shipped to main.');

export const isShippedNote = (text) => /^Shipped to main(?: as [0-9a-f]{7,40})?\.$/.test(String(text ?? '').trim());
