// THE CODING-AGENT SLOT IN THE BYLINE, FILLED FOR THE FIRST TIME.
//
// `renderer/src/byline.ts` has carried an empty slot since 2026-08-27, with its
// own comment saying what would fill it: "The day a second harness lands, the
// fact goes back on the snapshot, this names it, and the drawing already has a
// place for it." This is that day, and the same comment set the two conditions
// this file exists to hold.
//
// ONE: IT IS A WORD, NEVER A MARK.So both engines are named the same way, in
// the same ink, in the same slot. Naming only the second one would make its
// ABSENCE the mark, which is the same thing wearing different clothes: a reader
// would learn that a row with no word is the Claude Code row, and she would
// have been taught a symbol after all.
//
// TWO: A WORD THAT IS THE SAME ON EVERY ROW SHE WILL EVER READ IS FURNITURE.
// That is the other half of that comment and it is why the word is conditional
// rather than always on. The condition is NOT "this row is unusual"; it is
// "there is a choice on this Mac at all", answered by main and handed over on
// the snapshot. On a Mac with one engine, or before she opens the gate, this
// returns null for every row and the line is byte-identical to the one she has
// been reading since 08-28.
//
// AND THE RENDERER DOES NOT WORK IT OUT. Whether a choice is real needs the
// capability gate (`ENGINE_CHOICE_ENABLED`) and the staleness rule
// (`engineChoiceOnRowIsStale`), both of which live in main and are pinned to
// one file there by tests/a-codex-row-from-august-still-runs-on-claude.test.mjs.
// A byline that derived its own answer could print "Codex" over a row the
// supervisor was about to run on Claude Code, which is worse than saying
// nothing: it would be the app telling her something it knows is not true.

import { describe, expect, it } from 'vitest';
import { bylineFacts, engineWordFor } from '../renderer/src/byline.ts';
import { Name } from '../shared/product-name.mjs';

const NOW = 1_700_000_000_000;
const M = 60_000;

const row = (over = {}) => ({
  id: 'w-1', status: 'open', title: 'A row', kind: 'directive',
  product: 'agentbox', productName: Name,
  createdAt: NOW - 60 * M, updatedAt: NOW - M,
  wrote: { body: { ts: NOW - 30 * M, source: 'founder' } },
  ...over,
});

const session = (over = {}) => ({ itemId: 'w-1', startedAt: NOW - 4 * M, helpers: 0, ...over });

/* ------------------------- one engine says nothing ------------------------ */
// THE CASE THAT MUST NOT MATCH, and it is the one every Mac is in today.

describe('with one engine there is nothing to name', () => {
  it('says nothing when main reports no choice, whatever the row runs on', () => {
    expect(engineWordFor()).toBeNull();
    expect(engineWordFor({})).toBeNull();
    expect(engineWordFor({ engine: 'codex' })).toBeNull();
    expect(engineWordFor({ engine: 'claude' })).toBeNull();
    expect(engineWordFor({ engineChoice: false, engine: 'codex' })).toBeNull();
  });

  // The whole line, not only the slot: a row with no choice reads exactly as it
  // read before this change, including the sentence read aloud.
  it('leaves the line she has been reading untouched', () => {
    const quiet = bylineFacts(row(), { now: NOW });
    expect(quiet.engineWord).toBeNull();
    expect(quiet.line).toBe(`${Name}. This is in your inbox, waiting for you.`);

    const working = bylineFacts(row(), { now: NOW, session: session(), inProgress: true });
    expect(working.engineWord).toBeNull();
    expect(working.line).toBe(`${Name}. This is in progress. The agent has been working on this for 4m.`);
  });

  // Not even a running Codex session names one, because a Mac with no choice on
  // it has no Codex session to have. This holds the rule at the seam rather than
  // only at the front door.
  it('is not opened by a session that carries an engine', () => {
    const f = bylineFacts(row(), { now: NOW, session: session({ engine: 'codex' }), inProgress: true });
    expect(f.engineWord).toBeNull();
    expect(f.line).not.toMatch(/codex/i);
  });
});

/* ------------------------ with a choice, both named ----------------------- */

describe('with a choice on this Mac, every row says which one', () => {
  it('names Claude Code on a Claude Code row and Codex on a Codex row', () => {
    expect(engineWordFor({ engineChoice: true, engine: 'claude' })).toBe('Claude Code');
    expect(engineWordFor({ engineChoice: true, engine: 'codex' })).toBe('Codex');
  });

  // A row main did not resolve is a row running on the default, which is the
  // engine she is running. Never blank, because a blank here would be the mark.
  it('names the default rather than going blank on a row with no answer', () => {
    expect(engineWordFor({ engineChoice: true })).toBe('Claude Code');
    expect(engineWordFor({ engineChoice: true, engine: null })).toBe('Claude Code');
    expect(engineWordFor({ engineChoice: true, engine: 'something-else' })).toBe('Claude Code');
  });

  it('puts the word in the sentence that is read aloud', () => {
    const waiting = bylineFacts(row(), { now: NOW, engineChoice: true, engine: 'codex' });
    expect(waiting.engineWord).toBe('Codex');
    expect(waiting.line).toBe(`${Name}. This is in your inbox, waiting for you. It will run on Codex.`);

    const running = bylineFacts(row(), {
      now: NOW, inProgress: true, session: session(), engineChoice: true, engine: 'codex',
    });
    expect(running.engineWord).toBe('Codex');
    expect(running.line).toBe(`${Name}. This is in progress. Codex has been working on this for 4m.`);
  });

  // WHAT IS RUNNING BEATS WHAT WOULD RUN. `engine` off the snapshot is a
  // prediction -- what the supervisor WOULD pick for this row on the next tick.
  // The session's own engine is the fact, written at the spawn that really
  // happened. They agree except across a change she just made, and there the
  // sentence has to be about the run in front of her rather than about the next
  // one.
  it('says what the live run is really on, not what the next one would be', () => {
    const f = bylineFacts(row(), {
      now: NOW, inProgress: true, engineChoice: true,
      engine: 'claude', session: session({ engine: 'codex' }),
    });
    expect(f.engineWord).toBe('Codex');
    expect(f.line).toBe(`${Name}. This is in progress. Codex has been working on this for 4m.`);
  });

  // The facts she cut stay cut. This word joins the line; it does not reopen
  // it. The project came back separately on 2026-09-28 (w-b8c8958a12).
  it('adds one word and no clock, kind or model', () => {
    const f = bylineFacts(row(), { now: NOW, engineChoice: true, engine: 'codex' });
    expect(f.whereWord).toBe('In your inbox');
    expect(f.age).toBe('30m');
    expect(JSON.stringify(f)).not.toMatch(/directive|opus/i);
  });
});
