// The settings screen writes her own config file, so the two ways it could go
// wrong are the two things pinned here.
//
// One: a preset must never drop a grant she is not editing. "What sessions may
// do" is three words over a flag list that also carries the model and a day's
// worth of git grants (CLAUDE.md: capability grants belong in sessionArgs and
// nowhere else), and a preset built from a hardcoded list would silently throw
// them away the first time she touched the control.
//
// Two: a write must merge into what is on disk NOW, not into what this process
// read at boot. Several sessions edit this repo at once, and a whole-object
// overwrite from stale memory is how an unrelated key quietly reverts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig } from '../main/config.mjs';
import { outsideAgentsMode, parseSessionArgs, permissionMode, buildSessionArgs, readSettings, setModelArg, setProjectSetting, setWorkspaceSetting } from '../main/settings.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { machineSlots } from '../main/machine.mjs';

// A real supervisor over an empty store, for the one assertion that has to go
// through the screen's own reader rather than through the config object: what
// the switch is drawn at before anybody has touched it.
const emptyStore = { listItems: () => [], listProducts: () => [], isDue: () => true };
const screen = (config) => readSettings({
  config,
  supervisor: new Supervisor(config, emptyStore, appDir),
  store: emptyStore,
}).workspace;

const HERS = [
  '--model', 'claude-opus-5',
  '--allowedTools', 'mcp__agentbox', 'Bash(git fetch:*)', 'Bash(git push:*)', 'Bash(git merge:*)',
  '--permission-mode', 'bypassPermissions',
];

let appDir;
const configFile = () => path.join(appDir, 'zero.config.json');
const onDisk = () => JSON.parse(fs.readFileSync(configFile(), 'utf8'));

beforeEach(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-settings-'));
  fs.writeFileSync(configFile(), JSON.stringify({
    storeRoot: '/tmp/store',
    maxConcurrentSessions: 3,
    sessionArgs: HERS,
    autonomousProducts: ['cascade'],
    personalProducts: ['personal'],
    authProfiles: ['default', '/Users/x/.claude-second'],
  }, null, 2));
});
afterEach(() => { fs.rmSync(appDir, { recursive: true, force: true }); });

describe('reading what her flags mean', () => {
  // CLAUDE CODE'S OWN VALUES, NOT NAMES OF OURS. These are read straight off
  // the flag, so the mode the screen prints and the mode the CLI is running are
  // the same string.
  it('names every one of Claude Code\'s six', () => {
    expect(permissionMode(HERS)).toBe('bypassPermissions');
    expect(permissionMode(['--permission-mode', 'acceptEdits'])).toBe('acceptEdits');
    expect(permissionMode(['--permission-mode', 'plan'])).toBe('plan');
    expect(permissionMode(['--permission-mode', 'auto'])).toBe('auto');
    expect(permissionMode(['--permission-mode', 'dontAsk'])).toBe('dontAsk');
    expect(permissionMode(['--permission-mode', 'default'])).toBe('default');
  });

  // The CLI takes `manual` and the config file takes `default`, and they are
  // one mode. Reading them back as two would put the same fleet in two places
  // on the settings screen.
  it('folds the CLI\'s manual alias onto default, which is the config value', () => {
    expect(permissionMode(['--permission-mode', 'manual'])).toBe('default');
  });

  // Custom is a real answer, never rounded to the nearest mode: a screen
  // saying "Accept edits" over grants that are not that is a screen lying about
  // the fleet.
  it('says custom rather than guessing', () => {
    expect(permissionMode(['--allowedTools', 'Bash'])).toBe('custom');
    expect(permissionMode(['--permission-mode', 'somethingElse'])).toBe('custom');
    expect(permissionMode([])).toBe('custom');
  });

  it('reads --allowedTools as variadic, up to the next flag', () => {
    expect(parseSessionArgs(HERS).allowedTools).toEqual(['mcp__agentbox', 'Bash(git fetch:*)', 'Bash(git push:*)', 'Bash(git merge:*)']);
    expect(parseSessionArgs(HERS).model).toBe('claude-opus-5');
  });
});

describe('changing what sessions may do', () => {
  it('keeps the model and the git grants when she narrows to accept edits', () => {
    const next = buildSessionArgs(HERS, 'acceptEdits');
    expect(next).toContain('claude-opus-5');
    expect(next).toContain('Bash(git push:*)');
    expect(next).toContain('acceptEdits');
    expect(next).not.toContain('bypassPermissions');
  });

  it('is reversible: bypass to accept edits and back is the same grants', () => {
    const there = buildSessionArgs(HERS, 'acceptEdits');
    const back = buildSessionArgs(there, 'bypassPermissions');
    expect(back).toEqual(HERS);
  });

  // A PERMISSION MODE NEVER TOUCHES HER TOOL GRANTS ANY MORE, and that is a
  // change. The old 'read' shape stripped --allowedTools down to the store
  // tools, which meant picking a mode quietly rewrote a list that took her a
  // day to get right and that a permission mode has nothing to do with. Claude
  // Code's own read-only mode is `plan`, and it needs no help from us.
  it('carries every grant through, whichever mode is picked', () => {
    for (const mode of ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']) {
      const next = buildSessionArgs(HERS, mode);
      expect(next, mode).toContain('claude-opus-5');
      expect(next, mode).toContain('mcp__agentbox');
      expect(next, mode).toContain('Bash(git push:*)');
      expect(next.join(' '), mode).toContain(`--permission-mode ${mode}`);
    }
  });

  // Every mode writes ONE flag, never two, or the CLI takes the last one and
  // the screen is describing a session that is not running.
  it('never leaves two permission flags behind', () => {
    const next = buildSessionArgs(buildSessionArgs(HERS, 'plan'), 'auto');
    expect(next.filter((a) => a === '--permission-mode')).toHaveLength(1);
    expect(next).toContain('auto');
    expect(next).not.toContain('plan');
  });

  // EVERY WAY THE CLI CAN ALREADY BE IN A MODE, not just the form we write.
  // Caught in review 2026-08-23: the parser knew only `--permission-mode VALUE`,
  // so the equals form and the bypass shorthand were carried through as unknown
  // flags and appended AFTER the mode the screen had just chosen. The CLI takes
  // the last one. Picking Plan over a config holding
  // --dangerously-skip-permissions gave a session running in bypass under a
  // screen that said Plan.
  it('reads the equals form and the bypass shorthand as modes', () => {
    expect(parseSessionArgs(['--permission-mode=plan']).permissionMode).toBe('plan');
    expect(parseSessionArgs(['--dangerously-skip-permissions']).permissionMode).toBe('bypassPermissions');
    expect(permissionMode(['--dangerously-skip-permissions'])).toBe('bypassPermissions');
    expect(permissionMode(['--permission-mode=manual'])).toBe('default');
  });

  // --allow-dangerously-skip-permissions is NOT a mode: Anthropic says it "adds
  // the permission mode to the cycle without activating it". But a session where
  // bypass is available does not enforce plan mode's blocks, so leaving it
  // beside a deliberate pick weakens the pick, and it goes.
  it('does not read the allow-bypass flag as a mode, and still drops it on a pick', () => {
    expect(parseSessionArgs(['--allow-dangerously-skip-permissions']).permissionMode).toBe(null);
    expect(parseSessionArgs(['--allow-dangerously-skip-permissions']).allowsBypass).toBe(true);
    expect(buildSessionArgs(['--allow-dangerously-skip-permissions'], 'plan'))
      .toEqual(['--permission-mode', 'plan']);
  });

  it('leaves no other way of setting the mode behind it', () => {
    for (const base of [
      ['--dangerously-skip-permissions'],
      ['--allow-dangerously-skip-permissions'],
      ['--permission-mode=bypassPermissions'],
      ['--permission-mode=junk'],
      ['--permission-mode', 'auto', '--dangerously-skip-permissions'],
    ]) {
      const out = buildSessionArgs(base, 'plan');
      expect(out.join(' '), base.join(' ')).not.toContain('dangerously-skip');
      expect(out.join(' '), base.join(' ')).not.toContain('allow-dangerously');
      expect(out.join(' '), base.join(' ')).not.toContain('--permission-mode=');
      expect(out.filter((a) => a === '--permission-mode'), base.join(' ')).toHaveLength(1);
      expect(permissionMode(out), base.join(' ')).toBe('plan');
    }
  });

  // A mode nobody recognises is REFUSED, never silently dropped. Dropping it
  // removes the flag and adds nothing, which hands the session back to whatever
  // that Mac's own settings say, and inheriting the machine is the exact thing
  // this whole feature exists to stop.
  it('refuses a mode it does not know rather than clearing the flag', () => {
    expect(() => buildSessionArgs(HERS, 'full')).toThrow(/unknown permission mode/);
    expect(() => buildSessionArgs(HERS, 'read')).toThrow(/unknown permission mode/);
    expect(() => buildSessionArgs(HERS, undefined)).toThrow(/unknown permission mode/);
  });
});

describe('writing her file', () => {
  it('merges into what is on disk, not into what it read at boot', () => {
    const config = loadConfig(appDir);
    // Another session edits the file underneath this process.
    const raw = onDisk();
    raw.writtenByAnotherSession = 'https://example.invalid/other.git';
    fs.writeFileSync(configFile(), JSON.stringify(raw, null, 2));

    saveConfig(config, { maxConcurrentSessions: 5 });
    expect(onDisk().writtenByAnotherSession).toBe('https://example.invalid/other.git');
    expect(onDisk().maxConcurrentSessions).toBe(5);
  });

  // The running fleet reads config.* per tick, so a setting she changes has to
  // take effect now. A settings screen the app ignores until relaunch is the
  // same failure as a fix that is not running.
  it('takes effect in the running process, not at the next restart', () => {
    const config = loadConfig(appDir);
    saveConfig(config, { maxConcurrentSessions: 5 });
    expect(config.maxConcurrentSessions).toBe(5);
  });

  it('removes a key rather than writing an empty one', () => {
    const config = loadConfig(appDir);
    saveConfig(config, { projectSessionArgs: { acme: ['--allowedTools', 'mcp__agentbox'] } });
    expect(onDisk().projectSessionArgs).toBeTruthy();
    saveConfig(config, { projectSessionArgs: undefined });
    expect('projectSessionArgs' in onDisk()).toBe(false);
    expect('projectSessionArgs' in config).toBe(false);
  });

  it('never leaves a half-written config for a spawn to read', () => {
    const config = loadConfig(appDir);
    saveConfig(config, { maxConcurrentSessions: 4 });
    expect(fs.readdirSync(appDir).filter((f) => f.includes('.tmp-'))).toEqual([]);
  });
});

describe('the per-project settings, as fields on a project', () => {
  // Four of them became one switch and one override (w-d19d6d387c,
  // 2026-09-22): personal, the per-project pause and the drive are deleted.
  const supervisor = () => ({ paused: false, onChange: null });

  it('adds and removes a slug without disturbing the others', () => {
    const config = loadConfig(appDir);
    setProjectSetting({ config, supervisor: supervisor() }, { product: 'acme', key: 'autonomous', value: true });
    expect(onDisk().autonomousProducts.sort()).toEqual(['acme', 'cascade']);
    setProjectSetting({ config, supervisor: supervisor() }, { product: 'cascade', key: 'autonomous', value: false });
    expect(onDisk().autonomousProducts).toEqual(['acme']);
    // Her other keys are untouched by a write to this one.
    expect(onDisk().personalProducts).toEqual(['personal']);
  });

  // The drive was stored as an opt-out and a pause went to the supervisor
  // rather than to the file. Both are deleted (w-d19d6d387c, 2026-09-22), and
  // a write of either key is refused by the default case below.

  it('builds a per-project override from her workspace grants', () => {
    const config = loadConfig(appDir);
    setProjectSetting({ config, supervisor: supervisor() }, { product: 'acme', key: 'permission', value: 'acceptEdits' });
    expect(onDisk().projectSessionArgs.acme).toContain('acceptEdits');
    expect(onDisk().projectSessionArgs.acme).toContain('claude-opus-5');
    // Back to the workspace default is the ABSENCE of an entry, never a copy
    // of the default: a copy is a grant that stops tracking the one place
    // grants are reviewed.
    setProjectSetting({ config, supervisor: supervisor() }, { product: 'acme', key: 'permission', value: 'workspace' });
    expect('projectSessionArgs' in onDisk()).toBe(false);
  });

  // Teaching the parser `--model=x` while the writer removed only `--model x`
  // left a config carrying both, and the CLI and our own reader then disagreed
  // about which model was running. Caught in review, 2026-08-23.
  it('removes the equals form of the model too, so there is never one of each', () => {
    const out = setModelArg(['--model=claude-opus-5', '--permission-mode', 'auto'], 'claude-sonnet-5');
    expect(out.join(' ')).not.toContain('--model=');
    expect(parseSessionArgs(out).model).toBe('claude-sonnet-5');
    expect(out.filter((a) => a.startsWith('--model')).length).toBe(1);
  });

  it('refuses a permission mode it does not know, at the boundary', () => {
    const config = loadConfig(appDir);
    expect(() => setProjectSetting({ config, supervisor: supervisor() }, { product: 'acme', key: 'permission', value: 'full' }))
      .toThrow(/unknown permission mode/);
    expect(() => setWorkspaceSetting({ config, supervisor: supervisor() }, { key: 'permission', value: 'read' }))
      .toThrow(/unknown permission mode/);
    expect(onDisk().sessionArgs).toEqual(HERS);
  });

  it('refuses a setting it does not know rather than writing something', () => {
    const config = loadConfig(appDir);
    expect(() => setProjectSetting({ config, supervisor: supervisor() }, { product: 'acme', key: 'nonsense', value: true }))
      .toThrow(/unknown project setting/);
    expect(onDisk().sessionArgs).toEqual(HERS);
  });
});

// WHAT EVERY AGENT RUNS ON —, 2026-08-20.The flag was always in her config;
// nothing but a text editor could change it. The same rule as the permission
// preset applies and it is the reason this is tested at all: choosing a model
// must not drop a grant.
describe('choosing what every agent runs on', () => {
  const supervisor = () => ({ paused: false, onChange: null });

  it('swaps the model and leaves every other flag exactly as it was', () => {
    expect(setModelArg(HERS, 'claude-sonnet-5')).toEqual([
      '--model', 'claude-sonnet-5',
      '--allowedTools', 'mcp__agentbox', 'Bash(git fetch:*)', 'Bash(git push:*)', 'Bash(git merge:*)',
      '--permission-mode', 'bypassPermissions',
    ]);
    expect(permissionMode(setModelArg(HERS, 'claude-sonnet-5'))).toBe('bypassPermissions');
    expect(parseSessionArgs(setModelArg(HERS, 'claude-sonnet-5')).allowedTools)
      .toEqual(parseSessionArgs(HERS).allowedTools);
  });

  // The CLI default is a real answer, and it is the flag being ABSENT. A
  // `--model` with nothing after it is how you get a session that will not
  // start, so null removes the pair rather than writing an empty one.
  it('removes the flag entirely for the CLI default', () => {
    const out = setModelArg(HERS, null);
    expect(out).not.toContain('--model');
    expect(out[0]).toBe('--allowedTools');
    expect(permissionMode(out)).toBe('bypassPermissions');
  });

  it('sets a model on a config that never had one', () => {
    expect(setModelArg(['--allowedTools', 'mcp__agentbox'], 'claude-opus-5'))
      .toEqual(['--model', 'claude-opus-5', '--allowedTools', 'mcp__agentbox']);
  });

  it('writes it to her file, through the screen', () => {
    const config = loadConfig(appDir);
    setWorkspaceSetting({ config, supervisor: supervisor() }, { key: 'model', value: 'claude-haiku-4-5-20251001' });
    expect(parseSessionArgs(onDisk().sessionArgs).model).toBe('claude-haiku-4-5-20251001');
    expect(permissionMode(onDisk().sessionArgs)).toBe('bypassPermissions');
    // And back off again. The empty string is what the segmented control sends
    // for the CLI default, so it means the same as null.
    setWorkspaceSetting({ config, supervisor: supervisor() }, { key: 'model', value: '' });
    expect(parseSessionArgs(onDisk().sessionArgs).model).toBe(null);
    expect(parseSessionArgs(onDisk().sessionArgs).allowedTools).toEqual(parseSessionArgs(HERS).allowedTools);
  });
});

describe('the workspace settings', () => {
  const supervisor = () => ({ paused: false, onChange: null });

  it('pauses the fleet in memory, where the pause has always lived', () => {
    const config = loadConfig(appDir);
    const sup = supervisor();
    setWorkspaceSetting({ config, supervisor: sup }, { key: 'agentsRunning', value: false });
    expect(sup.paused).toBe(true);
    expect('paused' in onDisk()).toBe(false);
  });

  // THE RANGE IS THE CONTROL'S, AND THE MACHINE IS NOT IN IT (w-3d634cbc44).
  // For one round this clamped to what main thought the hardware would carry,
  // so the same write came back as a different number on a different Mac.
  it('holds sessions-at-once inside a range a person could mean', () => {
    const config = loadConfig(appDir);
    setWorkspaceSetting({ config, supervisor: supervisor() }, { key: 'sessionsAtOnce', value: 99 });
    expect(onDisk().maxConcurrentSessions).toBe(12);
    // The same answer on any machine, which is the point: the clamp cannot be
    // the hardware or this assertion would move from laptop to laptop.
    expect(onDisk().maxConcurrentSessions).not.toBe(machineSlots().slots === 12 ? -1 : machineSlots().slots);
    setWorkspaceSetting({ config, supervisor: supervisor() }, { key: 'sessionsAtOnce', value: 0 });
    expect(onDisk().maxConcurrentSessions).toBe(1);
  });

  // The drive had a master switch here. It is deleted (w-d19d6d387c).

  // HER RULE ABOUT WHEN WORK GETS ITS OWN ROW had a switch here. It is always
  // on now (w-5737fe67cf), so the screen no longer offers it and the key is
  // refused rather than written into her config.
  it('offers no switch on her subagent rule', () => {
    const config = loadConfig(appDir);
    expect('subagentRule' in screen(config)).toBe(false);
    expect(() => setWorkspaceSetting({ config, supervisor: supervisor() }, { key: 'subagentRule', value: false })).toThrow();
    expect('subagentRule' in onDisk()).toBe(false);
  });

  // HER OWN CLAUDE CODE, HOW MUCH OF IT INTERRUPTS.
  it('records which of her agents the inbox takes', () => {
    const config = loadConfig(appDir);
    setWorkspaceSetting({ config, supervisor: supervisor() }, { key: 'outsideAgents', value: 'waiting' });
    expect(onDisk().outsideAgents).toBe('waiting');
    setWorkspaceSetting({ config, supervisor: supervisor() }, { key: 'outsideAgents', value: 'off' });
    expect(onDisk().outsideAgents).toBe('off');
  });

  // A mode nothing understands would draw an inbox that silently hides her
  // agents, which is the failure this codebase cares about most. Refused at the
  // write rather than coerced at the read.
  it('refuses a mode that is not one of the three, and writes nothing', () => {
    const config = loadConfig(appDir);
    expect(() => setWorkspaceSetting({ config, supervisor: supervisor() }, { key: 'outsideAgents', value: 'some' }))
      .toThrow(/unknown agent mode/);
    expect('outsideAgents' in onDisk()).toBe(false);
  });

  // Off, since (2026-08-27): a session started in a terminal is kept
  // separate from the inbox unless somebody asks for it there.
  it('reads off on a config that has never heard of the key', () => {
    expect(outsideAgentsMode(loadConfig(appDir))).toBe('off');
    expect(outsideAgentsMode({ outsideAgents: 'nonsense' })).toBe('off');
    expect(outsideAgentsMode({ outsideAgents: 'all' })).toBe('all');
  });
});
