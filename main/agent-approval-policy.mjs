// WHICH OF A GROK OR PI TOOL CALL GETS A CARD.
//
// Claude Code decides this itself: in auto mode it runs what it judges safe
// and calls the approval tool for the rest. Grok Build and pi have no such
// judgement to lean on (main/grok.mjs, main/pi.mjs: headless, both run every
// call), so Agentbox makes it here, and it is written to err towards asking:
// a command it does not recognise as looking-only is a card.
//
// THREE SETTINGS, one per engine in Settings:
//   risky  (the default) -- a card before a command that could change
//          something, an edit outside the task's own folder, and any tool
//          from an MCP server. Reading, searching and editing inside the
//          task's folder (its own worktree, shown as a change afterwards) run.
//   all    -- a card before every command, every edit and every other tool
//          that is not reading or searching.
//   never  -- no cards; the engine runs everything, as it does on its own.

import path from 'node:path';

export const ASK_MODES = ['risky', 'all', 'never'];
export const DEFAULT_ASK = 'risky';
export const askMode = (word) => (ASK_MODES.includes(word) ? word : DEFAULT_ASK);

// Each engine's own tool names under the names Claude Code uses, which is what
// the card already knows how to draw.
const NAMES = {
  run_terminal_command: 'Bash', bash: 'Bash',
  read_file: 'Read', read: 'Read',
  search_replace: 'Edit', edit: 'Edit', write: 'Write',
  grep: 'Grep', list_dir: 'LS', ls: 'LS', find: 'Glob',
  web_search: 'WebSearch', web_fetch: 'WebFetch',
};

/** One tool call, from either engine's payload, as `{ tool, input, cwd }`. */
export function readCall(engine, payload = {}) {
  const raw = engine === 'grok'
    ? { name: payload.tool_name ?? payload.toolName, input: payload.tool_input ?? payload.toolInput, cwd: payload.cwd }
    : { name: payload.tool, input: payload.input, cwd: payload.cwd };
  const tool = NAMES[raw.name] ?? String(raw.name ?? 'unknown');
  let input = { ...(raw.input && typeof raw.input === 'object' ? raw.input : {}) };
  // Grok hands an MCP call over wrapped in its dispatcher's own arguments
  // (measured: `{ tool_name, tool_input }` inside the input); the card reads
  // the call itself.
  if (tool.includes('__') && input.tool_input && typeof input.tool_input === 'object') input = { ...input.tool_input };
  if (['Read', 'Edit', 'Write'].includes(tool) && !input.file_path) input.file_path = input.path ?? input.target_file ?? input.file;
  return { tool, input, cwd: typeof raw.cwd === 'string' ? raw.cwd : null };
}

// Tools that only look, or only organise the agent's own work.
const LOOKING = new Set([
  'Read', 'Grep', 'LS', 'Glob', 'WebSearch',
  'todo_write', 'enter_plan_mode', 'exit_plan_mode', 'ask_user_question', 'search_tool',
  'get_command_or_subagent_output', 'kill_command_or_subagent', 'monitor', 'spawn_subagent',
]);
const mcp = (tool) => tool === 'use_tool' || tool.includes('__');

export function needsAsking(mode, { tool, input = {}, cwd = null }, { own = null } = {}) {
  const m = askMode(mode);
  if (m === 'never') return false;
  // Agentbox's own task tools, which every Claude Code worker is granted
  // outright (`--allowedTools mcp__<store>`): asking about them would put a
  // card in front of the person for the agent saying which task it is on.
  if (own && (tool.startsWith(`${own}__`) || tool.startsWith(`mcp__${own}__`))) return false;
  if (m === 'all') return !LOOKING.has(tool);
  if (tool === 'Bash') return !lookOnlyCommand(String(input.command ?? ''));
  if (tool === 'Edit' || tool === 'Write') return !inside(cwd, input.file_path);
  return mcp(tool) || tool === 'scheduler_create';
}

function inside(cwd, file) {
  if (!cwd || typeof file !== 'string' || !file) return false;
  const full = path.resolve(cwd, file);
  const rel = path.relative(path.resolve(cwd), full);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Commands that only look. Anything else, or anything these are given a way to
// run something else with, is a card.
const LOOK_HEADS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'pwd', 'echo', 'grep', 'egrep', 'fgrep', 'rg', 'which', 'whoami',
  'date', 'file', 'stat', 'du', 'df', 'tree', 'sort', 'uniq', 'cut', 'tr', 'diff', 'cmp', 'basename',
  'dirname', 'realpath', 'jq', 'cd', 'true', 'test', '[',
]);
const LOOK_GIT = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'blame', 'describe', 'shortlog', 'grep']);

export function lookOnlyCommand(command) {
  const c = command.trim();
  if (!c) return false;
  // Ways to run a second command inside the first, or to write a file.
  if (/\$\(|`|<\(|>\(/.test(c)) return false;
  const withoutNull = c.replace(/\d?>\s*\/dev\/null/g, '').replace(/2>&1/g, '');
  if (/>/.test(withoutNull)) return false;
  return c.split(/&&|\|\||;|\||\n/).every((piece) => lookOnlyStep(piece.trim()));
}

function lookOnlyStep(step) {
  if (!step) return true;
  const words = step.split(/\s+/);
  const head = words[0];
  if (/^[A-Z_][A-Z0-9_]*=/.test(head)) return false; // an env assignment in front of a command
  if (words.length === 2 && ['--version', '-v', '-V', 'version'].includes(words[1])) return true;
  if (head === 'git') {
    const sub = words.find((w, i) => i > 0 && !w.startsWith('-'));
    if (sub === 'branch') return words.slice(2).every((w) => ['-a', '-r', '-v', '-vv', '--list', '--show-current'].includes(w));
    if (sub === 'remote') return words.slice(2).every((w) => w === '-v');
    return LOOK_GIT.has(sub);
  }
  if (head === 'find') return !words.some((w) => ['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprintf', '-fls'].includes(w));
  if (head === 'sed') return words.includes('-n') && !words.some((w) => w.startsWith('-i') || w === '--in-place');
  return LOOK_HEADS.has(head);
}
