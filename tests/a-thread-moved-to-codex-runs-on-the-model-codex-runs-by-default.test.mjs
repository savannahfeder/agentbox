// A THREAD MOVED TO CODEX RUNS ON THE MODEL CODEX RUNS BY DEFAULT.
//
// What broke (power test, 2026-10-26): a thread that had run on Claude Code
// (Opus) was carried on in Codex from the reply box, on "stub-model", the
// Codex model the picker offered. The run ended at once with "Codex could not
// use this task's model on that account's plan, so nothing has been done",
// and "restart the agent" failed the same way. A new thread on the same model
// ran fine.
//
// Measured: the picker offers the model her ~/.codex/config.toml names as
// Codex's own. The new-thread card sends no model for it, so her config.toml
// decides. The reply box writes it on the row, and `codexModelRefusal`
// checked that word against models_cache.json alone, which on that home
// (and on any home whose config.toml names a model through its own
// provider) does not list it. So the run was refused on the very model Codex
// runs whenever nothing is named, and every restart was refused again.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { troubleCause } from '../shared/spawn-trouble.mjs';

let root;

function codexHome({ own = 'stub-model', listed = ['gpt-5.5', 'gpt-5.5-mini'] } = {}) {
  const dir = path.join(root, '.codex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'models_cache.json'), JSON.stringify({
    models: listed.map((slug, i) => ({ slug, display_name: slug, visibility: 'list', priority: i, supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }] })),
  }));
  fs.writeFileSync(path.join(dir, 'config.toml'), `${own ? `model = "${own}"\n` : ''}model_provider = "stub"\n\n[model_providers.stub]\nname = "stub"\n`);
  return dir;
}

function bare(home) {
  const s = Object.create(Supervisor.prototype);
  s.config = { authProfiles: ['default'], codexHome: home, codexProfiles: ['default'], maxConcurrentSessions: 3 };
  s._profileCooldown = {};
  s._saveState = () => {};
  return s;
}

const said = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// The row as the reply box leaves it: moved to Codex, on Codex's own model.
const moved = { engine: 'codex', model: 'stub-model', prompt: 'carry on in codex' };

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-own-model-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('a reply that moves a thread to Codex on its own model', () => {
  it('starts, asking Codex for that model', () => {
    const s = bare(codexHome());
    expect(said(() => s.codexThreadParamsFor(moved, '/tmp', [], null))).toBeNull();
    expect(s.codexThreadParamsFor(moved, '/tmp', [], null).model).toBe('stub-model');
  });

  it('is not ruled out of the login whose config.toml names it', () => {
    const s = bare(codexHome());
    expect(s._planLacksModel('codex', 'default', 'stub-model')).toBe(false);
  });

  it('starts with a level picked for it', () => {
    const s = bare(codexHome());
    expect(said(() => s.codexThreadParamsFor({ ...moved, effort: 'medium' }, '/tmp', [], null))).toBeNull();
  });
});

describe('the models either side of it', () => {
  it('a model the cache lists still starts', () => {
    const s = bare(codexHome());
    expect(said(() => s.codexThreadParamsFor({ model: 'gpt-5.5' }, '/tmp', [], null))).toBeNull();
  });

  it('naming no model still lets her config.toml decide', () => {
    const s = bare(codexHome());
    expect(s.codexThreadParamsFor({ model: '' }, '/tmp', [], null).model ?? null).toBeNull();
  });
});

describe('a model nothing on this computer runs', () => {
  it('is still refused, in the words the row turns into "pick another model"', () => {
    const s = bare(codexHome());
    const words = said(() => s.codexThreadParamsFor({ model: 'gpt-9-imaginary' }, '/tmp', [], null));
    expect(words).toMatch(/not a model the Codex on this computer knows/);
    expect(troubleCause(words)).toBe('model-not-on-plan');
  });

  it('is still refused when config.toml names no model at all', () => {
    const s = bare(codexHome({ own: null }));
    expect(said(() => s.codexThreadParamsFor(moved, '/tmp', [], null))).toMatch(/not a model the Codex on this computer knows/);
  });
});
