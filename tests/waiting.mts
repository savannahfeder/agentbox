// WAITING ON THE THING, NOT ON A CLOCK.
//
// Several of the end-to-end tests here drive real child processes and a real
// Supervisor, and then wait for the work to finish. A dozen agents share this
// Mac, so how long that takes is not a property of the test: measured on
// 2026-10-04, tests/a-signed-out-codex-comes-back-on-its-own-end-to-end.mjs
// ran its 8 tests in 1,592 ms alone at load 63, and hit a ten-second ceiling
// at load 114. Nothing was wrong with the branch; the ship bounced anyway, and
// it cost every ship on this machine rather than one row.
//
// Two things make that stop happening, and both are here.
//
// The deadline is generous, because a loaded Mac is slow rather than broken,
// and it is ONE number (`BUSY_MAC_MS`) so that nobody has to pick a new one by
// feel. The polling is what decides when to carry on, so a fast machine is
// never made to wait: the deadline only exists to end a wait that will never
// finish.
//
// And giving up THROWS, naming what it was waiting for. The helpers this
// replaces returned quietly when their clock ran out, so the test carried on
// and failed some assertion further down, which reads as a bug in the code
// under test rather than as a machine that was busy.

/** How long a wait on real work may take on a Mac with a dozen agents on it. */
export const BUSY_MAC_MS = 30_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait until `cond` returns something truthy, and return it.
 *
 * @param {string} what  what is being waited for, in words, for the message
 *                       when it never happens ("the session to finish").
 * @param {() => any} cond  checked now and then; may be async.
 * @throws if it has not happened by the deadline.
 */
export async function waitFor(what, cond, { ms = BUSY_MAC_MS, every = 20 } = {}) {
  const until = Date.now() + ms;
  for (;;) {
    const got = await cond();
    if (got) return got;
    if (Date.now() >= until) {
      throw new Error(`waited ${Math.round(ms / 1000)}s for ${what} and it never happened`);
    }
    await sleep(every);
  }
}

/** Wait until `cond` goes false, for the waits that are for something ENDING. */
export const waitUntilNo = (what, cond, opts) => waitFor(what, async () => !(await cond()), opts);
