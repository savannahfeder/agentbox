// BEAT EIGHT: THE THREE EXAMPLE ROWS, AND CLEARING THEM IS THE POINT.
//
// STAGED IS THE ONE SHE TOOK, off the round four page: "Build it, with the
// staged tasks on beat eight (recommended)", answered "perfect! build it". The
// alternative was really running three of the agents just imported, which
// spends somebody's tokens in their first minute and does nothing at all on a
// Mac that had no agent files on it.
//
// THE THREE SHAPES ARE FROM ROUND ONE: a question, a piece of finished work,
// and a decision an agent made without her. Between them they are the whole of
// what an inbox holds and the three different things clearing one can mean.
//
// EVERY ONE OF THEM SAYS "Example" FIRST, IN THE TITLE AS WELL AS THE RESULT.
// Somebody who clears three tasks in an onboarding and later finds them in
// their closed list should never have to wonder whether they were real.
//
// This file has no window and no filesystem in it so both halves can read it:
// the renderer draws the walk off ../renderer/src/onboarding.ts, and the main
// process writes the rows off here.

export const EXAMPLES = [
  {
    kind: 'question',
    title: 'Example: which of these two names should the project use?',
    result: 'Example. Both are free. Say either one and I will rename everything to match.',
    agoMs: 4 * 60_000,
  },
  {
    kind: 'task',
    title: 'Example: the sign in page is built and the tests are green.',
    result: 'Example. Nothing here needs you. Close it and it is gone.',
    agoMs: 11 * 60_000,
  },
  {
    kind: 'review',
    title: 'Example: I took the smaller library, say if you disagree.',
    result: 'Example. This is what an agent looks like when it made a call without you.',
    agoMs: 26 * 60_000,
  },
];

/**
 * WHAT PUTS A ROW IN HER INBOX, and it is not the kind or the label: it is
 *  `answeredHerAsk` in renderer/src/list-rules.ts, which is her own open row
 *  carrying a result an agent wrote AFTER her last word on it. So each example
 *  is written twice, her half and then the agent's half, and the agent's half
 *  has to carry the later timestamp or the row is real and simply never drawn.
 *
 *  This returns the two writes for one example, in order, with the timestamps
 *  already worked out. Pure, so the ordering is tested rather than hoped for:
 *  tests/the-walk-stages-three-examples.test.mjs. */
export function stampsFor(example, now) {
  const at = now - example.agoMs;
  return {
    // the row exists and it is her ask, at the moment it landed.
    hers: at,
    // The agent's: strictly later, which is what the inbox rule asks for.
    agent: at + 1_000,
  };
}
