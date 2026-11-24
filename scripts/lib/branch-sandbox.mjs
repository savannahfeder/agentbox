#!/usr/bin/env node
// A branch's own code at ship (its tests, and the install of its packages) runs
// inside the Mac's sandbox, because a worker wrote that code and the push hooks
// run it as the person. Outside the sandbox it could read the person's keys,
// rewrite the app folder's ship scripts or ~/.gitconfig, and so take the GitHub
// sign-in on the next ship.
//
//   node branch-sandbox.mjs [--download | --build] [--write DIR]... -- <command> [args...]
//
// It may write only the task folder (never its .git, and its node_modules only
// to install), its own temp folder, what --write names and what it adds to
// /tmp; read no file in the home folder but the app folder, git's settings,
// Node and the browser cache; reach no other computer, no port or socket that
// was open before it started, and no keychain, open, osascript or ssh. The
// environments of the person's other processes stay readable, since no rule
// hides them, which is why nothing it reads has a way out.
//
// Installing is two stages. --download is npm alone fetching the lockfile's
// packages, with the internet and no install script; --build runs the install
// scripts with neither. Only a Mac has the sandbox; anywhere else the command
// runs as it is.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

// Names whose values are sign-ins. The branch's code gets none of them.
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|SIGN_IN|AUTH_SOCK)/i;
const SECRET_PREFIX = /^(GH|GITHUB|AWS|ANTHROPIC|OPENAI|STRIPE|SUPABASE|NPM|VERCEL|NETLIFY|CLOUDFLARE|SSH|ELEVENLABS|GOOGLE)_/i;

// Kept out of git in a checkout, and not the branch's to read.
const PRIVATE_FILES = ['cloud/team.config.json', 'zero.config.json', '.env', '.env.local'];

// npm's cache for sandboxed installs. The shared one (~/.npm, which also holds
// what npx runs) is used outside any sandbox, so the branch may not write it.
export const branchCaches = (home) => path.join(home, 'Library', 'Caches', 'agentbox-branch');
// Electron's install script finds its binary here; offline, it may only read.
const electronCache = (home) => path.join(home, 'Library', 'Caches', 'electron');

// What a test run may still write under node_modules: vite's and vitest's caches.
const TEST_CACHES = ['.vite', '.vitest', '.cache'];

const q = (s) => `"${String(s).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const subpaths = (dirs) => dirs.map((d) => ` (subpath ${q(d)})`).join('');

/** The environment the branch's code gets: no sign-ins, its own temp folder and caches. */
export function sandboxedEnv(env, tmp, { stage = 'tests', home = os.homedir() } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (SECRET_NAME.test(k) || SECRET_PREFIX.test(k) || /^(npm_config_|electron_config_)/i.test(k)) continue;
    out[k] = v;
  }
  // ~/.npmrc holds the person's npm sign-in; npm reads an empty one instead.
  const npmrc = path.join(tmp, 'npmrc');
  fs.writeFileSync(npmrc, '');
  return {
    ...out,
    TMPDIR: `${tmp}/`,
    AGENTBOX_BRANCH_SANDBOX: '1',
    npm_config_userconfig: npmrc,
    npm_config_logs_dir: path.join(tmp, 'npm-logs'),
    npm_config_cache: path.join(stage === 'tests' ? tmp : branchCaches(home), 'npm'),
    electron_config_cache: stage === 'build' ? electronCache(home) : path.join(tmp, 'electron'),
    // The branch's own .npmrc can name the program npm runs for git; these beat it.
    ...(stage === 'download' ? { npm_config_ignore_scripts: 'true', npm_config_git: 'git' } : {}),
  };
}

// /tmp is where other programs keep their sockets, Claude in Chrome's and
// Codex's bridges to the person's browser among them. Tests make their own
// folders there (a socket's path has to be short), so the branch may add to
// /tmp, and may not touch or connect to anything that was there when it
// started, nor to these, whenever they appear.
const TMP = '/private/tmp';
const OTHERS_IN_TMP = /^\/private\/tmp\/(claude|codex|cc-|com\.apple\.|granola|\.X11|tmux)/;
const taken = (names) => names.map((n) => path.join(TMP, n)).map((p) => ` (literal ${q(p)}) (subpath ${q(p)})`).join('');

// The same for this Mac's own ports: the tests serve and call their own, and
// what was listening before they started is other programs'. An agent's
// headless browser or Codex's proxy would carry anything to the internet.
export function listening() {
  const out = execFileSync('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fn'], { encoding: 'utf8', timeout: 10_000 });
  return [...new Set(out.split('\n').filter((l) => l.startsWith('n')).map((l) => Number(l.slice(l.lastIndexOf(':') + 1))).filter((p) => p > 0))];
}

/**
 * The sandbox profile. Later rules win over earlier ones, but only between
 * rules of one kind: a `remote tcp` deny after a `remote ip` allow matched some
 * ports and not others, so the localhost allow and the port denies are both tcp.
 */
export function profile({ root, commonDir, home, tmp, node, writable = [], stage = 'tests', inTmp = [], ports = [] }) {
  const main = path.dirname(commonDir);
  const installing = stage !== 'tests';
  const caches = branchCaches(home);
  const others = `${taken(inTmp)} (regex #${q(OTHERS_IN_TMP.source)})`;
  return `(version 1)
(allow default)
(deny network-outbound)
(allow network-outbound (remote tcp "localhost:*") (remote udp "localhost:*"))
${ports.length ? `(deny network-outbound${ports.map((p) => ` (remote tcp "localhost:${p}")`).join('')})\n` : ''}(allow network-outbound${subpaths([root, tmp, TMP])} (literal "/private/var/run/mDNSResponder"))
(deny network-outbound${others})
${stage === 'download' ? '(allow network-outbound)\n' : ''}(deny file-write*)
(allow file-write*${subpaths([root, tmp, TMP, '/dev', ...writable, ...(stage === 'download' ? [caches] : [])])})
(deny file-write*${others})
${writable.length ? `(allow file-write*${subpaths(writable)})\n` : ''}${installing ? '' : `(deny file-write* (subpath ${q(path.join(root, 'node_modules'))}))
(allow file-write*${subpaths(TEST_CACHES.map((c) => path.join(root, 'node_modules', c)))})
`}(deny file-write* (literal ${q(path.join(root, '.git'))}) (subpath ${q(path.join(root, '.git'))}) (subpath ${q(commonDir)}) (subpath ${q(path.join(root, '.claude', 'skills', '.git'))}))
(deny file-read-data (subpath ${q(home)}))
(allow file-read-data${subpaths([main, node, path.join(home, 'Library', 'Caches', 'ms-playwright'), path.join(home, '.config', 'git'), ...writable, ...(installing ? [caches, electronCache(home)] : [])])} (literal ${q(path.join(home, '.gitconfig'))}) (literal ${q(path.join(home, '.agentbox', 'team.config.json'))}))
(deny file-read-data (subpath ${q(path.join(main, '.claude', 'worktrees'))}))
(allow file-read-data (subpath ${q(root)}))
(deny file-read-data${[root, main].flatMap((d) => PRIVATE_FILES.map((f) => ` (literal ${q(path.join(d, f))})`)).join('')})
(deny process-exec (literal "/usr/bin/open") (literal "/usr/bin/osascript") (literal "/usr/bin/security") (literal "/bin/launchctl") (literal "/usr/bin/sudo") (literal "/usr/bin/ssh") (subpath "/Applications") (subpath "/System/Applications"))
(allow process-exec (literal "/bin/ps") (with no-sandbox))
(deny mach-lookup (global-name "com.apple.SecurityServer") (global-name "com.apple.securityd") (global-name "com.apple.coreservices.launchservicesd") (global-name "com.apple.lsd.mapdb") (global-name "com.apple.lsd.modifydb") (global-name "com.apple.pasteboard.1") (global-name "com.apple.coreservices.appleevents"))
`;
}

// Git hands its hooks open files (a ship's sign-in rides on fd 3), and a child keeps any it inherits.
const CLOSE_INHERITED = 'for fd in 3 4 5 6 7 8 9; do eval "exec $fd>&-"; done; exec "$@"';

export function alreadySandboxed() {
  const r = spawnSync(SANDBOX_EXEC, ['-p', '(version 1)(allow default)', '/usr/bin/true'], { encoding: 'utf8' });
  return r.status !== 0 && /sandbox_apply/.test(r.stderr ?? '');
}

/** Runs `cmd args` as a branch's code is run at ship. Returns its exit status. */
export function runSandboxed(cmd, args, { cwd = process.cwd(), env = process.env, stage = 'tests', writable = [], timeout, platform = process.platform, stdio = 'inherit', home = os.homedir() } = {}) {
  if (platform !== 'darwin') {
    const r = spawnSync(cmd, args, { cwd, env, stdio, timeout, killSignal: 'SIGKILL' });
    return r.status ?? 1;
  }
  if (!fs.existsSync(SANDBOX_EXEC)) {
    console.error(`branch-sandbox: ${SANDBOX_EXEC} is missing, so the branch's code was not run.`);
    return 1;
  }
  // A sandbox cannot start inside another, and a test that runs a real ship is
  // inside one already: what it starts stays inside that one.
  if (alreadySandboxed()) {
    const r = spawnSync(cmd, args, { cwd, env, stdio, timeout, killSignal: 'SIGKILL' });
    return r.status ?? 1;
  }
  const root = real(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim());
  const commonDir = real(path.resolve(cwd, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim()));
  const inTmp = fs.readdirSync(TMP);
  // Short, because a socket's path may not pass 104 characters and the tests
  // put theirs in the temp folder.
  const tmp = real(fs.mkdtempSync(path.join(TMP, 'ab-')));
  const homeDir = real(home);
  if (stage === 'download') fs.mkdirSync(branchCaches(homeDir), { recursive: true });
  try {
    const text = profile({ root, commonDir, home: homeDir, tmp, node: real(path.dirname(path.dirname(process.execPath))), writable: writable.map(real), stage, inTmp, ports: listening() });
    const r = spawnSync(SANDBOX_EXEC, ['-p', text, '/bin/sh', '-c', CLOSE_INHERITED, 'sh', cmd, ...args], { cwd, env: sandboxedEnv(env, tmp, { stage, home: homeDir }), stdio, timeout, killSignal: 'SIGKILL' });
    return r.status ?? 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  let stage = 'tests';
  const writable = [];
  while (argv.length && argv[0] !== '--') {
    const flag = argv.shift();
    if (flag === '--download') stage = 'download';
    else if (flag === '--build') stage = 'build';
    else if (flag === '--write' && argv.length) writable.push(argv.shift());
    else { console.error(`branch-sandbox: unknown option ${flag}`); process.exit(2); }
  }
  argv.shift();
  if (!argv.length) { console.error('usage: branch-sandbox.mjs [--download | --build] [--write DIR]... -- <command> [args...]'); process.exit(2); }
  process.exit(runSandboxed(argv[0], argv.slice(1), { stage, writable }));
}
