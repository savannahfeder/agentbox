// CODEX IS OFFERED IN "TO" ON THE PHONE AND THE WEB, WITH ITS OWN MODELS.
//
// What she reported (2026-10-27, w-24119e8784, from her phone): "on mobile/web
// my codex models are not available - only option in 'to' is Agent." Read off
// the code that day, two causes:
//
//  - The web app's snapshot said `engines: null`, so its new-thread card fell
//    back to Claude Code alone and To read "Agent". The Mac's settings copy did
//    say Codex was there (`engines: ['claude', 'codex']`), but nothing read it
//    for the card, and Codex's model list never left the Mac at all.
//  - The phone app's new-thread page drew To as the fixed word "Agent", and
//    every thread it started was sent to Claude Code (`engine: 'claude'`,
//    `engineCount: 1`), whatever the Mac had.
//
// Now the settings copy carries which agent the Mac runs by default, Codex's
// models with their levels, and its default model; the web app's snapshot and
// the phone app's page both read them, and a Mac with one agent reads exactly
// as before.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneSettingsOf } from '../shared/phone-settings.mjs';
import { computerAgents, webEngines, codexFromSettings } from '../renderer/src/web-settings';
import { agentChoices } from '../renderer/src/threads/composer-rules';
import { newThreadChoices, openingFor } from '../mobile/src/lib/compose';

const CODEX_MODELS = [
  { id: 'gpt-5.5', label: 'GPT-5.5', levels: ['low', 'medium', 'high'], defaultLevel: 'medium' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', levels: ['low', 'medium', 'high', 'xhigh'], defaultLevel: 'high' },
];
const model = (workspace = {}) => ({
  ok: true,
  workspace: {
    engine: 'codex', engineChoices: [{ id: 'claude' }, { id: 'codex' }], codex: { found: true, accounts: [] },
    codexModels: CODEX_MODELS, codexModelDefault: 'gpt-5.5', accounts: [], ...workspace,
  },
  projects: [],
});
const row = (settings) => ({ device: 'a1b2c3d4e5f6', name: 'Mac', updated_at: '2026-10-27T18:00:00Z', settings });
const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe('the Mac\'s settings copy', () => {
  it('carries its default agent, Codex\'s models with their levels, and Codex\'s default model', () => {
    const w = phoneSettingsOf(model(), { version: '1' }).workspace;
    expect(w.engines).toEqual(['claude', 'codex']);
    expect(w.engine).toBe('codex');
    expect(w.codexModels).toEqual(CODEX_MODELS);
    expect(w.codexModelDefault).toBe('gpt-5.5');
  });

  it('a Mac with one agent carries no Codex models', () => {
    const w = phoneSettingsOf(model({ engine: 'claude', engineChoices: [{ id: 'claude' }], codexModels: [], codexModelDefault: null }), { version: '1' }).workspace;
    expect(w.engines).toEqual(['claude']);
    expect(w.codexModels).toEqual([]);
    expect(w.codexModelDefault).toBe(null);
  });

  it('drops a model row that is not one', () => {
    const w = phoneSettingsOf(model({ codexModels: [...CODEX_MODELS, { label: 'no id' }, null] }), { version: '1' }).workspace;
    expect(w.codexModels.map((m) => m.id)).toEqual(['gpt-5.5', 'gpt-6-astra']);
  });
});

describe('the web app and the phone app read it', () => {
  const copy = phoneSettingsOf(model(), { version: '1' });

  it('the case she reported: a Mac with Codex offers Claude Code and Codex in To', () => {
    const agents = computerAgents(row(copy));
    expect(agentChoices(agents.engines).map((e) => e.label)).toEqual(['Claude Code', 'Codex']);
    expect(agents.codexModels.map((m) => m.id)).toEqual(['gpt-5.5', 'gpt-6-astra']);
    expect(agents.codexDefault).toBe('gpt-5.5');
    expect(webEngines(row(copy))).toMatchObject({ choices: [{ id: 'claude' }, { id: 'codex' }], workspace: 'codex', byItem: {} });
  });

  it('a Mac with one agent offers nothing new: To still reads Agent', () => {
    const one = phoneSettingsOf(model({ engine: 'claude', engineChoices: [{ id: 'claude' }], codexModels: [], codexModelDefault: null }), { version: '1' });
    expect(agentChoices(computerAgents(row(one)).engines)).toEqual([]);
  });

  it('no copy yet, or one from an older Mac, offers Claude Code alone', () => {
    expect(agentChoices(computerAgents(null).engines)).toEqual([]);
    expect(webEngines(null)).toBe(null);
    expect(computerAgents(row({ workspace: { engines: ['claude', 'codex'] } })).codexModels).toEqual([]);
  });

  it('the web app\'s model list falls back to the copy, since it has no desktop model', () => {
    expect(codexFromSettings({ workspace: null, computer: row(copy) })).toEqual({ models: CODEX_MODELS, defaultModel: 'gpt-5.5' });
    expect(codexFromSettings({ workspace: { codexModels: [CODEX_MODELS[0]], codexModelDefault: null } })).toEqual({ models: [CODEX_MODELS[0]], defaultModel: null });
    expect(codexFromSettings({ workspace: null })).toEqual({ models: null, defaultModel: null });
  });

  it('the web app\'s snapshot carries the agents', () => {
    expect(fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8')).toMatch(/engines: phoneEngines\(settingsRows, rows\.projects, view\.items\)/);
  });
});

describe('a new thread sent from the phone app', () => {
  it('to Codex names Codex and the model picked', () => {
    expect(newThreadChoices({ priority: null, engine: 'codex', model: 'gpt-6-astra', effort: 'xhigh', engineCount: 2, codexModels: CODEX_MODELS, codexDefault: 'gpt-5.5' }))
      .toEqual({ engine: 'codex', model: 'gpt-6-astra', effort: 'xhigh' });
  });

  it('to Codex on its default model names no model, so her own Codex decides', () => {
    expect(newThreadChoices({ priority: null, engine: 'codex', model: 'gpt-5.5', effort: null, engineCount: 2, codexModels: CODEX_MODELS, codexDefault: 'gpt-5.5' }))
      .toEqual({ engine: 'codex' });
  });

  it('a level the Codex model does not take is not sent', () => {
    expect(newThreadChoices({ priority: null, engine: 'codex', model: 'gpt-5.5', effort: 'xhigh', engineCount: 2, codexModels: CODEX_MODELS, codexDefault: null }))
      .toEqual({ engine: 'codex', model: 'gpt-5.5' });
  });

  it('to Claude Code on a Mac with one agent is sent exactly as before', () => {
    expect(newThreadChoices({ priority: null, model: 'opus', effort: 'high' })).toEqual({ model: 'opus', effort: 'high' });
  });

  it('to Claude Code on a Mac with both names Claude Code', () => {
    expect(newThreadChoices({ priority: null, engine: 'claude', model: 'opus', effort: null, engineCount: 2 })).toEqual({ engine: 'claude', model: 'opus' });
  });

  it('opens on the model and level last picked for that agent, each kept apart', () => {
    const store = memory({ 'zero.lastModel': 'sonnet', 'zero.lastModel.codex': 'gpt-6-astra', 'zero.lastEffort.codex': 'xhigh' });
    expect(openingFor(store, 'claude', null)).toEqual({ model: 'sonnet', effort: null });
    expect(openingFor(store, 'codex', 'gpt-5.5')).toEqual({ model: 'gpt-6-astra', effort: 'xhigh' });
    expect(openingFor(memory(), 'codex', 'gpt-5.5')).toEqual({ model: 'gpt-5.5', effort: null });
  });

  it('the page offers To as a choice and sends the agent picked', () => {
    // The page and the empty inbox both wear this form (mobile/src/ui/NewThreadForm.tsx).
    const src = fs.readFileSync(new URL('../mobile/src/ui/NewThreadForm.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/<Field label="To"><T style=\{\{ fontSize: 15 \}\}>Agent<\/T><\/Field>/);
    expect(src).toMatch(/agentChoices\(agents\.engines\)/);
    expect(src).toMatch(/newThreadChoices\(\{[^}]*engine/);
  });
});
