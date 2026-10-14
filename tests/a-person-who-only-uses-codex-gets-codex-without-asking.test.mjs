// A PERSON WHO ONLY USES CODEX GETS CODEX, WITHOUT ASKING (w-d5d632e503).
//
// A tester who pays for ChatGPT and not Claude opened Settings and found no
// Codex page at all: Agents listed Claude Code, Running and Instructions, and
// nothing anywhere offered Codex. Read off the tree at 75540d6, 2026-10-06,
// three things each had to go right and none did:
//
//   - The Codex page was drawn only once `engineChoice` was written into
//     zero.config.json, and the app wrote it only on an install with no config
//     file at all. Any install older than that never got it.
//   - A Mac counted as "Claude Code is here" whenever a `claude` binary was
//     found, including the copy the Claude desktop app keeps, signed in or
//     not. So Codex was never the engine a task ran on unless Claude Code was
//     entirely absent.
//   - The Codex finder did not look inside the Codex desktop app.
//
// The founder's words: the Codex page "should show up regardless", and Codex
// "should have worked OOB".
//
// THE AUGUST ROWS STAY WHERE THEY ARE. Opening the choice writes NOW as the
// moment, so a row marked `codex` before it is still stale and still runs on
// Claude Code (the last block holds that). `"engineChoice": false` written by
// hand keeps the choice shut.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../main/config.mjs';
import { readSettings, recheckCodex } from '../main/settings.mjs';
import { forgetCodexBin, appCopyPaths } from '../main/codex-bin.mjs';
import { createEngineSetup } from '../main/engine-setup.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { engineChoiceSince, engineChoiceOnRowIsStale } from '../shared/engines.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const tmp = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `codex-only-${tag}-`));
const realFile = (name = 'codex') => {
  const file = path.join(tmp('bin'), name);
  fs.writeFileSync(file, '#!/bin/sh\n');
  return file;
};
const MISSING = '/nonexistent/codex/codex';
const saved = (d) => JSON.parse(fs.readFileSync(path.join(d, 'zero.config.json'), 'utf8'));
const withConfig = (contents) => {
  const d = tmp('config');
  fs.writeFileSync(path.join(d, 'zero.config.json'), JSON.stringify({ accountId: 'existing', ...contents }));
  return d;
};

const emptyStore = { listItems: () => [], listProducts: () => [], isDue: () => true };
const supervisor = (overrides) => {
  const dir = tmp('sup');
  return new Supervisor({
    home: '/nonexistent-home', storeRoot: dir, accountRoot: dir, appDir: dir,
    claudeBin: '/nonexistent/claude', maxConcurrentSessions: 3, authProfiles: ['default'],
    sessionArgs: [], ...overrides,
  }, emptyStore, dir);
};
const payload = (overrides) => {
  const sup = supervisor(overrides);
  return readSettings({ config: sup.config, supervisor: sup, store: emptyStore }).workspace;
};

beforeEach(() => { forgetCodexBin(); });

/* ========================= the Settings page =========================== */

describe('the Codex page in Settings', () => {
  it('is on the payload with no opt-in written, when Codex is here', () => {
    const w = payload({ codexBin: realFile(), codexBinConfigured: realFile() });
    expect(w.codex).toMatchObject({ found: true });
  });

  it('is on the payload when Codex is not on this Mac, saying so', () => {
    const w = payload({ codexBinConfigured: MISSING, codexBin: null });
    expect(w.codex).toMatchObject({ found: false, bin: '' });
  });

  it('is in the menu on every Mac, so the screen draws it whatever main says', () => {
    const settings = read('renderer/src/components/Settings.tsx');
    expect(settings).not.toContain("p.id !== 'codex' || !!w?.codex");
    expect(settings).not.toContain("if (pane === 'codex' && w && !w.codex) setPane('claude')");
  });
});

/* ===================== the choice opens by itself ====================== */

describe('an install that already has a config', () => {
  it('opens the Codex choice from now when Codex is found', () => {
    const d = withConfig({ codexBin: realFile() });
    const before = Date.now();
    const config = loadConfig(d, { home: d });
    const at = engineChoiceSince(config);
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(engineChoiceSince(saved(d))).toBe(at);
    expect(saved(d).accountId).toBe('existing');
  });

  it('stays as it was when Codex is not found', () => {
    const d = withConfig({ codexBin: MISSING });
    expect(engineChoiceSince(loadConfig(d, { home: d }))).toBeNull();
    expect(saved(d).engineChoice).toBeUndefined();
  });

  it('keeps a choice somebody shut by hand shut', () => {
    const d = withConfig({ codexBin: realFile(), engineChoice: false });
    expect(engineChoiceSince(loadConfig(d, { home: d }))).toBeNull();
    expect(saved(d).engineChoice).toBe(false);
  });

  it('keeps a moment somebody wrote by hand', () => {
    const d = withConfig({ codexBin: realFile(), engineChoice: '2026-09-04' });
    expect(engineChoiceSince(loadConfig(d, { home: d }))).toBe(Date.parse('2026-09-04'));
  });
});

describe('Codex installed while the app is open', () => {
  it('opens the choice when Check again or the plan setup finds it', () => {
    const d = withConfig({});
    const config = { appDir: d, engineChoice: null, codexBinConfigured: realFile() };
    recheckCodex(config);
    expect(engineChoiceSince(config)).not.toBeNull();
    expect(engineChoiceSince(saved(d))).toBe(engineChoiceSince(config));
  });

  it('writes nothing when the search still finds nothing', () => {
    const d = withConfig({});
    const config = { appDir: d, engineChoice: null, codexBinConfigured: MISSING };
    recheckCodex(config);
    expect(config.engineChoice).toBeNull();
    expect(saved(d).engineChoice).toBeUndefined();
  });

  it('leaves a shut choice shut', () => {
    const d = withConfig({ engineChoice: false });
    const config = { appDir: d, engineChoice: false, codexBinConfigured: realFile() };
    recheckCodex(config);
    expect(config.engineChoice).toBe(false);
  });
});

/* ============ Claude Code on the Mac, but nobody signed into it ======== */

describe('a Mac whose Claude Code is signed out and whose Codex is signed in', () => {
  const both = { claudeFound: true, codexBin: '/nonexistent/codex', engineChoice: '2026-10-01' };

  it('runs every task on Codex and offers only Codex', () => {
    const sup = supervisor({ ...both, claudeSignedIn: false, codexSignedIn: true });
    expect(sup._engineFor({ id: 'w-1' })).toBe('codex');
    expect(sup.engineChoices().map((e) => e.id)).toEqual(['codex']);
  });

  it('keeps Claude Code when Claude Code is signed in', () => {
    const sup = supervisor({ ...both, claudeSignedIn: true, codexSignedIn: true });
    expect(sup._engineFor({ id: 'w-1' })).toBe('claude');
  });

  it('keeps Claude Code when nobody has checked yet', () => {
    const sup = supervisor({ ...both });
    expect(sup._engineFor({ id: 'w-1' })).toBe('claude');
  });

  it('keeps Claude Code when Codex is signed out too, since nothing is gained', () => {
    const sup = supervisor({ ...both, claudeSignedIn: false, codexSignedIn: false });
    expect(sup._engineFor({ id: 'w-1' })).toBe('claude');
  });

  it('moves to Codex with the choice still shut, as a Codex-only Mac already does', () => {
    const sup = supervisor({ claudeFound: true, codexBin: '/nonexistent/codex', claudeSignedIn: false, codexSignedIn: true });
    expect(sup._engineFor({ id: 'w-1' })).toBe('codex');
  });
});

describe('the sign-in check tells the app what it found', () => {
  const exiting = (code) => () => ({ exit: Promise.resolve(code), kill() {} });
  const find = () => ({ found: true, path: '/bin/x' });

  it('reports signed in and signed out', async () => {
    const said = [];
    const yes = createEngineSetup({ find, spawn: exiting(0), onSignIn: (e, v) => said.push([e, v]) });
    await yes.readiness('codex');
    const no = createEngineSetup({ find, spawn: exiting(1), onSignIn: (e, v) => said.push([e, v]) });
    await no.readiness('claude');
    expect(said).toEqual([['codex', true], ['claude', false]]);
  });

  it('reports nothing when the check never answered', async () => {
    const said = [];
    const hang = () => ({ exit: new Promise(() => {}), kill() {} });
    const setup = createEngineSetup({ find, spawn: hang, wait: () => Promise.resolve(), onSignIn: (e, v) => said.push([e, v]) });
    expect((await setup.readiness('claude')).signedIn).toBe(false);
    expect(said).toEqual([]);
  });

  it('is asked at launch and its answer lands on the config', () => {
    const ipc = read('main/ipc.mjs');
    expect(ipc).toMatch(/onSignIn: \(engine, signedIn\) => \{[\s\S]{0,120}config\[`\$\{engine\}SignedIn`\] = signedIn/);
    expect(ipc).toContain('void engineSetup.signedInNow(');
  });
});

/* ======================= the Codex desktop app ========================= */

describe('the Codex finder', () => {
  it('looks inside the Codex desktop app before ChatGPT', () => {
    const paths = appCopyPaths('/Users/stranger');
    expect(paths).toContain('/Applications/Codex.app/Contents/Resources/codex');
    expect(paths).toContain('/Users/stranger/Applications/Codex.app/Contents/Resources/codex');
  });
});

/* ===================== the August rows do not move ===================== */

describe('a row marked codex before the choice opened', () => {
  it('is still stale once the choice opens by itself', () => {
    const d = withConfig({ codexBin: realFile() });
    const config = loadConfig(d, { home: d });
    const august = { id: 'w-old', engine: 'codex', wrote: { engine: { ts: Date.parse('2026-08-26') } } };
    expect(engineChoiceOnRowIsStale(august, config)).toBe(true);
  });
});
