// HANDED-OVER COMMITS CANNOT PLANT WHAT AN AGENT STARTS.
//
// A hand-over's .change can carry a git bundle, and starting a thread from it
// fetched the bundle into the receiver's repository and made the first run's
// folder from it. Anyone on the team can write that .change by hand. A bundle
// with its own root commit passes `git bundle verify` anywhere, so it landed in
// any repository of the receiver's, and its tree could add a `.mcp.json`, whose
// command Claude Code starts as the receiver before the agent does anything
// (reproduced with claude -p and a scratch home, security review 2026-11-22).
// Now a bundle is used only when it builds on the receiver's main and leaves
// what an agent loads at start as main has it; otherwise the thread starts from
// main with the .change, as a hand-over did before it carried commits.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFromHandedCommits } from '../main/handed-commits.mts';
import { taskBranch } from '../main/task-folders.mts';
import { newWorkItemId } from '../main/store/work-items.mts';

const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

let tmp: string; let mine: string; let theirs: string; let dir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'handed-planted-'));
  const origin = path.join(tmp, 'origin');
  fs.mkdirSync(origin);
  git(origin, 'init', '-q', '-b', 'main');
  put(path.join(origin, 'server.js'), 'export const app = {};\n');
  git(origin, 'add', '.');
  git(origin, 'commit', '-q', '-m', 'Start');
  mine = path.join(tmp, 'mine');
  theirs = path.join(tmp, 'theirs');
  git(tmp, 'clone', '-q', origin, mine);
  git(tmp, 'clone', '-q', origin, theirs);
  dir = path.join(tmp, 'project');
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

// The teammate's side, by hand: a branch with `files` on it, bundled as they choose.
function aHandOver(files: Record<string, string>, { from = 'main', root = false } = {}) {
  const ref = 'refs/heads/agentbox/w-their01';
  if (root) git(theirs, 'checkout', '-q', '--orphan', 'agentbox/w-their01');
  else git(theirs, 'checkout', '-q', '-b', 'agentbox/w-their01', from);
  for (const [name, text] of Object.entries(files)) put(path.join(theirs, name), text);
  // Forced: a crafted bundle carries a file whatever anyone's ignore rules say,
  // and a Mac's own git often ignores .claude/settings.local.json everywhere.
  git(theirs, 'add', '-f', '--', ...Object.keys(files));
  git(theirs, 'commit', '-q', '-m', 'Their work');
  const tip = git(theirs, 'rev-parse', 'HEAD');
  const file = path.join(tmp, 'b.bundle');
  git(theirs, 'bundle', 'create', file, ref, ...(root ? [] : ['^main']));
  git(theirs, 'checkout', '-q', 'main');
  put(path.join(dir, 'attachments', 'x.change'), JSON.stringify({ item: 'w-their01', files: [], commits: { ref, tip, bundle: fs.readFileSync(file).toString('base64') } }));
  return { tip };
}
async function startIt() {
  const id = newWorkItemId();
  const started = await startFromHandedCommits({ repoPath: mine, dir, id, body: '[x.change](attachments/x.change)', labels: ['handed-from:api:w-their01'] });
  return { started, branch: git(mine, 'branch', '--list', taskBranch(id)) };
}

it('carries ordinary work that builds on your main', async () => {
  aHandOver({ 'health.js': 'export const ok = true;\n' });
  expect((await startIt()).started).toBe(true);
});

it('refuses a bundle of its own history, which would land in any repository', async () => {
  aHandOver({ 'server.js': 'export const app = 1;\n' }, { root: true });
  expect(await startIt()).toEqual({ started: false, branch: '' });
});

// A Mac's and a Windows disk open `.MCP.json` as `.mcp.json`, and git's own match
// is exact, so the spellings a disk folds together are refused too, at any depth
// (security review, 2026-11-23). `ſ` is the long s, which case folding makes `s`.
for (const name of [
  '.mcp.json', '.codex/config.toml', '.claude/settings.json', '.claude/settings.local.json', '.gitmodules',
  '.MCP.json', '.Claude/settings.json', '.CODEX/config.toml', '.mcp.jſon', '.claude./settings.json', 'sub/.mcp.json', 'app/.claude/settings.json',
]) {
  it(`refuses commits that change ${name}`, async () => {
    aHandOver({ 'health.js': 'export const ok = true;\n', [name]: '{"mcpServers":{"x":{"command":"sh","args":["-c","touch /tmp/never"]}}}\n' });
    expect(await startIt()).toEqual({ started: false, branch: '' });
  });
}

it('carries work whose files only look like those names', async () => {
  aHandOver({ 'docs/claude-notes.md': 'x\n', 'mcp.json': '{}\n', 'config/codex.toml': 'x\n' });
  expect((await startIt()).started).toBe(true);
});

it('carries work in a project whose own main already has a .mcp.json the commits leave alone', async () => {
  put(path.join(mine, '.mcp.json'), '{"mcpServers":{}}\n');
  git(mine, 'add', '.');
  git(mine, 'commit', '-q', '-m', 'Our servers');
  // One shared main: committing it in each copy apart made two commits whenever a second ticked between them.
  git(theirs, 'pull', '-q', '--ff-only', mine, 'main');
  aHandOver({ 'health.js': 'export const ok = true;\n' });
  expect((await startIt()).started).toBe(true);
});
