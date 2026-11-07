// WHICH NAMES A KEY SAVED FOR CLOUD RUNS MAY HAVE. Shared by the Mac, which
// refuses to save one, and the sandbox, which refuses to place one, so a key
// can never stand in for the agent's own sign-in or bill it to an API key
// (CLAUDE.md, Billing), nor change how the machine finds its programs.
const SHAPE = /^[A-Z][A-Z0-9_]{1,79}$/;
const ENGINE = /^(?:ANTHROPIC|CLAUDE|CODEX|AGENTBOX|ZERO)_/;
const RESERVED = new Set([
  'OPENAI_API_KEY', 'OPENAI_BASE_URL',
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'PWD', 'TERM', 'LANG',
  'NODE_OPTIONS', 'NODE_PATH', 'PYTHONPATH', 'PYTHONHOME', 'BROWSER', 'EDITOR',
  'GIT_DIR', 'GIT_WORK_TREE', 'SSH_AUTH_SOCK', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
]);
const SYSTEM = /^(?:LD_|DYLD_|LC_|GIT_CONFIG|NPM_CONFIG_)/;

/** Why a key cannot be saved under `name`, or null when it can. */
export function keyNameRefused(name) {
  const n = String(name ?? '');
  if (!SHAPE.test(n)) return 'A key’s name is capital letters, digits and underscores, starting with a letter, like SUPABASE_ACCESS_TOKEN.';
  if (ENGINE.test(n) || n === 'OPENAI_API_KEY' || n === 'OPENAI_BASE_URL') return `${n} is read by Claude Code or Codex themselves, so it is never handed to an agent.`;
  if (RESERVED.has(n) || SYSTEM.test(n)) return `${n} is the machine’s own setting, so a key cannot take that name.`;
  return null;
}

// Values shorter than this are not hidden from what a run prints: hiding
// "abc" would cut every word with it in. A real key is longer.
export const HIDE_FROM = 8;
export const KEY_VALUE_MAX = 16_384;
