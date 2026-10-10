// GROK BUILD, THE THIRD ENGINE, AND WHY IT IS SO MUCH SMALLER THAN CODEX.
//
// Codex needed its own transport (`codex app-server`), its own readers and its
// own approval cards. Grok Build needs almost none of that, because its
// headless mode speaks Claude Code's language: measured 2026-10-07 on grok
// 1.0.46, `grok -p <prompt> --output-format streaming-messages-json` prints the
// same `system`/`assistant`/`user`/`result` lines Claude Code's
// `--output-format stream-json` does, `session_id` on the first, `result` on
// the last. So a Grok run is spawned on the Claude Code path, read with Claude
// Code's readers, and this file only holds what differs.
//
// WHAT DIFFERS IS THE COMMAND LINE, and the differences were measured one flag
// at a time against the real binary (`grok <flag> --version`):
//
//   TAKEN AS IS: -p, --include-partial-messages, --append-system-prompt,
//   --resume, --fork-session, --permission-mode, --allowedTools,
//   --disallowedTools, --model, --effort, --dangerously-skip-permissions.
//
//   REFUSED, so a run carrying one dies on arrival with "unexpected argument":
//   --verbose, --mcp-config, --permission-prompt-tool, --settings,
//   --setting-sources, --strict-mcp-config, --add-dir, --input-format,
//   --replay-user-messages.
//
//   RENAMED: `--output-format stream-json` is `streaming-messages-json`.
//
// AND WHAT IS LOST WITH THE REFUSED ONES: `--permission-prompt-tool` is how a
// Claude Code worker raises an approval card, and Grok has nothing in its
// place. In a headless run Grok refuses only what a deny rule names; measured,
// `touch` ran under `--permission-mode default` and under `dontAsk`. So Grok's
// cards come from a PreToolUse hook instead (main/grok-approvals.mjs).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askShell } from './claude-bin.mjs';

/** Grok's own levels, from its refusal of any other word (1.0.46). */
export const GROK_EFFORTS = ['low', 'medium', 'high', 'xhigh'];

export function candidatePaths(home = os.homedir()) {
  return [
    path.join(home, '.grok/bin/grok'),   // where xAI's installer puts it
    path.join(home, '.local/bin/grok'),
    '/opt/homebrew/bin/grok',
    '/usr/local/bin/grok',
    path.join(home, 'bin/grok'),
  ];
}

/**
 * Where Grok Build is on this Mac, or `{ found: false }`. Optional, like Codex:
 *  a miss is null on the config, which every router reads as "this Mac cannot
 *  run Grok", so a Grok row there falls back to Claude Code instead of dying. */
export function findGrokBin({
  configured = null,
  home = os.homedir(),
  exists = fs.existsSync,
  shellLookup = () => askShell({ bin: 'grok' }),
} = {}) {
  if (configured && exists(configured)) return { found: true, path: configured, from: 'configured' };
  for (const p of candidatePaths(home)) if (exists(p)) return { found: true, path: p, from: 'known-path' };
  const fromShell = shellLookup();
  const shellPath = typeof fromShell === 'string' ? fromShell : fromShell?.path;
  if (shellPath && exists(shellPath)) return { found: true, path: shellPath, from: 'shell' };
  return { found: false, path: null, from: null };
}

const DROPPED_WITH_VALUE = new Set([
  '--mcp-config', '--permission-prompt-tool', '--settings', '--setting-sources',
  '--add-dir', '--input-format', '--model', '--effort',
]);
const DROPPED_ALONE = new Set(['--verbose', '--strict-mcp-config', '--replay-user-messages', '--ide']);
// Kept, and their value is carried across untouched: a prompt or a system
// block that happens to read `--verbose` is text, not a flag.
const KEPT_WITH_VALUE = new Set([
  '-p', '--append-system-prompt', '--resume', '--session-id', '--permission-mode',
  '--allowedTools', '--disallowedTools',
]);

/**
 * A Claude Code command line, as `spawnPlan` built it, rewritten for Grok.
 *
 * `--model` is dropped whatever it says and put back only from `model`, which
 * is the row's own Grok model: a workspace `--model opus` is a Claude Code word
 * and Grok would refuse it. `--effort` is the same, kept only when it is one of
 * Grok's four, so Claude Code's `max` cannot stop a Grok run.
 */
export function grokArgs(args, { model = null, effort = null } = {}) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const [flag] = arg.split('=', 1);
    if (KEPT_WITH_VALUE.has(arg) && i + 1 < args.length) {
      out.push(arg, args[i + 1]);
      i += 1;
      continue;
    }
    if (DROPPED_ALONE.has(arg)) continue;
    if (DROPPED_WITH_VALUE.has(flag)) {
      if (!arg.includes('=')) i += 1;
      continue;
    }
    if (arg === '--output-format') {
      out.push(arg, args[i + 1] === 'stream-json' ? 'streaming-messages-json' : args[i + 1]);
      i += 1;
      continue;
    }
    out.push(arg);
  }
  if (typeof model === 'string' && model) out.push('--model', model);
  if (GROK_EFFORTS.includes(effort)) out.push('--effort', effort);
  return out;
}

/**
 * Grok keeps one folder per conversation, under the working folder's path
 *  written with `encodeURIComponent` (`~/.grok/sessions/%2FUsers%2F.../<id>/`).
 *  The path is the real one (`/private/tmp`, not `/tmp`), so a direct guess can
 *  miss and every folder is looked through after it, as Claude Code's are. */
export function grokTranscriptFile(sessionId, { home = path.join(os.homedir(), '.grok'), cwd = null } = {}) {
  if (!sessionId) return null;
  const sessions = path.join(home, 'sessions');
  const inside = (dir) => path.join(sessions, dir, sessionId, 'chat_history.jsonl');
  if (cwd) {
    const direct = inside(encodeURIComponent(cwd));
    if (fs.existsSync(direct)) return direct;
  }
  try {
    for (const dir of fs.readdirSync(sessions)) {
      const candidate = inside(dir);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* no sessions folder yet */ }
  return null;
}

/**
 * `grok models` as rows, plus which one a task gets when nobody picks.
 *
 *  The output names Grok's own default with a `*`. That is not always the right
 *  default HERE: a person's config can point it at a model served from their
 *  own machine, and measured 2026-10-07 a headless run on one whose local
 *  server was down sat silent until it was killed. So the default offered is
 *  Grok's own when it is one of xAI's (`grok-…`), and otherwise the first of
 *  xAI's in the list. Every model is still listed and can still be picked.
 */
export function parseGrokModels(text) {
  const models = [];
  let own = null;
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(/^\s*([-*])\s+(\S+)/);
    if (!m) continue;
    models.push({ id: m[2], label: m[2] });
    if (m[1] === '*') own = m[2];
  }
  const hosted = (id) => /^grok-/.test(id ?? '');
  const fallback = hosted(own) ? own : models.find((m) => hosted(m.id))?.id ?? own;
  return { models, default: fallback ?? null };
}

let modelsCache = null;
const mtimeOf = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };

/** Read once per binary and per config change: the command takes ~1.6 s. */
export function grokModels({ bin, home = path.join(os.homedir(), '.grok'), run = (b) => execFileSync(b, ['models'], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }) } = {}) {
  if (!bin) return { models: [], default: null };
  const key = `${bin}:${mtimeOf(bin)}:${mtimeOf(path.join(home, 'config.toml'))}`;
  if (modelsCache?.key === key) return modelsCache.value;
  let value;
  try { value = parseGrokModels(run(bin)); } catch { value = { models: [], default: null }; }
  modelsCache = { key, value };
  return value;
}
