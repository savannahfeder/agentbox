// THE IMPORT LEAVES OUT WHAT AGENTBOX ALREADY HOLDS.
//
// w-4b8af9d08f, 2026-10-26: the import card offered "Add 1503 to your inbox",
// and most of its rows were Codex runs an agent had started inside one of
// Agentbox's own task folders ("You are reviewing a design decision in this
// repository...", "Codex · W 9f9c2570e2"). Bringing those in duplicates a
// thread the inbox already has. Measured on Codex 0.163.0: `codex exec` writes
// `originator: "codex_exec"`, `source: "exec"` and `thread_source: "user"`, so
// the reader took every one for a conversation a person typed.

import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSessionThreads, isTaskFolder } from '../main/agent-sessions.mjs';
import { readCodexThreads } from '../main/codex-threads.mjs';

const NOW = Date.UTC(2026, 9, 26, 12);
let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'import-ours-')); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

function put(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.utimesSync(file, new Date(NOW - 1000), new Date(NOW - 1000));
}
function codex(id, { cwd = `${home}/code/shop`, ...meta } = {}) {
  const at = new Date(NOW - 10_000).toISOString();
  put(path.join(home, '.codex', 'sessions', '2026', '10', '26', `rollout-${id}.jsonl`), [
    { type: 'session_meta', timestamp: at, payload: { id, cwd, timestamp: at, originator: 'codex_cli_rs', source: 'cli', thread_source: 'user', ...meta } },
    { type: 'event_msg', timestamp: at, payload: { type: 'user_message', message: `Prompt ${id}` } },
  ]);
}
function claude(id, { cwd = `${home}/code/shop`, ep = 'cli' } = {}) {
  put(path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`), [
    { type: 'user', sessionId: id, entrypoint: ep, cwd, message: { role: 'user', content: `Prompt ${id}` } },
  ]);
}
const codexIds = () => readCodexThreads({ home, codexDir: path.join(home, '.codex'), now: NOW }).threads.map((t) => t.id).sort();
const claudeIds = () => readSessionThreads({ home, dirs: [path.join(home, '.claude')], now: NOW }).threads.map((t) => t.id).sort();

const task = (repo = 'code/shop', id = 'w-9f9c2570e2') => `${home}/${repo}/.claude/worktrees/${id}`;

it('leaves out a one-shot `codex exec` run, as Codex 0.163.0 records it', () => {
  codex('exec', { originator: 'codex_exec', source: 'exec' });
  codex('cli');
  expect(codexIds()).toEqual(['cli']);
});

it('leaves out a Codex run that another program drove over MCP', () => {
  codex('mcp', { originator: 'codex_mcp', source: 'mcp' });
  codex('desktop', { originator: 'Codex Desktop', source: 'vscode' });
  expect(codexIds()).toEqual(['desktop']);
});

it('leaves out a Codex chat in an Agentbox task folder, or anywhere under one', () => {
  codex('in-task', { cwd: task() });
  codex('under-task', { cwd: `${task()}/renderer` });
  codex('repo', { cwd: `${home}/code/shop` });
  expect(codexIds()).toEqual(['repo']);
});

it('leaves out a Claude Code chat a person opened in an Agentbox task folder', () => {
  claude('in-task', { cwd: task() });
  claude('under-task', { cwd: `${task()}/main` });
  claude('repo');
  expect(claudeIds()).toEqual(['repo']);
});

it('keeps a Claude Code desktop worktree, which has a name rather than a task id', () => {
  claude('desktop-tree', { cwd: `${home}/code/shop/.claude/worktrees/upbeat-matsumoto-588a8d` });
  codex('desktop-tree', { cwd: `${home}/code/shop/.claude/worktrees/upbeat-matsumoto-588a8d` });
  expect(claudeIds()).toEqual(['desktop-tree']);
  expect(codexIds()).toEqual(['desktop-tree']);
});

it('knows a task folder by its place and its id, not by the id alone', () => {
  expect(isTaskFolder('/r/.claude/worktrees/w-4b8af9d08f')).toBe(true);
  expect(isTaskFolder('/r/.claude/worktrees/w-4b8af9d08f/main/x')).toBe(true);
  expect(isTaskFolder('/r/.claude/worktrees/w-4b8af9d08f-notes')).toBe(false);
  expect(isTaskFolder('/r/w-4b8af9d08f')).toBe(false);
  expect(isTaskFolder('/r/.claude/worktrees/feature-x')).toBe(false);
  expect(isTaskFolder('')).toBe(false);
});
