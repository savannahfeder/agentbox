// AN AGENT ASKS ITS QUESTION IN THE THREAD, NOT ON A CARD (w-ab1f2f1d82).
//
// What broke: a worker called Claude Code's AskUserQuestion. A headless run has
// no screen to ask on, so the CLI sent the question down --permission-prompt-tool
// like any gated command, and it landed on the approval card as "Agentbox Team
// asks to run" over "Agentbox could not read what this asks for." Allow handed
// the agent no answer. Nobody had chosen the card as the place for questions;
// it was where that pipe happened to end.
//
// Decided on the thread: approvals go on the card, decisions go in the thread.
// Every worker is already briefed to end its turn with the question as its last
// message, choices under Options, and the reply wakes it with its context. So
// workers launch without the ask tool, and a question that reaches the approval
// channel anyway (a CLI that ignores the flag) is turned back to the thread
// without a card ever being drawn.
//
// Measured: `claude -p` 2.1.293 told to use AskUserQuestion, launched with
// `--disallowedTools AskUserQuestion` and a permission tool that logs every
// call, never called the permission tool and asked in its reply instead.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mts';
import { answer, approvalPublicKey, listPending, spoolDir } from '../main/approvals.mjs';
import { streamInputArgs } from '../main/claude-input.mts';
import { harnessDefinition } from '../shared/harness-definitions.mjs';
import { stripTypesFlags } from '../main/strip-types.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(here, '..', 'main', 'approval-prompt-server.mts');

const launch = ({ mcp = '/tmp/mcp.json', rules = '/tmp/rules.json' } = {}) => {
  const plan = { args: ['-p', 'go'] };
  const fake = { writeMcpConfig: () => mcp, writeWorkerSettings: () => rules };
  Supervisor.prototype.prepareClaudePermissions.call(fake, plan, null, 'run', []);
  return plan.args;
};
const disallowed = (args) => {
  const i = args.indexOf('--disallowedTools');
  return i < 0 ? null : args[i + 1];
};

describe('a worker launches without the ask tool', () => {
  it('turns AskUserQuestion off beside the approvals channel', () => {
    const args = launch();
    expect(disallowed(args)).toBe('AskUserQuestion');
    expect(args).toContain('--permission-prompt-tool');
  });

  it('turns it off even when the approvals channel could not be set up', () => {
    expect(disallowed(launch({ mcp: null }))).toBe('AskUserQuestion');
  });

  it('turns off nothing else', () => {
    const args = launch();
    expect(args.filter((a) => a === '--disallowedTools')).toHaveLength(1);
    for (const tool of ['Bash', 'Edit', 'Write', 'Read', 'mcp__agentbox']) expect(disallowed(args)).not.toContain(tool);
  });
});

/* -------------------- the approvals channel, if one arrives --------------- */

const roots = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

// One call into the worker's own approvals server, the way the CLI makes it.
// `settle` is how long to wait for an answer before reporting what the spool
// holds: a card that is waiting on her never answers inside it.
function call(tool, input, settle = 3_000) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-ask-'));
  roots.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...stripTypesFlags(), SERVER], {
      env: { ...process.env, ZERO_APPROVALS_DIR: dir, ZERO_APPROVALS_PUBKEY: approvalPublicKey(), ZERO_PRODUCT: 'p', ZERO_ITEM: 'w-1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    const done = (result) => {
      clearTimeout(timer);
      const cards = fs.readdirSync(dir).filter((f) => f.endsWith('.request.json'));
      child.kill();
      resolve({ result, cards });
    };
    const timer = setTimeout(() => done(null), settle);
    child.stdout.on('data', (b) => {
      out += b;
      if (out.includes('\n')) done(JSON.parse(JSON.parse(out.split('\n')[0]).result.content[0].text));
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'approval_prompt', arguments: { tool_name: tool, input } },
    })}\n`);
  });
}

const question = { questions: [{ question: 'Which region?', header: 'Region', multiSelect: false, options: [{ label: 'us-east-1', description: '' }, { label: 'us-west-2', description: '' }] }] };

describe('a question that reaches the approvals channel anyway', () => {
  it('goes back to the agent at once, and no card is drawn', async () => {
    const { result, cards } = await call('AskUserQuestion', question);
    expect(result?.behavior).toBe('deny');
    expect(cards).toEqual([]);
  }, 20_000);

  it('tells the agent to ask in its last message, under Options', async () => {
    const { result } = await call('AskUserQuestion', question);
    expect(result.message).toMatch(/last message/i);
    expect(result.message).toMatch(/Options/);
    expect(result.message).not.toMatch(/declined/i);
  }, 20_000);

  it('turns back a malformed question the same way', async () => {
    const { result, cards } = await call('AskUserQuestion', { nonsense: true });
    expect(result?.behavior).toBe('deny');
    expect(cards).toEqual([]);
  }, 20_000);

  it('still puts a command on the card and waits for you', async () => {
    const { result, cards } = await call('Bash', { command: 'rm -rf build' });
    expect(result).toBeNull();
    expect(cards).toHaveLength(1);
  }, 20_000);

  it('still puts every other kind of action on the card', async () => {
    for (const tool of ['Edit', 'Write', 'WebFetch', 'mcp__agentbox__update_work_item', 'mcp__other__AskUserQuestion', 'AskUserQuestions']) {
      const { result, cards } = await call(tool, { file_path: '/tmp/x' }, 1_500);
      expect([tool, result]).toEqual([tool, null]);
      expect(cards).toHaveLength(1);
    }
  }, 40_000);
});

/* ------------------ the approvals themselves, unchanged ------------------- */
// Asked on the thread before this shipped: does turning the ask tool off touch
// approvals in any way? These run the whole round trip for a command, both
// answers, through the worker's own server.

function roundTrip(tool, input, allow) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-ask-'));
  roots.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...stripTypesFlags(), SERVER], {
      env: { ...process.env, ZERO_APPROVALS_DIR: dir, ZERO_APPROVALS_PUBKEY: approvalPublicKey(), ZERO_PRODUCT: 'p', ZERO_ITEM: 'w-1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const giveUp = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('the approvals server never answered')); }, 25_000);
    let out = '';
    child.stdout.on('data', (b) => {
      out += b;
      if (!out.includes('\n')) return;
      clearTimeout(giveUp);
      child.kill();
      resolve(JSON.parse(JSON.parse(out.split('\n')[0]).result.content[0].text));
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'approval_prompt', arguments: { tool_name: tool, input } },
    })}\n`);
    const watch = setInterval(() => {
      const req = fs.readdirSync(dir).find((f) => f.endsWith('.request.json'));
      if (!req) return;
      clearInterval(watch);
      listPending(root);
      answer(root, req.replace('.request.json', ''), allow, null);
    }, 50);
    child.on('exit', () => { clearInterval(watch); clearTimeout(giveUp); });
  });
}

describe('approvals work exactly as before', () => {
  it('an Allow on a command lets it run, with its input untouched', async () => {
    const input = { command: 'npm publish' };
    expect(await roundTrip('Bash', input, true)).toEqual({ behavior: 'allow', updatedInput: input });
  }, 40_000);

  it('a Deny on a command still refuses it, in the words it always used', async () => {
    const result = await roundTrip('Bash', { command: 'npm publish' }, false);
    expect(result.behavior).toBe('deny');
    expect(result.message).toMatch(/declined this action/);
  }, 40_000);

  it('a worker still launches with its approvals channel and its rules', () => {
    const args = launch();
    expect(args[args.indexOf('--permission-prompt-tool') + 1]).toBe('mcp__zero-approvals__approval_prompt');
    expect(args[args.indexOf('--mcp-config') + 1]).toBe('/tmp/mcp.json');
    expect(args[args.indexOf('--settings') + 1]).toBe('/tmp/rules.json');
  });

  // `--disallowedTools` takes a list, so a bare word after it would be read as
  // one more tool. In the arguments Claude is really started with, the next
  // thing is always a flag.
  it('the flag cannot swallow whatever comes after it', () => {
    const { run } = harnessDefinition('claude');
    for (const mcp of ['/tmp/mcp.json', null]) {
      const plan = { args: [run.print, 'the prompt', '--model', 'opus'] };
      const fake = { writeMcpConfig: () => mcp, writeWorkerSettings: () => '/tmp/rules.json' };
      Supervisor.prototype.prepareClaudePermissions.call(fake, plan, null, 'run', []);
      const final = streamInputArgs(run, plan.args);
      const next = final[final.indexOf('AskUserQuestion') + 1];
      expect(next === undefined || next.startsWith('--')).toBe(true);
    }
  });
});
