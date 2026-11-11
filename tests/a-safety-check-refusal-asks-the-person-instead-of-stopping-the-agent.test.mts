// A SAFETY-CHECK REFUSAL ASKS THE PERSON INSTEAD OF STOPPING THE AGENT (w-842579b9b1).
//
// Workers run Claude Code in auto mode. When its safety classifier refused a
// call, the worker got "Permission for this action was denied by the Claude
// Code auto mode classifier" and no card reached the person, so nobody could
// say yes. On one thread on 2026-11-10 that happened four times to jobs the
// person had asked for, each costing a round trip through the inbox.
//
// A refusal is a plain deny: it never reaches --permission-prompt-tool. What
// Claude Code does offer, measured on 2.1.321 in scripts/scratch with a
// headless auto-mode run told by a file to run an install script from a
// reserved, unresolvable address:
//   - the classifier refused it ("[Code from External]") and a PermissionDenied
//     hook fired with the exact call;
//   - that hook's `retry: true` made the agent try the same command again, with
//     a different `description`;
//   - a PreToolUse hook answering "ask" on the retry sent it to the
//     --permission-prompt-tool, the classifier did not decide it, and an allow
//     there ran it.
// So the refused call is noted in the run's own folder, the agent is told it
// may retry, and that one retry goes to the approval card.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Supervisor, refusalsDir } from '../main/supervisor.mts';
import { answer, approvalPublicKey, listPending, spoolDir } from '../main/approvals.mts';
import { stripTypesFlags } from '../main/strip-types.mts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER = path.join(root, 'main', 'approval-prompt-server.mts');
const HOOK = path.join(root, 'scripts', 'safety-check-hook.sh');

const made: string[] = [];
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(d);
  return d;
};

function makeSupervisor(memoryGate = false) {
  const dir = tmp('refusal-sup-');
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readItem: () => null };
  return new Supervisor({ storeRoot: dir, home: dir, codexHome: path.join(dir, '.codex'), memoryGate, memoryGateSocket: path.join(dir, 'g.sock'), memoryGateLockPort: 0 }, store, root, dir, dir);
}

interface HookGroup { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] }
type Hooks = Record<string, HookGroup[]>;

function hooksOf(sup: Supervisor, runId = `t-${Math.random()}`): Hooks {
  const file = sup.writeWorkerSettings({ dir: null } as never, runId)!;
  const rules = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.unlinkSync(file);
  made.push(refusalsDir(runId));
  return rules.hooks;
}

const ours = (groups: HookGroup[] | undefined) => (groups ?? []).flatMap((g) => g.hooks).filter((h) => h.command.includes('safety-check-hook.sh'));

function run(command: string, stdin: string): Promise<{ out: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (b) => { out += b; });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ out, code }));
    child.stdin.end(stdin);
  });
}

// One worker's two hooks, as Claude Code would call them.
function worker() {
  const hooks = hooksOf(makeSupervisor());
  const denied = ours(hooks.PermissionDenied)[0].command;
  const pre = ours(hooks.PreToolUse)[0].command;
  const call = (event: string, tool: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ session_id: 's', hook_event_name: event, permission_mode: 'auto', tool_name: tool, tool_input: input, tool_use_id: `toolu_${Math.random()}`, ...extra });
  return {
    refuse: async (tool: string, input: Record<string, unknown>, reason = '[Code from External]') => {
      const { out } = await run(denied, call('PermissionDenied', tool, input, { reason }));
      return out ? JSON.parse(out) : null;
    },
    tryAgain: async (tool: string, input: Record<string, unknown>) => {
      const { out, code } = await run(pre, call('PreToolUse', tool, input));
      expect(code).toBe(0);
      return out ? JSON.parse(out) : null;
    },
    pre,
  };
}

// Any command will do: the refusal is played, not asked of a classifier.
const REFUSED = 'git push --force origin main';
const isAsk = (o: { hookSpecificOutput?: { permissionDecision?: string } } | null) => o?.hookSpecificOutput?.permissionDecision === 'ask';

// The approval card the "ask" lands on: the worker's own approvals server, a
// card in the spool, and the person's signed answer.
function onTheCard(tool: string, input: Record<string, unknown>, allow: boolean) {
  const store = tmp('refusal-card-');
  const dir = spoolDir(store);
  fs.mkdirSync(dir, { recursive: true });
  return new Promise<{ result: { behavior: string; message?: string; updatedInput?: unknown }; shown: unknown }>((resolve, reject) => {
    const child = spawn(process.execPath, [...stripTypesFlags(), SERVER], {
      env: { ...process.env, ZERO_APPROVALS_DIR: dir, ZERO_APPROVALS_PUBKEY: approvalPublicKey(), ZERO_PRODUCT: 'p', ZERO_ITEM: 'w-1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const giveUp = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('no card was answered')); }, 25_000);
    let shown: unknown = null;
    let out = '';
    child.stdout.on('data', (b) => {
      out += b;
      if (!out.includes('\n')) return;
      clearTimeout(giveUp);
      child.kill();
      resolve({ result: JSON.parse(JSON.parse(out.split('\n')[0]).result.content[0].text), shown });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'approval_prompt', arguments: { tool_name: tool, input } } })}\n`);
    const watch = setInterval(() => {
      const pending = listPending(store);
      if (!pending.length) return;
      clearInterval(watch);
      shown = pending[0];
      answer(store, pending[0].id, allow, null);
    }, 50);
    child.on('exit', () => { clearInterval(watch); clearTimeout(giveUp); });
  });
}

describe('a refused call comes back as a card for the person', () => {
  it('the refusal tells the agent it may try again', async () => {
    const w = worker();
    expect(await w.refuse('Bash', { command: REFUSED, description: 'Run the install' }))
      .toEqual({ hookSpecificOutput: { hookEventName: 'PermissionDenied', retry: true } });
  });

  it('its retry is asked of the person, even with a new description, and the card shows the exact command', async () => {
    const w = worker();
    await w.refuse('Bash', { command: REFUSED, description: 'Run the install' });
    const retry = { command: REFUSED, description: 'Retry the install' };
    const said = await w.tryAgain('Bash', retry);
    expect(isAsk(said)).toBe(true);
    expect(said.hookSpecificOutput.permissionDecisionReason).toMatch(/\[Code from External\]/);
    const { result, shown } = await onTheCard('Bash', retry, true);
    expect((shown as { input: { command: string } }).input.command).toBe(REFUSED);
    expect(result).toEqual({ behavior: 'allow', updatedInput: retry });
  }, 40_000);

  it('a No on that card refuses the call and tells the agent so', async () => {
    const w = worker();
    await w.refuse('Bash', { command: REFUSED });
    expect(isAsk(await w.tryAgain('Bash', { command: REFUSED }))).toBe(true);
    const { result } = await onTheCard('Bash', { command: REFUSED }, false);
    expect(result.behavior).toBe('deny');
    expect(result.message).toMatch(/declined this action/);
  }, 40_000);

  it('works for a tool that is not the shell', async () => {
    const w = worker();
    const click = { action: 'click', ref: 'e12', element: 'Authorize Resend' };
    await w.refuse('mcp__browser__click', click, '[Permission Grant]');
    expect(isAsk(await w.tryAgain('mcp__browser__click', click))).toBe(true);
  });
});

describe('approving runs it once', () => {
  it('the second try of the same call is the safety check\'s again', async () => {
    const w = worker();
    await w.refuse('Bash', { command: REFUSED });
    expect(isAsk(await w.tryAgain('Bash', { command: REFUSED }))).toBe(true);
    expect(await w.tryAgain('Bash', { command: REFUSED })).toBeNull();
  });

  it('a call refused again after its card is not put to the person twice', async () => {
    const w = worker();
    await w.refuse('Bash', { command: REFUSED });
    await w.tryAgain('Bash', { command: REFUSED });
    expect(await w.refuse('Bash', { command: REFUSED })).toBeNull();
    expect(await w.tryAgain('Bash', { command: REFUSED })).toBeNull();
  });
});

describe('nothing else makes a card', () => {
  it('a call the safety check never refused is left alone', async () => {
    const w = worker();
    expect(await w.tryAgain('Bash', { command: 'git status' })).toBeNull();
  });

  it('a different call after a refusal is left alone, and the refused one still asks', async () => {
    const w = worker();
    await w.refuse('Bash', { command: REFUSED });
    expect(await w.tryAgain('Bash', { command: 'git push --force origin release' })).toBeNull();
    expect(await w.tryAgain('Bash', { command: REFUSED, timeout: 5000 })).toBeNull();
    expect(isAsk(await w.tryAgain('Bash', { command: REFUSED }))).toBe(true);
  });

  it('the same input under another tool is not the refused call', async () => {
    const w = worker();
    await w.refuse('mcp__a__run', { command: REFUSED });
    expect(await w.tryAgain('mcp__b__run', { command: REFUSED })).toBeNull();
  });

  it('one run\'s refusal never asks in another run', async () => {
    const one = worker();
    const two = worker();
    await one.refuse('Bash', { command: REFUSED });
    expect(await two.tryAgain('Bash', { command: REFUSED })).toBeNull();
  });

  it('input that is not a hook call changes nothing', async () => {
    const w = worker();
    await w.refuse('Bash', { command: REFUSED });
    const { out, code } = await run(w.pre, 'not json');
    expect(code).toBe(0);
    expect(out).toBe('');
    expect(isAsk(await w.tryAgain('Bash', { command: REFUSED }))).toBe(true);
  });

  it('with no refusal on record, every tool call passes without starting a runtime', async () => {
    const dir = tmp('refusal-fast-');
    const { out, code } = await run(`'${HOOK}' pre '${dir}' /nonexistent/runtime /nonexistent/hook.mts`, JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }));
    expect({ out, code }).toEqual({ out: '', code: 0 });
  });
});

describe('every Claude worker carries it', () => {
  it('both hooks, on every tool, pointed at the run\'s own folder', () => {
    const sup = makeSupervisor();
    const hooks = hooksOf(sup, 'run-a');
    const [denied] = ours(hooks.PermissionDenied);
    const [pre] = ours(hooks.PreToolUse);
    expect(denied.command).toContain(refusalsDir('run-a'));
    expect(pre.command).toContain(refusalsDir('run-a'));
    expect(hooks.PermissionDenied.find((g) => ours([g]).length)?.matcher).toBeUndefined();
    expect(hooks.PreToolUse.find((g) => ours([g]).length)?.matcher).toBeUndefined();
    expect(refusalsDir('run-a')).not.toBe(refusalsDir('run-b'));
    expect(Object.keys(hooks).sort()).toEqual(['PermissionDenied', 'PreToolUse']);
  });

  it('beside the memory check, not over it', () => {
    const sup = makeSupervisor(true);
    const hooks = hooksOf(sup);
    expect(ours(hooks.PreToolUse)).toHaveLength(1);
    expect(hooks.PreToolUse.flatMap((g) => g.hooks).some((h) => h.command.includes('memory-gate-hook.sh'))).toBe(true);
    sup.stopMemoryGate?.();
  });

  it('the run\'s folder goes when the run does', async () => {
    const sup = makeSupervisor();
    const spawnFiles: (string | (() => void))[] = [];
    const plan = { args: [] as string[], connectionServers: null };
    sup.prepareClaudePermissions(plan as never, { dir: null } as never, 'run-gone', spawnFiles as never);
    const w = ours(JSON.parse(fs.readFileSync(plan.args[plan.args.indexOf('--settings') + 1], 'utf8')).hooks.PermissionDenied)[0].command;
    await run(w, JSON.stringify({ tool_name: 'Bash', tool_input: { command: REFUSED }, reason: '[Code from External]' }));
    expect(fs.existsSync(refusalsDir('run-gone'))).toBe(true);
    sup.removeSpawnFiles({ spawnFiles: spawnFiles as never });
    expect(fs.existsSync(refusalsDir('run-gone'))).toBe(false);
  });

  it('the packaged app can run the hook', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const list of [pkg.build.asarUnpack, pkg.build.files, pkg.files]) expect(list).toContain('scripts/safety-check-hook.sh');
    expect(fs.statSync(HOOK).mode & 0o111).toBeTruthy();
  });
});
