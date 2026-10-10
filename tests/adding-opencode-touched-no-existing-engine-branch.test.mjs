// THE CLAIM THE ENGINE ROW MADE, CHECKED AGAINST THE FIRST REAL HARNESS.
//
// w-380b06bf53 counted 96 `=== 'codex'` or `=== 'claude'` branch points across
// 12 files and said one interface would make the next harness one new module
// instead of an edit in all twelve. OpenCode is that next harness. This file
// is the measurement of whether the claim held, and it is written as a test so
// the answer cannot quietly stop being true when a fourth one is added.
//
// It also pins the thing that is easy to get wrong in the other direction:
// registering a harness must not OFFER it. Adding the definition alone would
// have put a third word in front of every user, because `ENGINES` is derived
// from the definitions. `admitted: false` is what holds that, and the whole
// point of this file is that both halves are checked at once.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { harnessFor, supportsHarnessOperation, HARNESS_OPERATIONS } from '../main/harnesses.mjs';
import { harnessDefinition, HARNESS_DEFINITIONS } from '../shared/harness-definitions.mjs';
import { ENGINES, ENGINE_IDS, DEFAULT_ENGINE, isEngine, engineFor } from '../shared/engines.mjs';

const root = path.join(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('adding OpenCode touched no existing engine branch', () => {
  it('is a registered harness with every named operation answered', () => {
    const harness = harnessFor('opencode');
    for (const name of HARNESS_OPERATIONS) expect(typeof harness[name]).toBe('function');
    expect(Object.isFrozen(harness)).toBe(true);
    expect(harness.id).toBe('opencode');
    expect(harness.label).toBe('OpenCode');
  });

  it('declares the plan limit missing instead of reporting it as zero', () => {
    // There is no endpoint on the server and no CLI command that says what is
    // left of anything: OpenCode bills through whichever provider the user
    // connected and does not know. docs/harnesses.md forbids faking it.
    expect(supportsHarnessOperation('opencode', 'usage')).toBe(false);
    expect(harnessFor('opencode').usage()).toEqual({ supported: false, engine: 'opencode', capability: 'usage' });
    expect(harnessDefinition('opencode').capabilities.planLimits).toBe(false);
  });

  it('declares the capabilities it has not got rather than being special-cased', () => {
    const { capabilities } = harnessDefinition('opencode');
    // `/tui/append-prompt` exists but drives the terminal UI, not a headless
    // run, so typing into a live OpenCode run is not offered.
    expect(capabilities.remoteControl).toBe(false);
    expect(supportsHarnessOperation('opencode', 'attachInput')).toBe(false);
    expect(capabilities.nativeReview).toBe(false);
    expect(capabilities.claudeEffort).toBe(false);
    expect(harnessFor('opencode').effortLevels()).toEqual({ supported: false, engine: 'opencode', capability: 'effortLevels' });
    // And the ones it does have, each measured against the real server.
    expect(capabilities.nativeCommands).toBe(true);   // GET /command, POST /session/:id/command
    expect(capabilities.fork).toBe(true);             // POST /session/:id/fork
  });

  it('is registered without being offered to anybody', () => {
    expect(harnessDefinition('opencode').admitted).toBe(false);
    expect(ENGINE_IDS).not.toContain('opencode');
    expect(ENGINES.map(e => e.id)).toEqual(['claude', 'codex']);
    expect(isEngine('opencode')).toBe(false);
    // A row that names it still runs on the default rather than dying, which
    // is the same fallback a row naming a missing binary already gets.
    expect(engineFor({ engine: 'opencode' }, { found: { claude: '/claude', opencode: '/opencode' } })).toBe(DEFAULT_ENGINE);
  });

  it('keeps Claude the default and leaves the other two exactly as they were', () => {
    expect(DEFAULT_ENGINE).toBe('claude');
    expect(harnessFor().id).toBe('claude');
    expect(harnessDefinition('claude').admitted).toBeUndefined();
    expect(harnessDefinition('codex').admitted).toBeUndefined();
    expect(harnessFor('claude').accountKey('default')).toBe('default');
    expect(harnessFor('codex').accountKey('default')).toBe('codex:default');
  });

  it('added no new vendor branch to the files the engine row counted', () => {
    // The twelve files the proposal named. A `=== 'opencode'` or an
    // `opencode` branch in any of them would mean the seam did not hold and
    // the next harness will cost twelve edits again.
    const counted = [
      'main/supervisor.mjs', 'main/agent-updates.mjs', 'main/ipc.mjs', 'main/settings.mjs',
      'main/task-commands.mjs', 'main/sign-in-files.mjs', 'main/row-label.mjs', 'main/engine-setup.mjs',
    ];
    for (const file of counted) {
      const source = read(file);
      expect(source, `${file} grew an OpenCode branch`).not.toMatch(/['"]opencode['"]/i);
      expect(source, `${file} names OpenCode`).not.toMatch(/openCode[A-Z]/);
    }
  });

  it('lives in its own files, and the shared list is data only', () => {
    for (const file of ['main/harnesses/opencode.mjs', 'main/opencode.mjs', 'main/opencode-server.mjs']) {
      expect(fs.existsSync(path.join(root, file)), `${file} is missing`).toBe(true);
    }
    // The renderer-safe definitions file must stay free of processes, keys and
    // transports, which is the promise written at the top of it.
    const definitions = read('shared/harness-definitions.mjs');
    expect(definitions).not.toMatch(/require\(|child_process|node:fs|node:http|fetch\(/);
    expect(HARNESS_DEFINITIONS).toHaveLength(3);
    expect(Object.isFrozen(harnessDefinition('opencode'))).toBe(true);
  });

  it('never passes the flag that would approve everything by itself', () => {
    // `opencode run --auto` auto-approves every permission not explicitly
    // denied. Measured 2026-10-07: without it, `opencode run` AUTO-REJECTS
    // instead ("permission requested: bash (...); auto-rejecting"), so the CLI
    // can only approve everything or refuse everything. Neither is a card,
    // which is why the harness drives the server and why this flag must never
    // appear anywhere in it.
    for (const file of ['main/harnesses/opencode.mjs', 'main/opencode.mjs', 'main/opencode-server.mjs']) {
      const source = read(file);
      const code = source.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
      expect(code, `${file} passes --auto`).not.toMatch(/--auto\b/);
    }
    expect(harnessFor('opencode').smallModelArgs('say hi', 'opencode/big-pickle'))
      .toEqual(['run', '--format', 'json', '--model', 'opencode/big-pickle', 'say hi']);
  });
});
