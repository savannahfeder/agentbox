// THE EFFORT STRIP SAYS WHAT THE RUN IS ALREADY AT, INSTEAD OF SAYING NOTHING.
//
// WHY IT WAS BLANK, AND WHY THAT WAS RIGHT AT THE TIME. shared/effort-levels.mjs
// says it outright: "a level nobody picked is the engine's own choice for the
// model... and this app does not know what that is per model, so it does not
// claim to." An app that lit a word it had guessed would be worse than a blank
// strip, because she would believe it.
//
// SO THE FIX IS TO KNOW, NOT TO GUESS, and both engines publish the answer per
// model. Codex's cache has carried `default_reasoning_level` all along, on the
// same row as the name (main/codex-models.mjs). Claude Code's catalog carries
// `default_effort` beside the display name, which main/claude-models.mjs now
// reads in the same pass. MEASURED out of 2.1.280 on 2026-09-22 and it genuinely
// differs per model: Opus 5.5 medium, Opus 5 high, Opus 4.7 xhigh, Sonnet 5
// high, and Haiku 4.5 names none at all.
//
// AND IT IS SHOWN, NOT SENT. The card still puts no level on the work item until
// she picks one, so what runs is unchanged and the engine goes on choosing. That
// is the line these tests hold hardest: `effortShown` is the word on screen and
// `effortPicked` is what travels, and making the first one answer must never
// change the second.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EFFORTS, defaultEffortFor, effortChoicesFor, effortPicked, effortShown,
  readLastEffort, writeLastEffort,
} from '../renderer/src/effort';
import { setClaudeModels } from '../renderer/src/models';

// What main hands down for a Mac on Claude Code 2.1.280, in the settings shape.
const CLAUDE = [
  { id: 'opus', label: 'Opus 5.5', model: 'claude-opus-5-5', defaultLevel: 'medium' },
  { id: 'claude-opus-5', label: 'Opus 5', model: 'claude-opus-5', defaultLevel: 'high' },
  { id: 'sonnet', label: 'Sonnet 5', model: 'claude-sonnet-5', defaultLevel: 'high' },
  { id: 'haiku', label: 'Haiku 4.5', model: 'claude-haiku-4-5', defaultLevel: null },
];

// And what Codex's own cache says on this Mac, same day (codex-cli 0.155.0).
const CODEX = [
  { id: 'gpt-6-sol', label: 'GPT-6-Sol', levels: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'], defaultLevel: 'medium' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol', levels: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'], defaultLevel: 'low' },
];

beforeEach(() => { setClaudeModels(CLAUDE); });

describe('the strip lights what the model thinks at on its own', () => {
  it('lights the picked model’s own default when she has picked no level', () => {
    expect(defaultEffortFor(null, 'opus')).toBe('medium');
    expect(effortShown(null, EFFORTS, defaultEffortFor(null, 'opus'))).toBe('medium');
  });

  it('MOVES WHEN SHE MOVES THE MODEL, because the answer is per model', () => {
    // This is the whole reason a single typed word would have been wrong.
    expect(defaultEffortFor(null, 'opus')).toBe('medium');
    expect(defaultEffortFor(null, 'claude-opus-5')).toBe('high');
    expect(defaultEffortFor(null, 'sonnet')).toBe('high');
  });

  it('lights nothing for a model that names no default, as it always did', () => {
    expect(defaultEffortFor(null, 'haiku')).toBe(null);
    expect(effortShown(null, EFFORTS, defaultEffortFor(null, 'haiku'))).toBe(null);
  });

  it('uses the model the card opens on when none is set', () => {
    expect(defaultEffortFor(null, null)).toBe('medium');
  });

  it('her own pick wins over the default', () => {
    expect(effortShown('max', EFFORTS, 'medium')).toBe('max');
  });

  it('falls back on the committed table when main has said nothing', () => {
    setClaudeModels(null);
    // Whatever the build read, it is a level or it is null, never a guess.
    const level = defaultEffortFor(null, 'opus');
    expect(level === null || EFFORTS.some((e) => e.id === level)).toBe(true);
  });
});

describe('Codex is lit from its own cache, which always carried the answer', () => {
  const opts = { codexModels: CODEX, codexDefault: 'gpt-6-sol' };

  it('lights the level that model advertises', () => {
    expect(defaultEffortFor('codex', 'gpt-6-sol', opts)).toBe('medium');
    expect(defaultEffortFor('codex', 'gpt-5.6-sol', opts)).toBe('low');
  });

  it('lights the default of the model her config.toml runs, when she picked none', () => {
    expect(defaultEffortFor('codex', null, opts)).toBe('medium');
  });

  it('lights nothing on a Mac whose Codex names no model at all', () => {
    expect(defaultEffortFor('codex', null, { codexModels: CODEX, codexDefault: null })).toBe(null);
  });

  it('never lights a level the model does not advertise', () => {
    const rows = effortChoicesFor('codex', 'gpt-6-sol', opts);
    const shown = effortShown(null, rows, defaultEffortFor('codex', 'gpt-6-sol', opts));
    expect(rows.some((e) => e.id === shown)).toBe(true);
    // And a default that is somehow not in the list is refused rather than drawn.
    expect(effortShown(null, rows, 'nonsense')).toBe(null);
  });
});

describe('showing it does not send it', () => {
  // THE ONE THAT MATTERS. A card she has not touched must still put no level on
  // the work item, so the engine keeps choosing and the day a default moves the
  // run moves with it. Compose reads `effortPicked`; the strip reads
  // `effortShown`; nothing lets the second leak into the first.
  it('a card she has not touched still picks nothing', () => {
    expect(effortShown(null, EFFORTS, 'medium')).toBe('medium');
    expect(effortPicked(null, EFFORTS)).toBe(false);
  });

  it('and one she has touched sends exactly what she said', () => {
    expect(effortPicked('max', EFFORTS)).toBe(true);
    expect(effortPicked('ultra', EFFORTS)).toBe(false);
  });
});

describe('and the pick is remembered, which it already was', () => {
  // This half was built on and survives the change; it is asserted here so the
  // two halves of the requirement are held in one place.
  it('keeps her level across cards, per engine', () => {
    const store = new Map();
    const fake = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    writeLastEffort('max', fake, null);
    writeLastEffort('ultra', fake, 'codex');
    expect(readLastEffort(fake, null)).toBe('max');
    expect(readLastEffort(fake, 'codex')).toBe('ultra');
    // Claude Code refuses `ultra`, so its own key must never come back with it.
    expect(readLastEffort(fake, null)).not.toBe('ultra');
  });

  it('clearing it goes back to the model’s own default rather than to blank', () => {
    const store = new Map();
    const fake = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    writeLastEffort('max', fake, null);
    writeLastEffort(null, fake, null);
    expect(readLastEffort(fake, null)).toBe(null);
    expect(effortShown(readLastEffort(fake, null), EFFORTS, defaultEffortFor(null, 'opus'))).toBe('medium');
  });
});
