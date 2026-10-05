// WORKERS CARRY THE MEMORY CHECK ONLY WHEN IT IS ON — w-3958c3753d.
//
// WHAT THIS GUARDS. The memory check rides into each Claude Code worker as
// hooks in the per-spawn settings file, plus four environment variables saying
// where to ask and who is asking. It ships OFF: the switch is "Hold heavy work
// when memory is short" on the Agents page, and with it off a worker must carry
// nothing at all, so this change does not touch a single agent until somebody
// turns it on.
//
// THE HOOK'S TIME LIMIT MUST SIT ABOVE THE LONGEST WAIT. Measured on Claude Code
// 2.1.289: a hook that runs past its timeout lets the command run anyway. The
// app refuses a command after `maxWaitMs` (20 minutes); the hook's limit is 30,
// so the refusal always arrives first and the timeout never decides anything.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import { DEFAULTS as GATE } from '../main/memory-gate.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const made = [];
afterEach(() => {
  for (const s of made.splice(0)) s.stopMemoryGate?.();
});

function makeSupervisor(memoryGate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-sup-'));
  const store = {
    listItems: () => [], listProducts: () => [], isDue: () => true,
    readItem: (slug, id) => (id === 'w-urgent' ? { id, product: slug, priority: 9 } : null),
  };
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, memoryGate, memoryGateSocket: path.join(tmp, 'g.sock') }, store, root, tmp, tmp);
  made.push(sup);
  return sup;
}

const item = { id: 'w-1', product: 'demo', priority: 7 };

function hooksOf(sup) {
  const file = sup.writeWorkerSettings({ dir: null }, `t-${Math.random()}`);
  const rules = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.unlinkSync(file);
  return rules.hooks;
}

describe('with the switch off', () => {
  it('a worker carries no hooks and no gate variables', () => {
    const sup = makeSupervisor(false);
    expect(hooksOf(sup)).toBeUndefined();
    expect(sup.memoryGateEnv(item)).toEqual({});
  });
});

describe('with the switch on', () => {
  it('a worker asks before every shell command and reports after, success or failure', () => {
    const sup = makeSupervisor(true);
    const hooks = hooksOf(sup);
    for (const [event, mode] of [['PreToolUse', 'pre'], ['PostToolUse', 'post'], ['PostToolUseFailure', 'post']]) {
      expect(hooks[event]).toHaveLength(1);
      expect(hooks[event][0].matcher).toBe('Bash');
      const h = hooks[event][0].hooks[0];
      expect(h.type).toBe('command');
      expect(h.command).toMatch(/memory-gate-hook\.sh' /);
      expect(h.command.endsWith(` ${mode}`)).toBe(true);
    }
  });

  it('only shell commands: reading and editing files never wait', () => {
    const hooks = hooksOf(makeSupervisor(true));
    const matchers = Object.values(hooks).flat().map((h) => h.matcher);
    expect(new Set(matchers)).toEqual(new Set(['Bash']));
  });

  it('the hook\'s own time limit is above the longest wait, so the refusal arrives first', () => {
    const pre = hooksOf(makeSupervisor(true)).PreToolUse[0].hooks[0];
    expect(pre.timeout * 1000).toBeGreaterThan(GATE.maxWaitMs + 5 * 60_000);
  });

  it('the worker is told where to ask, which task it is, and how it ranks', () => {
    const sup = makeSupervisor(true);
    const env = sup.memoryGateEnv(item);
    expect(env.AGENTBOX_GATE_SOCK).toBe(sup.config.memoryGateSocket);
    expect(env.AGENTBOX_GATE_ITEM).toBe('w-1');
    expect(env.AGENTBOX_GATE_PRODUCT).toBe('demo');
    expect(env.AGENTBOX_GATE_SCORE).toMatch(/^\d+$/);
  });

  it('the coordinator ranks the app\'s own tasks live, so raising one to urgent counts at once', () => {
    const sup = makeSupervisor(true);
    expect(sup.memoryGateScore('demo', 'w-urgent')).toBe(sup._score({ id: 'w-urgent', product: 'demo', priority: 9 }));
    expect(sup.memoryGateScore('demo', 'w-gone')).toBe(null);
  });
});

describe('turning it on and off while the app runs', () => {
  it('starts the coordinator, and stops it with its socket removed', async () => {
    const sup = makeSupervisor(false);
    await sup.setMemoryGate(true);
    expect(sup.memoryGateStatus().role).toBe('owner');
    expect(fs.statSync(sup.config.memoryGateSocket).isSocket()).toBe(true);
    await sup.setMemoryGate(false);
    expect(sup.memoryGateStatus()).toBe(null);
    expect(fs.existsSync(sup.config.memoryGateSocket)).toBe(false);
  });
});

describe('the packaged app can run the hook', () => {
  it('is unpacked from the archive, because Claude Code runs it as a file', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.build.asarUnpack).toContain('scripts/memory-gate-hook.sh');
    // And it has to be in the build at all: both file lists name scripts one by one.
    expect(pkg.build.files).toContain('scripts/memory-gate-hook.sh');
    expect(pkg.files).toContain('scripts/memory-gate-hook.sh');
  });

  it('is executable', () => {
    const mode = fs.statSync(path.join(root, 'scripts', 'memory-gate-hook.sh')).mode;
    expect(mode & 0o111).toBeTruthy();
  });
});
