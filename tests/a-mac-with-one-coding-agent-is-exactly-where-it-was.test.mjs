// A MAC WITH ONE CODING AGENT IS EXACTLY WHERE IT WAS.
//
// The standing constraint on every slice of the second engine, and the one that
// is easiest to break by accident: the gate is shut by default, so the machine
// almost every copy of Agentbox runs on has no Codex binary and no `engineChoice`
// in its config, and NOTHING about that machine may move.
//
// tests/one-coding-agent-draws-nothing-new.test.mjs holds the screen half of
// that. This file holds the DECISIONS, and it holds them by writing the rule as
// it was BEFORE this slice, inline, and asserting the two agree across every
// combination of inputs such a Mac can produce. A test that only asserted the
// new answers would be re-stating the new code; this one is a comparison.
//
// FOUR RULES CHANGED ON 2026-09-05 AND EVERY ONE OF THEM IS CHECKED HERE:
//
//   `engineChoiceOnRowIsStale` asked `isEngine`, now asks `enginePicked`.
//   `engineFor`'s fallback now consults `engineDefaultIsStale`.
//   `spawnPlan`'s model now goes through `modelForEngine`.
//   `zero:compose`'s model now goes through `Supervisor#modelOffered`.
//
// AND THE ONE CLASS THAT REALLY DOES CHANGE, STATED RATHER THAN HIDDEN. A row
// that names the OTHER harness and carries that harness's model no longer
// produces `claude --model gpt-5.6-sol`; it waits and says why
// (tests/a-model-she-picked-for-codex-never-runs-on-claude-code.test.mjs). That
// class of row cannot be left alone and fixed at the same time -- what it does
// today is die on arrival, silently, on every retry -- so it is excluded here by
// name rather than by an accident of coverage, and the exclusion is asserted to
// be exactly one class wide.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE, ENGINE_CHOICE_ENABLED,
  engineChoiceSince, engineChoiceOnRowIsStale, engineDefaultIsStale,
  engineFor, isEngine, modelForEngine,
} from '../shared/engines.mjs';

/* ------------------------- the rules as they were ------------------------ */
// Copied from the 2026-09-04 source, not paraphrased.

const wasStale = (item, config = {}) => {
  const since = engineChoiceSince(config);
  if (since === null) return false;
  if (!isEngine(item?.engine)) return false;
  const ts = item?.wrote?.engine?.ts;
  return !(Number.isFinite(ts) && ts >= since);
};

const wasEngineFor = (item, { config = {}, found = {}, enabled } = {}) => {
  if (enabled !== ENGINE_CHOICE_ENABLED) return DEFAULT_ENGINE;
  const wanted = isEngine(item?.engine) && !wasStale(item, config) ? item.engine : null;
  const fallback = isEngine(config?.engine) ? config.engine : DEFAULT_ENGINE;
  const pick = wanted ?? fallback;
  if (pick === DEFAULT_ENGINE) return DEFAULT_ENGINE;
  return found[pick] ? pick : DEFAULT_ENGINE;
};

const wasModelOnPlan = (item) => (typeof item?.model === 'string' && item.model ? item.model : null);

/* ------------------------------ the machine ------------------------------ */
// No Codex binary, and no moment in her config. `enabled` is undefined for the
// same reason: `Supervisor#_engineFor` derives the token from `engineChoice`,
// so a config with no moment in it cannot produce one.

const NO_CODEX = { codex: false };
const SHUT = [
  {},
  { engine: 'claude' },
  { engine: 'codex' },
  { engine: 'nonsense' },
  { engine: 'codex', engineAt: '2026-09-01' },
  { engine: 'codex', engineAt: 'not a date' },
];

const ROWS = [];
for (const engine of [undefined, 'claude', 'codex', 'nonsense']) {
  for (const model of [undefined, 'opus', 'gpt-5.6-sol']) {
    for (const ts of [undefined, 0, Date.parse('2026-08-26'), Date.parse('2026-09-10')]) {
      ROWS.push({
        ...(engine ? { engine } : {}),
        ...(model ? { model } : {}),
        ...(ts === undefined ? {} : { wrote: { engine: { ts } } }),
      });
    }
  }
}

/** The one class that is deliberately different: the row names the other
 *  harness AND carries a model, which used to become `claude --model <slug>`. */
const crossesHarnesses = (item) => isEngine(item?.engine) && item.engine !== DEFAULT_ENGINE && !!item.model;

describe('the fixtures themselves', () => {
  it('cover every shape a row can be, and one narrow class is excluded', () => {
    expect(ROWS).toHaveLength(48);
    expect(ROWS.filter(crossesHarnesses)).toHaveLength(8);
  });
});

describe('a Mac with no Codex and a shut gate', () => {
  it('routes every row exactly where it used to', () => {
    for (const config of SHUT) {
      for (const item of ROWS) {
        expect(engineFor(item, { config, found: NO_CODEX })).toBe(wasEngineFor(item, { config, found: NO_CODEX }));
        // Which on such a Mac is Claude Code for every row there is.
        expect(engineFor(item, { config, found: NO_CODEX })).toBe('claude');
      }
    }
  });

  it('calls nothing stale, exactly as it used to', () => {
    for (const config of SHUT) {
      for (const item of ROWS) {
        expect(engineChoiceOnRowIsStale(item, config)).toBe(wasStale(item, config));
        expect(engineChoiceOnRowIsStale(item, config)).toBe(false);
        expect(engineDefaultIsStale(config)).toBe(false);
      }
    }
  });

  it('puts the same model on the plan for every row that is not the excluded class', () => {
    for (const item of ROWS) {
      if (crossesHarnesses(item)) continue;
      expect(modelForEngine(item, 'claude')).toBe(wasModelOnPlan(item));
    }
  });

  // And the excluded class, named: it is the one that used to hand Claude Code
  // the other harness's slug, and only that one.
  it('changes exactly the rows that used to become a command line that cannot run', () => {
    const moved = ROWS.filter((item) => modelForEngine(item, 'claude') !== wasModelOnPlan(item));
    expect(moved).toHaveLength(8);
    for (const item of moved) {
      expect(item.engine).toBe('codex');
      expect(wasModelOnPlan(item)).toBeTruthy();
      expect(modelForEngine(item, 'claude')).toBe(null);
    }
  });
});

// AND THE SAME MAC WITH THE GATE OPEN AND NO BINARY, which is the other shape
// this constraint covers: she opened the gate on her laptop and is reading the
// same store here. The routing is unchanged there too -- `engineFor` still falls
// back and RUNS, which is the behaviour shared/engines.mjs is explicit about
// keeping.
describe('a Mac with no Codex where the gate has been opened', () => {
  const OPEN = { enabled: ENGINE_CHOICE_ENABLED };
  const configs = [
    { engineChoice: '2026-09-04' },
    { engine: 'codex', engineChoice: '2026-09-04' },
    { engine: 'codex', engineAt: '2026-09-01', engineChoice: '2026-09-04' },
  ];

  it('still routes every row to Claude Code, as it did', () => {
    for (const config of configs) {
      for (const item of ROWS) {
        expect(engineFor(item, { ...OPEN, config, found: NO_CODEX })).toBe('claude');
      }
    }
  });
});
