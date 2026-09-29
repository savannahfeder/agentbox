// "ON OPUS. WITH CODEX." IS TWO SENTENCES THAT CANNOT BOTH BE TRUE.
//
// `renderer/src/models.ts` held four names -- Opus, Sonnet, Haiku, Fable -- and
// `modelChoices(id)` drew them whatever the engine was. Those four are CLAUDE
// CODE ALIASES: `--model opus` is resolved by that CLI at spawn. Codex has no
// aliases at all; `thread/start`'s `model` wants an exact slug (`gpt-5.6-sol`),
// and main/supervisor.mjs `codexModelRefusal` now REFUSES to start a run whose
// model this Mac's Codex does not know. So the old picker did not merely read
// wrong on a Codex row: it produced a row that cannot run.
//
// THE TWO LISTS SHARE NO WORD, and that is what every assertion below leans on.
// Nothing here pins Codex's names: they are read off this Mac out of the cache
// codex-cli maintains (main/codex-models.mjs says why a hardcoded list is wrong
// the week after it is written), so the fixture stands in for that read and the
// only thing asserted is that a list from one engine never reaches the other.
//
// AND THE MEMORY IS PER ENGINE, which is the half that bites silently. The card
// remembers her last model on purpose (../renderer/src/models.ts, her ask). One
// key for both engines means remembering `haiku` and then handing it to Codex,
// which is a word its CLI has never heard of and, since 2026-09-04, a run the
// supervisor refuses outright. Claude Code keeps the original key so nothing
// she has already chosen is forgotten by this change.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL,
  LAST_MODEL_KEY,
  MODELS,
  CODEX_OWN,
  defaultModelFor,
  engineModelChoices,
  engineModelLabel,
  engineModelPicked,
  lastModelKey,
  modelChoices,
  readLastModel,
  writeLastModel,
} from '../renderer/src/models.ts';

const fakeStore = () => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
};

// WHAT `codexModels({home})` HANDS BACK, in the shape main/codex-models.mjs
// builds it: Codex's own display names, in its own `priority` order. Two rows
// is enough for every question below and keeps the fixture from looking like a
// list anybody should maintain.
const CODEX = [
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
  { id: 'gpt-5.5', label: 'GPT-5.5' },
];

describe('the list on the card is the list that engine can run', () => {
  it('offers Claude Code its four aliases on a Claude Code row', () => {
    const rows = engineModelChoices('claude', null, { codexModels: CODEX });
    expect(rows.map((m) => m.id)).toEqual(MODELS.map((m) => m.id));
  });

  it('offers Codex the slugs this Mac reported, on a Codex row', () => {
    const rows = engineModelChoices('codex', 'gpt-5.6-sol', { codexModels: CODEX, codexDefault: 'gpt-5.6-sol' });
    expect(rows.map((m) => m.id)).toEqual(['gpt-5.6-sol', 'gpt-5.5']);
  });

  // THE ONE THAT MUST NOT MATCH, and it is the whole of her report. Neither
  // list may leak into the other, in either direction: a Claude alias on a
  // Codex card is the run the supervisor now refuses, and a Codex slug on a
  // Claude card is a `--model` that CLI cannot resolve.
  it('never lets one engine\'s names reach the other\'s card', () => {
    const onCodex = engineModelChoices('codex', null, { codexModels: CODEX, codexDefault: 'gpt-5.6-sol' })
      .map((m) => m.id);
    for (const claude of MODELS.map((m) => m.id)) expect(onCodex).not.toContain(claude);

    const onClaude = engineModelChoices('claude', null, { codexModels: CODEX, codexDefault: 'gpt-5.6-sol' })
      .map((m) => m.id);
    for (const codex of CODEX.map((m) => m.id)) expect(onClaude).not.toContain(codex);
  });

  // A row with no engine is a Claude Code row, which is every card on every Mac
  // that has never opened the gate. The default has to be the safe one here for
  // the same reason it is in shared/engines.mjs.
  it('reads no engine as Claude Code', () => {
    expect(engineModelChoices(null, null, { codexModels: CODEX }).map((m) => m.id))
      .toEqual(modelChoices(null).map((m) => m.id));
  });

  // The boundary either side: a word neither list carries still draws AS
  // ITSELF, which is the rule `modelChoices` has always followed. A control
  // that quietly drops a value it is running has started lying about the fleet,
  // and her own config.toml may name a model the cache marks hidden.
  it('keeps a model set by hand that the fetched list does not carry', () => {
    const rows = engineModelChoices('codex', 'gpt-reserve', { codexModels: CODEX, codexDefault: 'gpt-5.6-sol' });
    expect(rows.map((m) => m.id)).toContain('gpt-reserve');
    expect(engineModelLabel('codex', 'gpt-reserve', { codexModels: CODEX })).toBe('gpt-reserve');
  });
});

describe('what the word says when she has picked nothing', () => {
  it('is Opus on Claude Code, as it has always been', () => {
    expect(defaultModelFor('claude', 'gpt-5.6-sol')).toBe(DEFAULT_MODEL);
    expect(defaultModelFor(null, null)).toBe(DEFAULT_MODEL);
  });

  // Her own ~/.codex/config.toml, handed down from main/codex-models.mjs. A
  // default that disagreed with what `codex` in her terminal runs would be a
  // fleet she cannot reason about.
  it('is whatever her own Codex config names, on Codex', () => {
    expect(defaultModelFor('codex', 'gpt-5.6-sol')).toBe('gpt-5.6-sol');
    expect(engineModelLabel('codex', null, { codexModels: CODEX, codexDefault: 'gpt-5.6-sol' }))
      .toBe('GPT-5.6 Sol');
  });

  // AND ON A CODEX THAT NAMES NOTHING, THE CARD SAYS SO RATHER THAN GUESSING.
  // `codexDefaultModel` answers null for a Codex nobody has configured, and
  // main/codex-models.mjs is explicit that turning that null into the first row
  // of the offer list would print our sort order as her default. Opus would be
  // worse still: a Claude alias on a Codex card is the bug this file is about.
  it('says Codex\'s own when this Mac\'s Codex names no model', () => {
    expect(defaultModelFor('codex', null)).toBe(CODEX_OWN);
    expect(engineModelLabel('codex', null, { codexModels: CODEX, codexDefault: null }))
      .toBe("Codex's own");
    // And it is a row she can get back to, not a state she falls out of.
    expect(engineModelChoices('codex', null, { codexModels: CODEX, codexDefault: null }).map((m) => m.id))
      .toEqual(['gpt-5.6-sol', 'gpt-5.5', CODEX_OWN]);
  });

  // Nothing is written on the row while the word is the engine's own default,
  // so Codex really does decide. That is what keeps `codexThreadParamsFor` from
  // being handed a word nobody chose.
  it('sends nothing when she has not moved off that engine\'s default', () => {
    expect(engineModelPicked('claude', null)).toBe(false);
    expect(engineModelPicked('claude', 'opus')).toBe(false);
    expect(engineModelPicked('claude', 'haiku')).toBe(true);
    expect(engineModelPicked('codex', CODEX_OWN, null)).toBe(false);
    expect(engineModelPicked('codex', 'gpt-5.6-sol', 'gpt-5.6-sol')).toBe(false);
    expect(engineModelPicked('codex', 'gpt-5.5', 'gpt-5.6-sol')).toBe(true);
  });
});

describe('the card remembers one model per engine', () => {
  // Claude Code keeps the key it has always had, so a model she chose before
  // this change is still there afterwards.
  it('leaves Claude Code on the key it was already using', () => {
    expect(lastModelKey(null)).toBe(LAST_MODEL_KEY);
    expect(lastModelKey('claude')).toBe(LAST_MODEL_KEY);
    expect(lastModelKey('codex')).toBe(`${LAST_MODEL_KEY}.codex`);
  });

  it('keeps the two picks apart', () => {
    const store = fakeStore();
    writeLastModel('haiku', store, 'claude');
    writeLastModel('gpt-5.5', store, 'codex', 'gpt-5.6-sol');
    expect(readLastModel(store, 'claude')).toBe('haiku');
    expect(readLastModel(store, 'codex', 'gpt-5.6-sol')).toBe('gpt-5.5');
  });

  // THE ONE THAT MUST NOT MATCH. Remembering `haiku` and handing it to Codex
  // puts a word on the card its CLI has never heard of, and the supervisor now
  // refuses that run outright.
  it('never hands Claude Code\'s remembered model to Codex', () => {
    const store = fakeStore();
    writeLastModel('haiku', store, 'claude');
    expect(readLastModel(store, 'codex', 'gpt-5.6-sol')).toBeNull();
    expect(store.map.has(`${LAST_MODEL_KEY}.codex`)).toBe(false);
  });

  it('never hands Codex\'s remembered model to Claude Code', () => {
    const store = fakeStore();
    writeLastModel('gpt-5.5', store, 'codex', 'gpt-5.6-sol');
    expect(readLastModel(store, 'claude')).toBeNull();
    expect(readLastModel(store)).toBeNull();
  });

  // A pick that IS that engine's default is remembered as no pick, so the key
  // does not fill up with the word the card would have shown anyway.
  it('forgets a pick that is the engine\'s own default', () => {
    const store = fakeStore();
    writeLastModel('opus', store, 'claude');
    expect(store.map.has(LAST_MODEL_KEY)).toBe(false);
    writeLastModel('gpt-5.6-sol', store, 'codex', 'gpt-5.6-sol');
    expect(store.map.has(`${LAST_MODEL_KEY}.codex`)).toBe(false);
  });

  // The existing one-argument calls still mean Claude Code, so nothing that was
  // written before this change has to be edited to keep working.
  it('still answers the old one-argument call', () => {
    const store = fakeStore();
    writeLastModel('sonnet', store);
    expect(store.map.get(LAST_MODEL_KEY)).toBe('sonnet');
    expect(readLastModel(store)).toBe('sonnet');
  });
});
