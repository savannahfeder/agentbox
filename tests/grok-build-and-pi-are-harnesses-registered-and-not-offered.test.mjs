// GROK BUILD AND PI, AS HARNESSES (docs/harnesses.md). The same shape OpenCode
// set: each is its own adapter module and a row of data, registered so anything
// that asks for it by name gets the real adapter, and not admitted, so no row
// can choose it and no picker draws it until somebody turns that on.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const spawns = vi.hoisted(() => []);
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    spawn: (bin, args, options) => {
      spawns.push({ bin, args, options });
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      return child;
    },
  };
});

import { harnessFor, supportsHarnessOperation, HARNESS_OPERATIONS } from '../main/harnesses.mjs';
import { harnessDefinition } from '../shared/harness-definitions.mjs';
import { ENGINES, ENGINE_IDS, DEFAULT_ENGINE, isEngine, engineFor } from '../shared/engines.mjs';
import { piExtensionFile } from '../main/harnesses/pi.mjs';

const root = path.join(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const temp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function sup({ ask, grokHome = temp('grok-home-') } = {}) {
  return {
    appDir: '/app',
    config: { storeRoot: temp('store-'), accountId: 'acct', grokBin: '/bin/grok', piBin: '/bin/pi', piNodeDir: '/node/bin', grokHome, grokAsk: ask, piAsk: ask },
  };
}
const item = { id: 'w-1', product: 'proj' };
// What the supervisor's plan holds for a Claude-shaped run (spawnPlan).
const plan = {
  args: ['-p', 'do it', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--mcp-config', '{}', '--model', 'x'],
  prompt: 'do it', system: 'be brief', resumeId: null, model: 'grok-code-fast', effort: 'high',
};

beforeEach(() => { spawns.length = 0; });

describe.each(['grok', 'pi'])('%s is a registered harness', (id) => {
  it('answers every named operation and is frozen', () => {
    const harness = harnessFor(id);
    for (const name of HARNESS_OPERATIONS) expect(typeof harness[name]).toBe('function');
    expect(Object.isFrozen(harness)).toBe(true);
    expect(harness.id).toBe(id);
  });

  it('is registered without being offered to anybody', () => {
    expect(harnessDefinition(id).admitted).toBe(false);
    expect(ENGINE_IDS).not.toContain(id);
    expect(ENGINES.map(e => e.id)).toEqual(['claude', 'codex']);
    expect(isEngine(id)).toBe(false);
    expect(engineFor({ engine: id }, { found: { claude: '/claude', [id]: `/${id}` } })).toBe(DEFAULT_ENGINE);
  });

  it('declares what it has not got rather than faking it', () => {
    const { capabilities } = harnessDefinition(id);
    expect(capabilities.remoteControl).toBe(false);
    expect(supportsHarnessOperation(id, 'attachInput')).toBe(false);
    expect(capabilities.fork).toBe(false);
    expect(capabilities.planLimits).toBe(false);
    expect(harnessFor(id).usage()).toEqual({ supported: false, engine: id, capability: 'usage' });
    expect(capabilities.forwardsUnknownCommands).toBe(true);
  });

  it('has one sign-in of its own and an account key of its own', () => {
    expect(harnessFor(id).profiles()).toEqual(['default']);
    expect(harnessFor(id).accountKey('default')).toBe(`${id}:default`);
    expect(harnessFor(id).tooling('default')).toBe(null);
  });

  it('never hands the worker a key Agentbox inherited', () => {
    const env = harnessFor(id).workerEnv({ PATH: '/bin', ANTHROPIC_API_KEY: 'a', CLAUDE_CONFIG_DIR: '/c', XAI_API_KEY: 'x', GROK_API_KEY: 'g' });
    expect(env).toEqual({ PATH: '/bin' });
  });
});

describe('a Grok Build run', () => {
  it('runs grok with only the flags grok takes, the prompt on the command line and nothing on stdin', () => {
    harnessFor('grok').spawn(sup({ ask: 'never' }), plan, { cwd: '/work', item, profile: 'default', env: { PATH: '/bin' } });
    const [run] = spawns;
    expect(run.bin).toBe('/bin/grok');
    expect(run.args).toContain('streaming-messages-json');
    expect(run.args).not.toContain('--verbose');
    expect(run.args).not.toContain('--mcp-config');
    expect(run.args).toEqual(expect.arrayContaining(['--model', 'grok-code-fast', '--effort', 'high']));
    expect(run.options.stdio[0]).toBe('ignore');
    expect(run.options.cwd).toBe('/work');
    expect(run.options.env).toMatchObject({ STORE_ACCOUNT_ID: 'acct', ZERO_PRODUCT: 'proj', ZERO_ITEM: 'w-1' });
    expect(run.options.env.AGENTBOX_ASK).toBeUndefined();
  });

  it('puts its approval hook in place and hands the run what the card helper needs', () => {
    const s = sup({ ask: 'risky' });
    harnessFor('grok').spawn(s, plan, { cwd: '/work', item, profile: 'default', env: {} });
    const { env } = spawns[0].options;
    expect(env).toMatchObject({ AGENTBOX_ASK: 'risky', AGENTBOX_APPROVAL_CLI: '/app/main/agent-approval-cli.mjs', ZERO_APPROVALS_DIR: path.join(s.config.storeRoot, '.approvals') });
    expect(fs.readdirSync(path.join(s.config.grokHome, 'hooks')).length).toBeGreaterThan(0);
  });

  it('is read with Claude Code\'s readers, line by line', () => {
    const child = new EventEmitter(); child.stdout = new EventEmitter();
    const got = [];
    harnessFor('grok').subscribe(child, {}, line => got.push(line));
    child.stdout.emit('data', Buffer.from('{"type":"system","subtype":"init","session_id":"s1"}\n{"type":"res'));
    child.stdout.emit('data', Buffer.from('ult","result":"done"}\n'));
    expect(got.map(l => JSON.parse(l).type)).toEqual(['system', 'result']);
    expect(harnessFor('grok').readers()).toEqual(harnessFor('claude').readers());
  });
});

describe('a pi run', () => {
  it('runs pi with its own command line, the brief last, and node on the PATH', () => {
    harnessFor('pi').spawn(sup({ ask: 'never' }), { ...plan, model: 'anthropic/claude', effort: 'max' }, { cwd: '/work', item, profile: 'default', env: { PATH: '/bin' } });
    const [run] = spawns;
    expect(run.bin).toBe('/bin/pi');
    expect(run.args.slice(0, 3)).toEqual(['-p', '--mode', 'json']);
    expect(run.args.slice(-2)).toEqual(['--', 'do it']);
    expect(run.args).toEqual(expect.arrayContaining(['--append-system-prompt', 'be brief', '--model', 'anthropic/claude', '--thinking', 'max']));
    expect(run.args).not.toContain('-e');
    expect(run.options.env.PATH).toBe(`/node/bin${path.delimiter}/bin`);
    expect(run.options.stdio[0]).toBe('ignore');
  });

  it('loads the approval extension when it asks', () => {
    harnessFor('pi').spawn(sup({ ask: 'all' }), plan, { cwd: '/work', item, profile: 'default', env: {} });
    const { args, options } = spawns[0];
    const extension = args[args.indexOf('-e') + 1];
    expect(fs.readFileSync(extension, 'utf8')).toContain('AGENTBOX_APPROVAL_CLI');
    expect(options.env.AGENTBOX_ASK).toBe('all');
    expect(piExtensionFile()).toBe(extension);
  });

  it('rewrites each pi line as the Claude Code line that means the same', () => {
    const child = new EventEmitter(); child.stdout = new EventEmitter();
    const got = [];
    const session = {};
    harnessFor('pi').subscribe(child, session, line => got.push(JSON.parse(line)));
    child.stdout.emit('data', Buffer.from('{"type":"session","id":"pi-1","cwd":"/work"}\n'));
    expect(got[0]).toMatchObject({ type: 'system', subtype: 'init', session_id: 'pi-1' });
    expect(session.piState.sessionId).toBe('pi-1');
  });
});

describe('adding them touched no existing engine branch', () => {
  it('added no vendor branch to the files the engine row counted', () => {
    const counted = [
      'main/supervisor.mjs', 'main/agent-updates.mjs', 'main/ipc.mjs', 'main/settings.mjs',
      'main/task-commands.mjs', 'main/sign-in-files.mjs', 'main/row-label.mjs', 'main/engine-setup.mjs',
    ];
    for (const file of counted) {
      const source = read(file);
      expect(source, `${file} grew a Grok branch`).not.toMatch(/['"]grok['"]/i);
      expect(source, `${file} grew a pi branch`).not.toMatch(/['"]pi['"]/);
    }
  });

  it('lives in its own files, and the shared list is data only', () => {
    for (const file of ['main/harnesses/grok.mjs', 'main/harnesses/pi.mjs', 'main/grok.mjs', 'main/pi.mjs']) {
      expect(fs.existsSync(path.join(root, file)), `${file} is missing`).toBe(true);
    }
    expect(read('shared/harness-definitions.mjs')).not.toMatch(/require\(|child_process|node:fs|node:http|fetch\(/);
  });
});
