// GROK BUILD AND PI STOP AND ASK ON A CARD.
//
// Neither engine can raise Agentbox's card on its own: Grok's headless run
// has no --permission-prompt-tool and pi has no permission system at all
// (main/grok.mjs, main/pi.mjs). So each hands its tool calls to one helper,
// main/agent-approval-cli.mjs -- Grok from a PreToolUse hook, pi from an
// extension -- which decides whether the call needs a card and asks through the
// same spool and signed answer Claude Code's cards use. Measured on grok
// 1.0.46, 2026-10-07: a hook that waited 8 s and then denied stopped `touch`.
//
// What has to hold: a look-only call never makes a card; a risky one makes
// exactly one and waits for it; her Allow lets it through and her No, a
// forged answer or a broken helper all stop it; and the Grok hook does
// nothing at all in a Grok session the person opened themselves.

import { describe, it, expect, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookOnlyCommand, needsAsking, readCall, askMode } from '../main/agent-approval-policy.mjs';
import { ensureGrokApprovalHook, HOOK_NAME } from '../main/grok-approvals.mjs';
import { listPending, answer, approvalPublicKey } from '../main/approvals.mjs';
import { PI_APPROVAL_EXTENSION, piArgs } from '../main/pi.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const CLI = join(here, '..', 'main', 'agent-approval-cli.mjs');
const dirs = [];
const temp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

describe('which calls get a card', () => {
  it.each([
    'ls -la', 'cat package.json', 'git status', 'git diff HEAD~1', 'git log --oneline -5', 'rg TODO src | head',
    'find . -name "*.ts"', 'sed -n 1,40p main/x.mjs', 'node --version', 'cd src && ls', 'grep -n foo a.txt 2>/dev/null',
  ])('lets a look-only command run: %s', (c) => { expect(lookOnlyCommand(c)).toBe(true); });

  // THE CASES THAT MUST NOT MATCH: each looks like reading and is not.
  it.each([
    'rm -rf build', 'git push', 'git branch -D main', 'git remote add x y', 'npm install', 'touch a',
    'ls $(rm -rf x)', 'cat `rm x`', 'echo hi > a.txt', 'ls >> log', 'find . -delete', 'find . -exec rm {} ;',
    'sed -i s/a/b/ f', 'FOO=1 ls', 'ls && rm a', 'cat a | sh', '',
  ])('asks before: %j', (c) => { expect(lookOnlyCommand(c)).toBe(false); });

  it('reads either engine\'s call under the names the card knows', () => {
    expect(readCall('grok', { tool_name: 'run_terminal_command', tool_input: { command: 'ls' }, cwd: '/w' })).toEqual({ tool: 'Bash', input: { command: 'ls' }, cwd: '/w' });
    expect(readCall('pi', { tool: 'edit', input: { path: 'a.txt' }, cwd: '/w' })).toEqual({ tool: 'Edit', input: { path: 'a.txt', file_path: 'a.txt' }, cwd: '/w' });
  });

  it('lets an edit inside the task\'s folder run and asks about one outside it', () => {
    expect(needsAsking('risky', { tool: 'Edit', input: { file_path: 'src/a.ts' }, cwd: '/w' })).toBe(false);
    expect(needsAsking('risky', { tool: 'Write', input: { file_path: '/etc/hosts' }, cwd: '/w' })).toBe(true);
    expect(needsAsking('risky', { tool: 'Edit', input: { file_path: '../other/a.ts' }, cwd: '/w' })).toBe(true);
  });

  it('does not ask about Agentbox\'s own task tools, which Claude Code workers are granted', () => {
    expect(needsAsking('all', { tool: 'agentbox__claim_work_item' }, { own: 'agentbox' })).toBe(false);
    expect(needsAsking('risky', { tool: 'other__claim_work_item' }, { own: 'agentbox' })).toBe(true);
  });

  it('shows the MCP call itself on the card, not Grok\'s wrapper around it', () => {
    expect(readCall('grok', { tool_name: 'agentbox__claim_work_item', tool_input: { tool_name: 'agentbox__claim_work_item', tool_input: { id: 'w-1' } } }).input).toEqual({ id: 'w-1' });
  });

  it('asks about a tool from an MCP server and not about reading', () => {
    expect(needsAsking('risky', { tool: 'linear__save_issue' })).toBe(true);
    expect(needsAsking('risky', { tool: 'Read', input: { file_path: '/etc/hosts' } })).toBe(false);
  });

  it('asks about everything but reading in "all", and nothing in "never"', () => {
    expect(needsAsking('all', { tool: 'Bash', input: { command: 'ls' } })).toBe(true);
    expect(needsAsking('all', { tool: 'Grep' })).toBe(false);
    expect(needsAsking('never', { tool: 'Bash', input: { command: 'rm -rf /' } })).toBe(false);
    expect(askMode('nonsense')).toBe('risky');
  });
});

/** The helper, run the way Grok's hook and pi's extension run it. */
function runHelper(engine, payload, env) {
  const child = spawn(process.execPath, [CLI, engine], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const done = new Promise((resolve) => child.on('close', (code) => resolve({ code, said: JSON.parse(out.trim() || 'null') })));
  child.stdin.end(JSON.stringify(payload));
  return done;
}
const waitFor = async (check) => { for (let i = 0; i < 100; i += 1) { const v = check(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); } return null; };

describe('the helper asks on the same card Claude Code uses', () => {
  const store = temp('ask-store-');
  const env = { AGENTBOX_ASK: 'risky', ZERO_APPROVALS_DIR: join(store, '.approvals'), ZERO_APPROVALS_PUBKEY: approvalPublicKey(), ZERO_PRODUCT: 'p', ZERO_ITEM: 'w-1' };
  const risky = { tool_name: 'run_terminal_command', tool_input: { command: 'rm -rf build' }, cwd: store };

  it('says allow at once for a look-only command, with no card', async () => {
    const r = await runHelper('grok', { tool_name: 'run_terminal_command', tool_input: { command: 'ls' }, cwd: store }, env);
    expect(r).toEqual({ code: 0, said: { decision: 'allow' } });
    expect(listPending(store)).toEqual([]);
  });

  it('raises one card for a risky command and lets it run when she allows it', async () => {
    const pending = runHelper('grok', risky, env);
    const card = await waitFor(() => listPending(store)[0]);
    expect(card).toMatchObject({ product: 'p', item: 'w-1', tool: 'Bash', input: { command: 'rm -rf build' } });
    expect(answer(store, card.id, true)).toBeTruthy();
    expect(await pending).toEqual({ code: 0, said: { decision: 'allow' } });
  });

  it('stops it when she says no, with her words as the reason', async () => {
    const pending = runHelper('pi', { tool: 'bash', input: { command: 'git push' }, cwd: store }, env);
    const card = await waitFor(() => listPending(store)[0]);
    answer(store, card.id, false, 'not today');
    const r = await pending;
    expect(r.code).toBe(2);
    expect(r.said).toEqual({ decision: 'deny', reason: 'not today' });
  });

  it('denies, rather than guessing, when it was given no key to check her answer with', async () => {
    const r = await runHelper('grok', risky, { ...env, ZERO_APPROVALS_PUBKEY: '' });
    expect(r.said.decision).toBe('deny');
  });

  it('denies on input it cannot read', async () => {
    const child = spawnSync(process.execPath, [CLI, 'grok'], { input: 'not json', env: { ...process.env, ...env } });
    expect(child.status).toBe(2);
    expect(JSON.parse(String(child.stdout)).decision).toBe('deny');
  });
});

describe('the Grok hook', () => {
  const grokHome = temp('grok-hooks-');
  ensureGrokApprovalHook({ grokHome });
  const script = join(grokHome, 'hooks', `${HOOK_NAME}.sh`);

  it('is written once, runnable, and pointed at by a hook that waits longer than a card does', () => {
    expect(statSync(script).mode & 0o111).toBeTruthy();
    const hook = JSON.parse(readFileSync(join(grokHome, 'hooks', `${HOOK_NAME}.json`), 'utf8'));
    expect(hook.hooks.PreToolUse[0].hooks[0]).toMatchObject({ type: 'command', command: script });
    expect(hook.hooks.PreToolUse[0].hooks[0].timeout).toBeGreaterThan(15 * 60);
    expect(ensureGrokApprovalHook({ grokHome })).toBe(true);
  });

  it('does nothing in a Grok session Agentbox did not start', () => {
    const env = { ...process.env };
    delete env.AGENTBOX_APPROVAL_CLI;
    const r = spawnSync('/bin/sh', [script], { input: '{}', env });
    expect(r.status).toBe(0);
    expect(String(r.stdout)).toBe('');
  });

  it('denies when the helper cannot be run, because Grok would let the call through', () => {
    const r = spawnSync('/bin/sh', [script], { input: '{}', env: { ...process.env, AGENTBOX_APPROVAL_CLI: '/nonexistent/cli.mjs', AGENTBOX_NODE: '/nonexistent/node' } });
    expect(r.status).toBe(2);
    expect(JSON.parse(String(r.stdout)).decision).toBe('deny');
  });
});

describe('pi\'s extension', () => {
  it('is loaded for the run with -e, ahead of the prompt', () => {
    expect(piArgs({ prompt: 'go', extension: '/tmp/x.mjs' })).toEqual(['-p', '--mode', 'json', '-e', '/tmp/x.mjs', '--', 'go']);
  });

  it('blocks a call unless the helper says allow, and imports nothing from inside the app', () => {
    expect(PI_APPROVAL_EXTENSION).toMatch(/pi\.on\('tool_call'/);
    expect(PI_APPROVAL_EXTENSION).toMatch(/if \(verdict\?\.decision === 'allow'\) return undefined;\s*return \{ block: true/);
    expect(PI_APPROVAL_EXTENSION.match(/from '([^']+)'/g)).toEqual(["from 'node:child_process'"]);
    expect(existsSync(CLI)).toBe(true);
  });
});
