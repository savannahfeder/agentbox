// The model clause in the new task card, and the two ways a list of model names
// has already gone wrong in this app.
//
// One: two copies of the same names. The composer and the reply dock each kept
// their own word for a priority level and drifted ("medium" against "Medium"),
// which is why ../renderer/src/priority.ts exists. The model names now live in
// one file for the same reason, and settings reads the same one.
//
// Two: a value drawn as something it is not. Settings' own rule, already
// written down there: a model set by hand that is none of the three is shown AS
// ITSELF rather than rounded to the nearest button. A control that draws a
// value it is not running has started lying about the fleet.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL,
  LAST_MODEL_KEY,
  MODELS,
  modelChoices,
  modelLabelOf,
  modelPicked,
  readLastModel,
  writeLastModel,
} from '../renderer/src/models.ts';

const fakeStore = (refuse = false) => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (refuse) throw new Error('QuotaExceededError'); map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
};

describe('the names', () => {
  // WHAT SHE REJECTED IS STILL REJECTED, AND IT WAS NEVER A MODEL. It was a row
  // reading "the default model", whose whole job was to explain that the picker
  // might not be picking anything, and she turned it down twice under two
  // wordings. Four real models is not that row coming back, which is what the
  // second line here holds: every row names something you can actually run.
  //
  // So the list is eight rows in four pairs, and the pairs are still her four
  // words in her order. The row she rejected has not come back either way.
  it('is the models she has named, each with the one before it', () => {
    const aliases = MODELS.filter((m) => !m.id.startsWith('claude-'));
    expect(aliases.map((m) => m.id)).toEqual(['opus', 'sonnet', 'haiku', 'fable']);
    for (const m of MODELS) expect(m.label).not.toMatch(/default|usual|workspace/i);
    // Newest first and its predecessor under it, family by family.
    expect(MODELS.map((m) => m.id.startsWith('claude-')))
      .toEqual([false, true, false, true, false, true, false, true]);
  });

  // The label is not asserted word for word on purpose. It is Claude Code's own
  // display name, generated out of its catalog at build time
  // (scripts/read-claude-models.mjs), so pinning the string here would mean this
  // file had to be edited every time a model shipped, which is the maintenance
  // the alias design exists to avoid. What IS pinned is the property she asked
  // for: a version in every name, so no two rows can be confused.
  it('says which version each one is', () => {
    for (const m of MODELS) {
      expect(m.label, `${m.id} has no version in its name`).toMatch(/\d/);
      // The family word is in the name whichever kind of row this is: `opus`
      // reads "Opus 5.5" and `claude-opus-5` reads "Opus 5".
      const family = m.id.startsWith('claude-') ? m.id.match(/opus|sonnet|haiku|fable|mythos/)[0] : m.id;
      expect(m.label.toLowerCase()).toContain(family);
    }
  });

  // The row also carries the id it resolved to, which is the thing that would
  // actually be wrong if an alias were ever pointed somewhere old.
  it('knows the model each alias resolves to', () => {
    for (const m of MODELS) {
      expect(m.model, `${m.id} resolved to nothing`).toMatch(/^claude-/);
      // A pinned row IS its model, so it resolves to itself.
      if (m.id.startsWith('claude-')) expect(m.model).toBe(m.id);
      else expect(m.model).toContain(m.id);
    }
  });

  // Measured against Claude Code 2.1.257 on her Mac: the alias already resolved
  // to claude-fable-5-1. This holds it there, and it is the one version pinned
  // by hand anywhere, because she named it.
  it('points Fable at 5.1, which is what she asked', () => {
    const fable = MODELS.find((m) => m.id === 'fable');
    expect(fable.model).toBe('claude-fable-5-1');
    expect(fable.label).toBe('Fable 5.1');
  });

  // The ids are the CLI's own aliases, not pinned versions. She asked whether
  // the list could come from Claude Code instead of being maintained here; the
  // CLI has no command that lists models, but --model takes an alias, so these
  // words stay correct on their own when a version ships. A pinned id here goes
  // stale silently, which is exactly the maintenance she meant. Fable joins on
  // those terms or not at all, and it is named in that sentence of the CLI's
  // own help, so the alias is one Claude Code already resolves.
  //
  // THE PINNED ROWS DO NOT WEAKEN THAT AND THIS IS WHERE IT IS HELD. Since
  // there is a second row per family sending an exact id, which is the only way
  // to ask for an older model on purpose. What must stay true is that the row a
  // card OPENS ON is still an alias, so a card nobody touched cannot go stale.
  // Pinning is a thing she does, never a thing that happens.
  it('names the newest of each family by alias, so a new version needs no edit here', () => {
    const newest = MODELS.filter((m) => !m.id.startsWith('claude-'));
    expect(newest).toHaveLength(4);
    for (const m of newest) expect(m.id).not.toMatch(/\d/);
    expect(newest.every((m) => m.model.startsWith(`claude-${m.id}`))).toBe(true);
    // And the default is one of them.
    expect(newest.some((m) => m.id === DEFAULT_MODEL)).toBe(true);
  });

  // The clause reads "On <word>." and with no inherit row it must name a real
  // model rather than a phrase about settings.
  it('names a real model when she has picked nothing', () => {
    const opus = MODELS.find((m) => m.id === DEFAULT_MODEL);
    expect(opus).toBeTruthy();
    expect(modelLabelOf(null)).toBe(opus.label);
    expect(modelLabelOf(DEFAULT_MODEL)).toBe(opus.label);
  });

  it('shows a hand-set model as itself rather than rounding it', () => {
    const odd = 'claude-3-5-sonnet-20241022';
    expect(modelChoices(odd).map((m) => m.id)).toContain(odd);
    expect(modelLabelOf(odd)).toBe(odd);
  });

  it('does not grow a duplicate row for one it already knows', () => {
    expect(modelChoices('opus')).toHaveLength(MODELS.length);
  });

  // A pinned id IS a row of the list now, so it draws with Claude Code's own
  // name for it rather than as a bare slug, and it grows no extra row. This
  // assertion used to expect the slug, which was right when the only way to hold
  // one was a card saved under an older build.
  it('draws a pinned id as the model it is', () => {
    expect(modelLabelOf('claude-opus-5')).toBe('Opus 5');
    expect(modelChoices('claude-opus-5')).toHaveLength(MODELS.length);
  });

  // One the list does NOT carry still reads as itself rather than vanishing.
  it('still shows a pinned id the list does not carry', () => {
    expect(modelLabelOf('claude-opus-4-1')).toBe('claude-opus-4-1');
    expect(modelChoices('claude-opus-4-1')).toHaveLength(MODELS.length + 1);
  });
});

describe('picked, or merely displayed', () => {
  // This is what holds the footer open at rest, so it has to be false for the
  // card that has simply been opened and true only for a card she has changed.
  it('the default is not a pick', () => {
    expect(modelPicked(null)).toBe(false);
    expect(modelPicked(DEFAULT_MODEL)).toBe(false);
  });

  it('a model she moved to is', () => {
    expect(modelPicked('haiku')).toBe(true);
  });
});

describe('remembering it', () => {
  // Same rule as the level she last picked: a card that forgets makes her
  // choose again on every task.
  it('survives the send', () => {
    const store = fakeStore();
    writeLastModel('claude-sonnet-5', store);
    expect(readLastModel(store)).toBe('claude-sonnet-5');
    expect(store.map.get(LAST_MODEL_KEY)).toBe('claude-sonnet-5');
  });

  it('going back to inheriting clears it rather than storing a word', () => {
    const store = fakeStore();
    writeLastModel('claude-sonnet-5', store);
    writeLastModel(null, store);
    expect(store.map.has(LAST_MODEL_KEY)).toBe(false);
    expect(readLastModel(store)).toBe(null);
  });

  it('a refused store loses the memory and never the send', () => {
    const store = fakeStore(true);
    expect(() => writeLastModel('claude-opus-5', store)).not.toThrow();
    expect(readLastModel(store)).toBe(null);
  });
});
