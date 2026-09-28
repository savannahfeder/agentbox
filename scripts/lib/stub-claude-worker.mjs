#!/usr/bin/env node
// A STAND-IN FOR `claude -p`, FOR THE PROOF SCRIPTS ONLY.
//
// BE PRECISE ABOUT WHAT THIS IS, because a stand-in believed to be more than it
// is, is worse than none. It is NOT Claude Code and it proves nothing about
// Claude Code's own behaviour. What it is, is a process the supervisor spawns
// through the identical code path -- the same argv, the same environment, the
// same stdout contract, the same exit semantics -- so that everything on
// AGENTBOX'S side of that boundary can be watched end to end without spending the
// founder's subscription and without writing a transcript into her ~/.claude.
//
// WHY A STAND-IN AT ALL. The engineer writing these proofs was told not to read
// or write ~/.claude, and Claude Code has no way to run signed-out: pointing
// CLAUDE_CONFIG_DIR at a scratch folder gives an unauthenticated CLI that dies
// on arrival. There is no equivalent of the model-provider trick that lets the
// Codex proofs use the real binary (scripts/lib/codex-stub-model.mjs). So the
// honest options were this, clearly labelled, or nothing -- and "the Claude
// path still works" is too important to leave unexamined.
//
// WHAT IT REALLY DOES, and this is the part that is not pretend:
//
//   IT ANSWERS ON THE REAL STDOUT CONTRACT. `session_id` on its first line and
//   a `type: "result"` frame at the end are exactly what main/supervisor.mjs's
//   `captureStream` reads, and they are what make a run resumable and readable.
//
//   IT RAISES A REAL APPROVAL. Given `approval` in its plan it reads the
//   `--mcp-config` file Agentbox wrote for it, launches the `zero-approvals`
//   server named in it with the environment Agentbox chose, and calls
//   `approval_prompt` over MCP stdio -- the same server, the same spool, the
//   same signed answer, the same fifteen-minute deadline a real worker gets.
//   Nothing about the gate is simulated; only the reason for asking is.
//
//   IT DIES LIKE THE REAL ONE. The CLI traps SIGTERM and exits 143 under its
//   own power, which is why main/supervisor.mjs's `_kill` writes the intent
//   down instead of reading a signal. This does the same, so a proof about a
//   kill is a proof about the same numbers.
//
// It also writes down the argv and environment it was handed, which is how a
// proof can show that the command line Agentbox builds for Claude Code has not
// moved.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const say = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const sessionId = `stub-${crypto.randomUUID()}`;

const planFile = process.env.STUB_CLAUDE_PLAN ?? null;
let plan = {};
try { plan = planFile ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : {}; } catch { plan = {}; }

// THE RECEIPT. What Agentbox actually handed this worker, written where the proof
// can read it: the whole argv, the environment variables that decide billing
// and identity, and the working directory.
if (plan.receipts) {
  try {
    fs.mkdirSync(plan.receipts, { recursive: true });
    fs.writeFileSync(path.join(plan.receipts, `${process.env.ZERO_ITEM ?? 'no-item'}.json`), JSON.stringify({
      argv,
      cwd: process.cwd(),
      sessionId,
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => (
        k.startsWith('ZERO_') || k.startsWith('STORE_') || k.startsWith('ANTHROPIC_')
        || k.startsWith('CLAUDE') || k.startsWith('OPENAI_') || k.startsWith('CODEX_')
      ))),
    }, null, 1));
  } catch { /* a receipt is never worth the run */ }
}

say({ type: 'system', subtype: 'init', session_id: sessionId, tools: [], model: 'stub' });

// OUR OWN KILL, ANSWERED THE WAY THE REAL CLI ANSWERS IT. 143 and not a signal:
// see the note at the top, and main/supervisor.mjs `_kill`.
let stopping = false;
process.on('SIGTERM', () => { stopping = true; process.exit(143); });
process.on('SIGINT', () => { stopping = true; process.exit(143); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The approvals server Agentbox wrote into this worker's --mcp-config, spoken to
 *  exactly the way Claude Code speaks to it: MCP over the child's stdio. */
async function askTheFounder({ tool_name: toolName, input }) {
  const at = argv.indexOf('--mcp-config');
  if (at < 0) throw new Error('no --mcp-config was passed, so there is no approvals channel to use');
  const config = JSON.parse(fs.readFileSync(argv[at + 1], 'utf8'));
  const server = config.mcpServers?.['zero-approvals'];
  if (!server) throw new Error('the mcp config Agentbox wrote has no zero-approvals server in it');

  const child = spawn(server.command, server.args ?? [], {
    env: { ...process.env, ...(server.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  const waiting = new Map();
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let at2;
    while ((at2 = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at2).trim();
      buffer = buffer.slice(at2 + 1);
      if (!line) continue;
      let msg = null;
      try { msg = JSON.parse(line); } catch { continue; }
      const settle = waiting.get(msg.id);
      if (settle) { waiting.delete(msg.id); settle(msg); }
    }
  });
  let nextId = 1;
  const call = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

  await call('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'agentbox-proof-stub', version: '1.0.0' }, capabilities: {} });
  const answer = await call('tools/call', { name: 'approval_prompt', arguments: { tool_name: toolName, input } });
  try { child.kill(); } catch { /* done with it */ }
  // The server answers with the decision as JSON text inside the MCP result,
  // which is the shape Claude Code's --permission-prompt-tool contract expects.
  const text = answer?.result?.content?.[0]?.text ?? '{}';
  try { return JSON.parse(text); } catch { return { behavior: 'deny', message: `unreadable answer: ${text}` }; }
}

let said = plan.say ?? 'the stub worker ran';
try {
  if (plan.approval) {
    const decision = await askTheFounder(plan.approval);
    say({ type: 'assistant', message: { content: [{ type: 'text', text: `the founder said: ${decision.behavior}` }] } });
    said = `${said} — approval ${decision.behavior}`;
    if (plan.markWhenAllowed && decision.behavior === 'allow') {
      fs.writeFileSync(path.join(process.cwd(), plan.markWhenAllowed), 'the founder said yes\n');
    }
  }
  if (plan.holdMs) {
    const until = Date.now() + plan.holdMs;
    while (!stopping && Date.now() < until) await wait(50);
  }
} catch (err) {
  say({ type: 'result', subtype: 'error', result: String(err?.message ?? err), is_error: true, session_id: sessionId });
  process.exit(1);
}

say({ type: 'result', subtype: 'success', result: said, is_error: false, session_id: sessionId });
process.exit(0);
