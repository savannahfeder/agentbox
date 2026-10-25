// THE PHONE'S SETTINGS PASS FROZE THE WINDOW ONCE A MINUTE (2026-10-22).
//
// The spinning wheel came up for 5 to 10 seconds in a thread while its
// pictures were loading. The app's own freeze log (memory-log/freeze-*.jsonl)
// had the window's thread held every 62 to 65 seconds from launch, every time
// in one line: the login shell `main/engine-bin.mjs` runs with execFileSync to
// find Claude Code and Codex. Usually 1 to 3 s; 6.5 s, 9.3 s and 6.5 s at
// 16:02, 16:03 and 16:04 while a stress test held memory at "tight". Pictures
// are answered on that same thread (protocol.handle in main/main.mjs), so they
// waited out each freeze.
//
// The caller was the phone link: it reads the Settings model every minute
// (SETTINGS_EVERY_MS in main/phone-inbox.mjs), the model looked both engines up
// again, and the shell answer is held for only thirty seconds, so every pass
// started two shells. The phone needs only whether each engine is here, which
// the app found at launch. So that read uses what is known, and the Settings
// screen, which a person opens, still looks again.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const shells = [];
const later = [];
const loginShell = (args) => Array.isArray(args) && /^-l/.test(String(args[0]));
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    // A login shell is answered here and never started: it says it ran and
    // found nothing, so a search that asks goes through every probe.
    execFileSync: (file, args, options) => {
      if (loginShell(args)) {
        shells.push({ file, args });
        return 'agentbox-shell-reached\n';
      }
      return actual.execFileSync(file, args, options);
    },
    execFile: (file, args, options, callback) => {
      if (!loginShell(args)) return actual.execFile(file, args, options, callback);
      later.push({ file, args });
      setImmediate(() => callback(null, 'agentbox-shell-reached\n', ''));
      return { stdin: { end() {} } };
    },
  };
});

const { readSettings, lookAgainFor } = await import('../main/settings.mjs');
const { forgetClaudeBin } = await import('../main/claude-bin.mjs');
const { forgetCodexBin } = await import('../main/codex-bin.mjs');
const { resolveEngine } = await import('../main/engine-bin.mjs');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const supervisor = {
  paused: false,
  sessions: new Map(),
  status: () => ({ capacity: 3, pausedProducts: [], accountTrouble: {} }),
  readStanding: () => '',
  readWritingRules: () => '',
  readFinishing: () => '',
  readProjectInstructions: () => '',
  projectSessionArgs: () => null,
  isDriven: () => false,
  engineChoices: () => [{ id: 'claude', label: 'Claude Code', word: 'Claude Code' }],
  engineFacts: () => ({ choices: [], workspace: 'claude', byItem: {} }),
  engineChoiceOpened: () => false,
  config: {},
  engineTrouble: () => null,
  _codexHome: () => '/nonexistent-codex-home',
  _codexProfiles: () => [],
};

// What main/config.mjs found at launch on a Mac with both engines.
const both = () => ({
  accountRoot: path.join(os.tmpdir(), 'no-store', 'accounts', 'a'), storeRoot: path.join(os.tmpdir(), 'no-store'),
  appDir: os.tmpdir(), maxConcurrentSessions: 3, sessionArgs: [], authProfiles: [],
  claudeBinConfigured: null, claudeBin: '/opt/found/claude', claudeFound: true, claudeCertain: true, claudeFrom: 'shell',
  codexBinConfigured: null, codexBin: '/opt/found/codex', codexFound: true, codexCertain: true, codexFrom: 'shell',
});

const settingsOf = (config, how) => readSettings({ config, supervisor, store: { listProducts: () => [] } }, how).workspace;

beforeEach(() => {
  shells.length = 0;
  later.length = 0;
  // An answer held from an earlier read would hide whether this one asks.
  forgetClaudeBin();
  forgetCodexBin();
});

describe("the phone's read of the settings", () => {
  it('starts no login shell, with nothing held from an earlier search', () => {
    settingsOf(both(), { search: false });
    expect(shells).toEqual([]);
  });

  it('still says both engines are here, from what launch found', () => {
    const w = settingsOf(both(), { search: false });
    expect(w.claudeFound).toBe(true);
    expect(w.claudeBin).toBe('/opt/found/claude');
    expect(w.codexFound).toBe(true);
    expect(w.codex.found).toBe(true);
    expect(w.codex.bin).toBe('/opt/found/codex');
  });

  it('says Codex is not here on a Mac where launch did not find it', () => {
    const w = settingsOf({ ...both(), codexBin: null, codexFound: false, codexFrom: null }, { search: false });
    expect(w.codexFound).toBe(false);
    expect(w.codex.found).toBe(false);
    expect(w.codex.bin).toBe('');
    expect(shells).toEqual([]);
  });

  it('follows a "Check again" that found Codex after launch', () => {
    // recheckCodex moves codexBin and leaves codexFound as launch left it.
    const w = settingsOf({ ...both(), codexFound: false, codexFrom: null }, { search: false });
    expect(w.codex.found).toBe(true);
    expect(w.codexFound).toBe(true);
  });

  it('keeps a path somebody chose as chosen', () => {
    const w = settingsOf({ ...both(), claudeBinConfigured: '/opt/found/claude', claudeFrom: 'settings' }, { search: false });
    expect(w.claudeChosen).toBe(true);
    expect(w.codex.chosen).toBe(false);
  });
});

// What launch leaves held: an answer for each engine, thirty seconds and more ago.
const launched = () => {
  resolveEngine('claude', null, { now: Date.now() - 60_000 });
  resolveEngine('codex', null, { now: Date.now() - 60_000 });
  shells.length = 0;
};
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the Settings screen a person opens', () => {
  it('waits for the shell only when nothing is held, as at launch', () => {
    settingsOf(both());
    expect(shells.length).toBeGreaterThan(0);
  });

  it('once launch has an answer, looks again in the background and never waits', async () => {
    launched();
    settingsOf(both());
    expect(shells).toEqual([]);
    expect(later.length).toBeGreaterThan(0);
    await settle();
  });
});

describe('Check again, setup and the update check', () => {
  it('look again without waiting on the shell, and move the config', async () => {
    launched();
    const config = both();
    const claude = await lookAgainFor('claude', config);
    const codex = await lookAgainFor('codex', config);
    expect(shells).toEqual([]);
    expect(shells).toEqual([]);
    expect(later.length).toBeGreaterThan(0);
    // Whatever this machine has on disk, the config now says what was found.
    expect(config.codexBin).toBe(codex.found ? codex.bin : null);
    expect(config.codexCertain).toBe(codex.certain);
    if (claude.claudeFound) expect(config.claudeBin).toBe(claude.claudeBin);
  });

  it('are all wired to it, and nothing in the window\'s handlers forces a waiting look', () => {
    const ipc = read('main/ipc.mjs');
    expect(ipc).not.toMatch(/recheckClaude\(|recheckCodex\(/);
    expect(ipc).toMatch(/installation:async engine=>\{await lookAgainFor\(engine,config\)/);
    expect(ipc).toMatch(/refresh:async engine=>\{await lookAgainFor\(engine,config\)/);
    expect(ipc).toMatch(/'zero:claude-recheck', async \(\) => \{[\s\S]{0,80}await lookAgainFor\('claude', config\)/);
    expect(ipc).toMatch(/'zero:codex-recheck', async \(\) => \{[\s\S]{0,80}await lookAgainFor\('codex', config\)/);
    expect(ipc).toMatch(/claude: async \(\) => \{ const s = await lookAgainFor\('claude', config\)/);
    const setup = read('main/engine-setup.mjs');
    expect(setup.match(/await find\(/g)).toHaveLength(3);
  });
});

describe('the wiring', () => {
  it('the phone asks the settings channel not to search', () => {
    expect(read('main/main.mjs')).toMatch(/phoneChannels\.get\('zero:settings-read'\)\?\.\(\{ sender: null \}, \{ search: false \}\)/);
  });

  it('the settings channel hands that on', () => {
    const ipc = read('main/ipc.mjs');
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:settings-read'"), ipc.indexOf("ipcMain.handle('zero:settings-read'") + 400);
    expect(handler).toMatch(/readSettings\(\{ config, supervisor, store \}, \{ search: how\?\.search !== false \}\)/);
  });
});
