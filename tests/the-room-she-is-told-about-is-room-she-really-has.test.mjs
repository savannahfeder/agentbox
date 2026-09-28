// TWO NUMBERS, TWO ROWS APART, DISAGREEING ABOUT THE SAME MAC.
//
// Settings' Agents pane draws "Room for N at once" straight off
// `status.capacity` (`_capacity`), and directly under it "Up to 3 run together"
// off `sessionsAtOnce` times her Claude accounts. On any Mac with `codex` on
// PATH and no `engineChoice` moment in zero.config.json -- which is EVERY Mac
// before she opts in, including hers today -- those two lines disagreed:
// six against three.
//
// WHY. `_capacityFor` refused Codex on one fact only:
//
//   if (which === 'codex' && !this.config.codexBin) return 0;
//
// while `_engineFor` and `engineChoices` both refuse on TWO -- the capability
// gate first (`engineChoiceOpened`), then the binary. So a machine with the
// binary and a shut gate counted three Codex slots that no row can ever reach,
// because `engineFor` hands every row on that machine to Claude Code. The
// docblock over the method asserted the opposite in as many words -- "`codexBin`
// is the same fact `_engineFor` refuses on" -- and this repo treats a comment
// that is wrong as a defect, so the sentence is pinned here too.
//
// THREE THINGS RODE ON THAT NUMBER, not one. `_capacity` is on `zero:snapshot`
// and is what her screen prints. `_hasSlotFor` tests the whole-Mac ceiling as
// its second conjunct, so the ceiling was inflated for the engine that WAS
// running. And `_anotherEngineCanRun` -- which decides whether a braked Claude
// fleet may skip the tick's early return -- answered true on a Mac that has no
// second engine at all, so a fleet with nowhere left to run kept scanning for
// an engine no row can be routed to.
//
// THE CASE THAT MUST NOT MATCH is the whole point of the slice: a Claude-only
// Mac, and a Mac with the gate really open, must both answer exactly what they
// answered before. The gate stays shut by default, so the second one needs the
// moment written to reach it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// A HOME WITH NOBODY SIGNED IN ON IT. The fleet's account list is what the
// config names plus whatever is signed in on disk (main/account-discovery.mjs),
// so a developer with a second Claude subscription would otherwise get twice
// every number here.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const CODEX_BIN = '/nonexistent/codex/codex';
// The shape `engineChoiceSince` accepts. Any other shape is read as off, which
// is what `a-codex-row-from-august-still-runs-on-claude` pins.
const OPENED = '2026-09-04T00:00:00Z';

const emptyStore = { listItems: () => [], listProducts: () => [], isDue: () => true };

const sup = (extra = {}) => new Supervisor(
  {
    home: ONE_ACCOUNT_HOME,
    storeRoot: '/nonexistent-zero-root',
    maxConcurrentSessions: 3,
    authProfiles: ['default'],
    ...extra,
  },
  emptyStore,
  '/nonexistent-app',
);

describe('the room she is told about is room a row can really reach', () => {
  // HER MAC, TODAY. codex is on PATH (0.148.0, measured 2026-09-05) and she has
  // never written the moment. Six was the number on her screen; three is the
  // number of sessions that can actually start.
  it('counts no codex slots while the gate is shut', () => {
    expect(sup({ codexBin: CODEX_BIN })._capacity()).toBe(3);
  });

  // THE SAME FACT ASKED OF THE ENGINE DIRECTLY, so a fix that only patched the
  // sum would still go red here.
  it('gives codex no capacity of its own while the gate is shut', () => {
    expect(sup({ codexBin: CODEX_BIN })._capacityFor('codex')).toBe(0);
  });

  // THE BOUNDARY ON ONE SIDE: the moment is written, the binary is there, and
  // the second engine is real. This is the machine the per-engine cap was
  // built for and its number must not move.
  it('counts codex once she has opened the gate', () => {
    const s = sup({ codexBin: CODEX_BIN, engineChoice: OPENED });
    expect(s._capacityFor('codex')).toBe(3);
    expect(s._capacity()).toBe(6);
  });

  // THE BOUNDARY ON THE OTHER SIDE: the gate is open and Agentbox cannot see
  // Codex. `config.codexBin` is null exactly there (main/config.mjs), and the
  // binary was always the fact this method refused on.
  it('counts no codex slots when the gate is open and codex is not on the mac', () => {
    expect(sup({ codexBin: null, engineChoice: OPENED })._capacity()).toBe(3);
  });

  // THE CASE THAT MUST NOT MATCH. Every downloaded copy of Agentbox: no Codex, no
  // moment. Nothing in this slice may move this number.
  it('leaves a claude-only mac reporting exactly what it always reported', () => {
    expect(sup({ codexBin: null })._capacity()).toBe(3);
    expect(sup({ codexBin: null })._capacityFor('claude')).toBe(3);
  });

  // AND THE CLAUDE CAP IS NEVER THE THING THAT MOVES, on any of the four
  // machines above. A fix that reached the right total by taking it out of
  // Claude Code would be a worse bug than the one being fixed.
  it('never moves the claude cap, whatever the gate and the binary say', () => {
    for (const extra of [
      { codexBin: CODEX_BIN },
      { codexBin: CODEX_BIN, engineChoice: OPENED },
      { codexBin: null, engineChoice: OPENED },
      { codexBin: null },
    ]) expect(sup(extra)._capacityFor('claude')).toBe(3);
  });
});

/* ============== the two other readers of the same number ================= */

describe('the whole-mac ceiling and the brake read the same shut gate', () => {
  // `_hasSlotFor` asks `_loadFor < _capacityFor` AND `_load < _capacity`. With
  // three phantom Codex slots in the ceiling, the second conjunct was slack by
  // exactly the engine that cannot run.
  it('offers no codex slot while the gate is shut', () => {
    expect(sup({ codexBin: CODEX_BIN })._hasSlotFor('codex')).toBe(false);
  });

  it('offers a codex slot once the gate is open', () => {
    expect(sup({ codexBin: CODEX_BIN, engineChoice: OPENED })._hasSlotFor('codex')).toBe(true);
  });

  // THE BRAKE'S ESCAPE HATCH. A Claude fleet with nowhere left to run stops the
  // tick early UNLESS another engine could still work. On a shut gate no other
  // engine can, and answering true there kept a dead fleet scanning.
  it('says no other engine can run while the gate is shut', () => {
    expect(sup({ codexBin: CODEX_BIN })._anotherEngineCanRun()).toBe(false);
  });

  it('says another engine can run once the gate is open', () => {
    expect(sup({ codexBin: CODEX_BIN, engineChoice: OPENED })._anotherEngineCanRun()).toBe(true);
  });
});

/* ===================== the sentence that was false ======================= */

describe('the docblock over the cap', () => {
  // A COMMENT THAT IS WRONG IS A DEFECT HERE. This one told the next reader
  // that the binary alone is what `_engineFor` refuses on, which is how the
  // gate came to be missing from the method underneath it.
  it('no longer claims the binary is the same fact _engineFor refuses on', () => {
    const src = fs.readFileSync(path.join(root, 'main/supervisor.mjs'), 'utf8');
    expect(src).not.toContain("`codexBin` is the same fact `_engineFor`");
  });
});
