// PI, THE FOURTH ENGINE, READ THROUGH CLAUDE CODE'S EYES.
//
// pi (the `pi` coding agent, @earendil-works/pi-coding-agent) runs headless
// with `pi -p --mode json <prompt>` and prints its own events, one JSON object
// a line. Measured 2026-10-07 on pi 1.0.4, a run that called one tool printed:
//
//   session              { id, cwd }                       once, first
//   message_update       { assistantMessageEvent: text_delta … }  while typing
//   message_end          { message: { role: 'assistant', content: [text |
//                          thinking | toolCall], stopReason, errorMessage? } }
//   message_end          { message: { role: 'toolResult', toolCallId, isError,
//                          content: [text] } }
//   agent_end            once, last
//
// Rather than teach every reader in the app a second vocabulary, `piToClaude`
// below rewrites each of those as the Claude Code stream-json line that means
// the same thing, at the moment it arrives. Everything downstream -- the
// session id, the result on the row, the activity line, the trace, the text
// that streams while it is typed -- is then the code Claude Code runs already.
//
// WHAT PI DOES NOT HAVE is a permission system: on its own it runs every tool
// it calls. Its cards come from an extension loaded for the run
// (`PI_APPROVAL_EXTENSION` below), which blocks a call until it is allowed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { askShell } from './claude-bin.mjs';
import { Name } from '../shared/product-name.mjs';

export function candidatePaths(home = os.homedir()) {
  return [
    '/opt/homebrew/bin/pi',
    '/usr/local/bin/pi',
    path.join(home, '.npm-global/bin/pi'),
    path.join(home, '.bun/bin/pi'),
    path.join(home, '.local/bin/pi'),
    path.join(home, 'bin/pi'),
  ];
}

export function findPiBin({
  configured = null,
  home = os.homedir(),
  exists = fs.existsSync,
  shellLookup = () => askShell({ bin: 'pi' }),
} = {}) {
  if (configured && exists(configured)) return { found: true, path: configured, from: 'configured' };
  for (const p of candidatePaths(home)) if (exists(p)) return { found: true, path: p, from: 'known-path' };
  const fromShell = shellLookup();
  const shellPath = typeof fromShell === 'string' ? fromShell : fromShell?.path;
  if (shellPath && exists(shellPath)) return { found: true, path: shellPath, from: 'shell' };
  return { found: false, path: null, from: null };
}

/**
 * WHERE THE NODE PI RUNS ON LIVES, or null. pi is a Node script started with
 *  `#!/usr/bin/env node`, and an app opened from the Dock does not have the
 *  shell's PATH, so without this a pi run dies with "env: node: No such file or
 *  directory" (measured). An npm install puts the script under
 *  `<prefix>/lib/node_modules/…` and node beside it at `<prefix>/bin/node`, so
 *  that is looked for first; the shell is asked after. */
export function piNodeDir(bin, { realpath = fs.realpathSync, exists = fs.existsSync, shellLookup = () => askShell({ bin: 'node' }) } = {}) {
  if (!bin) return null;
  let real = bin;
  try { real = realpath(bin); } catch { /* keep the path as given */ }
  const at = real.indexOf(`${path.sep}lib${path.sep}node_modules${path.sep}`);
  if (at > 0) {
    const dir = path.join(real.slice(0, at), 'bin');
    if (exists(path.join(dir, 'node'))) return dir;
  }
  const fromShell = shellLookup();
  const shellPath = typeof fromShell === 'string' ? fromShell : fromShell?.path;
  return shellPath ? path.dirname(shellPath) : null;
}

/** pi's own thinking words that are also Agentbox's (`--thinking`). */
export const PI_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * pi's command line, built from the plan's own values rather than translated
 *  from Claude Code's: pi's `-p` is a switch and the prompt is the last word,
 *  after `--` so a prompt that starts with a dash is still a prompt. */
export function piArgs({ prompt, system = null, resumeId = null, model = null, effort = null, extension = null }) {
  const args = ['-p', '--mode', 'json'];
  if (extension) args.push('-e', extension);
  if (system) args.push('--append-system-prompt', system);
  if (resumeId) args.push('--session', resumeId);
  if (typeof model === 'string' && model) args.push('--model', model);
  if (PI_EFFORTS.includes(effort)) args.push('--thinking', effort);
  args.push('--', String(prompt ?? ''));
  return args;
}

// pi's built-in tools under the names Claude Code gives the same tools, with
// `path` as `file_path`, so the activity line reads "Reading x" for both.
const TOOL_NAMES = { bash: 'Bash', read: 'Read', edit: 'Edit', write: 'Write', grep: 'Grep', find: 'Glob', ls: 'LS' };
function toolUse(block) {
  const name = TOOL_NAMES[block.name] ?? block.name;
  const input = { ...(block.arguments ?? {}) };
  if (['Read', 'Edit', 'Write'].includes(name) && input.path && !input.file_path) input.file_path = input.path;
  return { type: 'tool_use', id: block.id, name, input };
}

const textOf = (content) => (Array.isArray(content) ? content : [])
  .filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('');

/**
 * One pi line in, the Claude Code lines that mean the same out (zero or more,
 * as strings). `state` is one object per run and carries what the last line
 * needs: the session id, the last thing the assistant said, and any error.
 */
export function piToClaude(line, state = {}) {
  let e;
  try { e = JSON.parse(line); } catch { return []; }
  const out = (obj) => [JSON.stringify(obj)];
  switch (e?.type) {
    case 'session':
      state.sessionId = e.id;
      return out({ type: 'system', subtype: 'init', session_id: e.id, cwd: e.cwd ?? null, tools: [] });
    case 'message_start':
      return e.message?.role === 'assistant' ? out({ type: 'stream_event', event: { type: 'message_start' } }) : [];
    case 'message_update': {
      const a = e.assistantMessageEvent ?? {};
      if (a.type === 'text_start') return out({ type: 'stream_event', event: { type: 'content_block_start', index: a.contentIndex ?? 0, content_block: { type: 'text', text: '' } } });
      if (a.type === 'text_delta') return out({ type: 'stream_event', event: { type: 'content_block_delta', index: a.contentIndex ?? 0, delta: { type: 'text_delta', text: a.delta ?? '' } } });
      return [];
    }
    case 'message_end': {
      const m = e.message ?? {};
      if (m.role === 'assistant') {
        state.turns = (state.turns ?? 0) + 1;
        const said = textOf(m.content);
        if (said) state.lastText = said;
        if (m.stopReason === 'error' || m.stopReason === 'aborted') state.error = m.errorMessage || `pi stopped: ${m.stopReason}`;
        const content = (Array.isArray(m.content) ? m.content : []).map((b) => {
          if (b?.type === 'text') return { type: 'text', text: b.text ?? '' };
          if (b?.type === 'thinking') return { type: 'thinking', thinking: b.thinking ?? '' };
          if (b?.type === 'toolCall') return toolUse(b);
          return null;
        }).filter(Boolean);
        return out({
          type: 'assistant',
          session_id: state.sessionId,
          message: { id: m.responseId ?? null, role: 'assistant', model: m.model ?? null, content, stop_reason: m.stopReason ?? null },
        });
      }
      if (m.role === 'toolResult') {
        return out({
          type: 'user',
          session_id: state.sessionId,
          message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: textOf(m.content), is_error: !!m.isError }] },
        });
      }
      return [];
    }
    case 'agent_end': {
      const failed = !!state.error;
      return out({
        type: 'result',
        subtype: failed ? 'error_during_execution' : 'success',
        is_error: failed,
        result: failed ? state.error : (state.lastText ?? ''),
        session_id: state.sessionId,
        num_turns: state.turns ?? 0,
      });
    }
    default:
      return [];
  }
}

/** pi saves one file per conversation, `<time>_<id>.jsonl`, in a folder per
 *  working folder under `~/.pi/agent/sessions`. */
export function piTranscriptFile(sessionId, { home = path.join(os.homedir(), '.pi', 'agent') } = {}) {
  if (!sessionId) return null;
  const sessions = path.join(home, 'sessions');
  try {
    for (const dir of fs.readdirSync(sessions)) {
      let names;
      try { names = fs.readdirSync(path.join(sessions, dir)); } catch { continue; }
      const hit = names.find((n) => n.endsWith(`_${sessionId}.jsonl`));
      if (hit) return path.join(sessions, dir, hit);
    }
  } catch { /* no sessions folder yet */ }
  return null;
}

/**
 * `pi --list-models` as rows (`provider/model`), and pi's own default read off
 *  its settings, which is what a run that names no model gets. */
export function parsePiModels(text) {
  const models = [];
  for (const line of String(text ?? '').split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 2 || (cols[0] === 'provider' && cols[1] === 'model')) continue;
    const id = cols[0].includes('/') && cols.length < 3 ? cols[0] : `${cols[0]}/${cols[1]}`;
    models.push({ id, label: id });
  }
  return models;
}

export function piDefaultModel({ home = path.join(os.homedir(), '.pi', 'agent') } = {}) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
    return s.defaultProvider && s.defaultModel ? `${s.defaultProvider}/${s.defaultModel}` : null;
  } catch { return null; }
}

let modelsCache = null;
const mtimeOf = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };

export function piModels({
  bin, nodeDir = null, home = path.join(os.homedir(), '.pi', 'agent'),
  run = (b) => execFileSync(b, ['--list-models'], {
    encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, PATH: [nodeDir, process.env.PATH].filter(Boolean).join(path.delimiter) },
  }),
} = {}) {
  if (!bin) return { models: [], default: null };
  const key = `${bin}:${mtimeOf(bin)}:${mtimeOf(path.join(home, 'models.json'))}:${mtimeOf(path.join(home, 'settings.json'))}`;
  if (modelsCache?.key === key) return modelsCache.value;
  let models = [];
  try { models = parsePiModels(run(bin)); } catch { /* listed as none */ }
  const value = { models, default: piDefaultModel({ home }) };
  modelsCache = { key, value };
  return value;
}

/**
 * THE EXTENSION THAT GIVES PI APPROVAL CARDS, as the text of a file.
 *
 *  pi loads it with `-e <file>` for one run. On every tool call it hands the
 *  call to Agentbox's helper (main/agent-approval-cli.mjs) and blocks the call
 *  unless the answer is an explicit allow. It is written to a temporary file
 *  per run rather than shipped, because pi cannot read a file inside the
 *  packaged app, and it imports nothing but Node's own modules for the same
 *  reason. */
export const PI_APPROVAL_EXTENSION = `import { spawn } from 'node:child_process';

export default function (pi) {
  pi.on('tool_call', async (event, ctx) => {
    const cli = process.env.AGENTBOX_APPROVAL_CLI;
    if (!cli) return undefined;
    const verdict = await new Promise((resolve) => {
      let out = '';
      let child;
      try {
        child = spawn(process.env.AGENTBOX_NODE || 'node', [cli, 'pi'], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } catch { resolve(null); return; }
      child.stdout.on('data', (d) => { out += d; });
      child.on('error', () => resolve(null));
      child.on('close', () => {
        try { resolve(JSON.parse(out.trim().split('\\n').pop())); } catch { resolve(null); }
      });
      child.stdin.end(JSON.stringify({ tool: event.toolName, input: event.input, cwd: ctx?.cwd ?? process.cwd() }));
    });
    if (verdict?.decision === 'allow') return undefined;
    return { block: true, reason: verdict?.reason || '${Name} could not ask about this action, so it was not allowed.' };
  });
}
`;
