// SYNTHETIC TESTERS RUN ON CODEX, NEVER ON CLAUDE CODE (2026-11-08).
//
// The person keeps a Codex plan for testing only, so every synthetic user,
// in a power test or the product loop, is `codex exec` on that plan's login.
// This file is the one place that knows how one starts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// A paid plan name this list does not know is most likely the newest one bought,
// so it ranks above Plus.
const PLAN_RANK = { free: 0, go: 1, plus: 2, team: 3, business: 3, enterprise: 3, edu: 3, pro: 4 };
const UNKNOWN_PAID = 3;

export const planRank = (plan) => (plan == null ? -1 : PLAN_RANK[plan] ?? UNKNOWN_PAID);

/** The ChatGPT plan a Codex login is on, read from its own sign-in, or null. */
export function planOf(home) {
  try {
    const auth = JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8'));
    for (const key of ['id_token', 'access_token']) {
      let jwt = auth?.tokens?.[key];
      if (jwt && typeof jwt === 'object') jwt = jwt.raw_jwt;
      if (typeof jwt !== 'string' || jwt.split('.').length < 2) continue;
      const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
      const plan = claims?.['https://api.openai.com/auth']?.chatgpt_plan_type;
      if (typeof plan === 'string' && plan) return plan.toLowerCase();
    }
  } catch { /* no login there */ }
  return null;
}

/** Every Codex login in the home folder: ~/.codex and ~/.codex-<anything>. */
export function codexLogins(homeDir = os.homedir()) {
  let names = [];
  try { names = fs.readdirSync(homeDir); } catch { return []; }
  return names
    .filter((n) => n === '.codex' || n.startsWith('.codex-'))
    .map((n) => path.join(homeDir, n))
    .filter((dir) => fs.existsSync(path.join(dir, 'auth.json')))
    .map((dir) => ({ home: dir, plan: planOf(dir) }));
}

/**
 * The login testers spend: the one named, or else the one on the best plan.
 * Ties go to the folder name that sorts first, so the choice is the same every run.
 */
export function testerLogin({ given = null, homeDir = os.homedir(), logins = null } = {}) {
  if (given) {
    const home = String(given).replace(/^~(?=\/|$)/, homeDir);
    return { home, plan: planOf(home), why: 'named' };
  }
  const all = (logins ?? codexLogins(homeDir)).slice().sort((a, b) => planRank(b.plan) - planRank(a.plan) || a.home.localeCompare(b.home));
  if (!all.length) return null;
  return { ...all[0], why: all.length > 1 ? `the best plan of ${all.length} Codex logins` : 'the only Codex login' };
}

/**
 * Whether Codex can sandbox a command here. It cannot inside some containers
 * (the Agentbox cloud's bwrap is refused), and there the machine itself is the
 * throwaway, so testers run without Codex's own sandbox.
 */
export function codexCanSandbox({ run = spawnSync } = {}) {
  const r = run('codex', ['sandbox', '--', 'true'], { encoding: 'utf8', timeout: 30_000 });
  return r.status === 0;
}

/**
 * How one tester stretch starts. Its log is kept (no --ephemeral): the
 * product loop's pacer reads the plan's week from it. Nothing here may name
 * the app copy's folder: a power test's sleep stops every process that does.
 */
export function codexTesterArgv({ dir, prompt, last, model = null, sandboxed = true }) {
  return [
    'exec', '-C', dir, '--skip-git-repo-check', '-o', last,
    ...(sandboxed
      ? ['-s', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true']
      : ['--dangerously-bypass-approvals-and-sandbox']),
    ...(model ? ['-m', model] : []),
    prompt,
  ];
}

// `codex login status` sends no request, so it says signed in for a sign-in
// OpenAI refuses. One tiny real request is the check.
export const CODEX_CHECK_ARGV = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-c', 'model_reasoning_effort=low', 'Reply with the single word: ok'];
const REFUSED = /\b401\b|unauthorized|token_expired|refresh_token_|sign in again|log in again|not logged in|not signed in/i;

/** Null when the check answered, else the one sentence the script stops with. */
export function codexCheckFailed({ code, out }, { home, onCloud = false }) {
  if (code === 0) return null;
  const said = String(out || '').trim().replace(/\s+/g, ' ').slice(-300);
  if (!REFUSED.test(said)) return `the testers' Codex at ${home} could not answer one request: "${said}".`;
  return `OpenAI refuses the testers' Codex sign-in at ${home} ("${said}"), even though \`codex login status\` says signed in. `
    + (onCloud
      ? 'This is the cloud\'s Codex sign-in: a sign-in made on this machine is lost when it goes, so it needs Sign in again in the cloud menu on the computer. Until then, run the testers on the computer.'
      : `Sign it in again (CODEX_HOME=${home} codex login) or name another with --codex-home.`);
}

/** A tester's environment: the chosen login, and no API key, so it spends the plan and nothing else. */
export function codexTesterEnv(base, home) {
  const env = {};
  for (const [k, v] of Object.entries(base)) if (!/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_HOME)$/.test(k)) env[k] = v;
  if (home) env.CODEX_HOME = home;
  return env;
}

/** Codex's last message for a stretch, which its -o file holds. */
export function lastMessage(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}
