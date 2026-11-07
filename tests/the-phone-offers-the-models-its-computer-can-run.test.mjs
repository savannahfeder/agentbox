// The hosted phone discarded the computer's engines and model catalog, so a
// Codex-only pairing defaulted to Opus. Exercise the settings round trip and
// the send boundary, including stale choices from another computer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneSettingsOf } from '../shared/phone-settings.mjs';
import { webSettingsModel, phoneEngines, phoneModelRefusal } from '../renderer/src/web-settings';

const codexModels = [{ id: 'gpt-test', label: 'GPT Test', levels: ['low', 'high'], defaultLevel: 'high' }];
const copy = (device, engines = ['codex']) => ({ device, updated_at: '2026-10-27T20:00:00Z', settings: phoneSettingsOf({ ok: true, workspace: {
  engine: engines[0], engineChoices: engines.map(id => ({ id })), codexModels,
  codexModelDefault: 'gpt-test', claudeModels: [{ id: 'opus', label: 'Opus', model: 'claude-opus-test' }],
} }, {}) });

describe('the computer model catalog reaches the phone', () => {
  it('puts a deadline on the requests the catalog waits for', () => {
    const bridge = fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8');
    expect(bridge).toContain('fetch(u, { ...i, signal: AbortSignal.timeout(15_000) })');
  });
  it('carries only the model fields the picker reads', () => {
    const w = copy('a').settings.workspace;
    expect(w).toMatchObject({ engine: 'codex', codexModels, codexModelDefault: 'gpt-test' });
    expect(w.claudeModels).toEqual([{ id: 'opus', label: 'Opus', model: 'claude-opus-test' }]);
  });
  it('answers the app settings read with the same catalog', () => {
    expect(webSettingsModel([copy('a')], [], []).workspace).toMatchObject({ codexModels, codexModelDefault: 'gpt-test' });
  });
  it('leaves an unshared computer out of the model catalog', () => {
    const other = copy('b', ['claude']);
    other.updated_at = '2026-10-28T20:00:00Z';
    other.settings.workspace.codexModels = [{ id: 'other-gpt', label: 'Other GPT' }];
    const out = webSettingsModel([copy('a'), other], [], [], [{ device: 'a' }]);
    expect(out.workspace.codexModels).toEqual(codexModels);
  });
  it.each([[['codex']], [['claude']], [['claude', 'codex']]])('keeps the computer choices %j', (engines) => {
    const out = phoneEngines([copy('a', engines)], [{ device: 'a' }], []);
    expect(out.choices.map(e => e.id)).toEqual(engines);
    expect(out.workspace).toBe(engines[0]);
  });
  it('resolves each thread against its own computer', () => {
    const out = phoneEngines([copy('aaaaaaaaaaaa'), copy('bbbbbbbbbbbb', ['claude'])], [{ device: 'aaaaaaaaaaaa' }, { device: 'bbbbbbbbbbbb' }], [
      { id: 'one', product: 'p@aaaaaaaaaaaa' }, { id: 'two', product: 'p@bbbbbbbbbbbb' },
    ]);
    expect(out.byItem).toMatchObject({ one: 'codex', two: 'claude' });
  });
});

describe('stale phone model choices stop before send', () => {
  it('names Claude when Opus is sent to a Codex-only computer', () => {
    expect(phoneModelRefusal(copy('a').settings.workspace, { model: 'opus' })).toMatch(/Claude.*not available/);
  });
  it('accepts an offered Codex model and its own default', () => {
    const w = copy('a').settings.workspace;
    expect(phoneModelRefusal(w, { model: 'gpt-test' })).toBeNull();
    expect(phoneModelRefusal(w, { model: null })).toBeNull();
  });
  it('does not accept a Codex model on a Claude-only computer', () => {
    expect(phoneModelRefusal(copy('b', ['claude']).settings.workspace, { engine: 'codex', model: 'gpt-test' })).toMatch(/Codex.*not available/);
    expect(phoneModelRefusal(copy('b', ['claude']).settings.workspace, { model: 'gpt-test' })).toMatch(/Codex.*not available/);
  });
  it('does not send a model to the other agent when both agents are installed', () => {
    const w = copy('b', ['claude', 'codex']).settings.workspace;
    expect(phoneModelRefusal(w, { engine: 'codex', model: 'opus' })).toMatch(/Claude.*not available/);
    expect(phoneModelRefusal(w, { engine: 'claude', model: 'gpt-test' })).toMatch(/Codex.*not available/);
  });
  it('does not pretend to know an older computer catalog', () => {
    expect(phoneModelRefusal(null, { model: 'opus' })).toMatch(/settings/);
  });
});
