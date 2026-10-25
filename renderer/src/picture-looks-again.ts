// WHEN A PICTURE DRAWN AS MISSING LOOKS FOR ITS FILE AGAIN (2026-10-14).
//
// A teammate's picture can land after the message that names it: the reader's
// Mac asks the cloud for a missing file once a minute (main/team/sync.mjs).
// The picture used to ask once and then say "missing image" for good, which
// is how "attachments do not open in threads and DM" reached us. Soon at
// first, then less often, about twenty minutes in all; pressing the picture
// looks again at once after that.
const WAITS = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000];

/** How long to wait before look number `tries + 1`, or null to stop. */
export function lookAgainAfter(tries: number): number | null {
  if (!Number.isInteger(tries) || tries < 0) return null;
  return WAITS[tries] ?? null;
}
