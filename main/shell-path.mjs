// Finder launches inherit launchd's PATH rather than the user's shell tools.
// Read only named variables: importing a profile's whole environment would
// import keys and login overrides too. PATH, the two folders below, and the
// network and locale names under NETWORK and LOCALE are all that is ever read,
// and workers still pass through their billing scrub.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// The shell a person actually has. `$SHELL` when that file exists, then zsh,
// bash, and sh. A machine with no zsh used to spawn `/bin/zsh`: the terminal
// never came up, and the self-update never built.
export function loginShell(env = process.env, exists = fs.existsSync) {
  const preferred = env.SHELL;
  if (preferred && exists(preferred)) return preferred;
  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (exists(candidate)) return candidate;
  }
  return preferred || '/bin/sh';
}

const MARKER = '\0agentbox-path\0';
function runShell(file, args, options) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin?.end();
  });
}

/**
 * WHICH SHELLS ARE ASKED, IN ORDER, AND WHY THERE IS MORE THAN ONE (2026-10-15).
 *
 *  Their own, interactive and login, first: that is the one that reads .zshrc,
 *  where nvm and most PATH lines live.
 *
 *  Then their own again as a login shell that is NOT interactive, which reads
 *  .zprofile and skips .zshrc. Measured with the real /bin/zsh: a .zshrc that
 *  runs `[ -z "$TMUX" ] && exec tmux` (tmux exits 1 with no terminal) or
 *  `exec fish` (exits 0 having read nothing) ended the shell before our
 *  printf, and the app fell back to launchd's four folders, losing the
 *  Homebrew line that .zprofile carries. Asking again without -i keeps it. A
 *  .zshrc slower than five seconds lands here too.
 *
 *  Last, the system's own shell, when theirs is something else: a shell that
 *  cannot speak `printf ... "$PATH"` (nushell hands back the words `$PATH`)
 *  is a fact about that shell, not about where their tools are. The program
 *  finder (main/engine-bin.mjs shellProbes) falls back the same way.
 */
export function loginShellAttempts(env = process.env, platform = process.platform) {
  const system = platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
  const theirs = env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  const out = [[theirs, '-ilc', 5000], [theirs, '-lc', 2500]];
  if (system !== theirs) out.push([system, '-ilc', 2500]);
  return out;
}

/** The first attempt whose output `read` accepts; the first failure otherwise. */
async function askLoginShell({ env, platform, run, script, read }) {
  let first = null;
  for (const [shell, flags, timeout] of loginShellAttempts(env, platform)) {
    try {
      const stdout = String(await run(shell, [flags, script(shell)], {
        // SIGKILL: a shell's exit hook can outlive SIGTERM (main/engine-bin.mjs).
        env: { ...env }, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 64 * 1024,
      }));
      return read(stdout);
    } catch (error) {
      first ??= error;
    }
  }
  throw first;
}

const isFish = (shell) => path.basename(shell) === 'fish';

/**
 * WHERE THE SHELL SAYS CLAUDE CODE AND CODEX KEEP THEIR SESSIONS (w-e46f2e9cea).
 *
 *  An app opened from the Dock, or from a Linux launcher entry, never sees what
 *  a shell profile exports, so a CLAUDE_CONFIG_DIR or CODEX_HOME set there was
 *  invisible to the import unless the folder happened to be named
 *  ~/.claude-<name>. These two names and nothing else are read, the same way
 *  PATH is above, and they are handed to the session finder rather than put
 *  into the app's environment: CLAUDE_CONFIG_DIR there would change which
 *  account every worker runs on.
 *
 *  Only an absolute path is kept. A quoted `~` the shell did not expand is
 *  expanded here; anything else, or no answer at all, is left out. */
const DIRS_MARKER = '\0agentbox-dirs\0';
const DIRS = ['CLAUDE_CONFIG_DIR', 'CODEX_HOME'];

/**
 * HOW THIS MACHINE REACHES THE NETWORK, WHEN ONLY THE SHELL PROFILE SAYS (2026-10-15).
 *
 *  Behind a company proxy, people export HTTPS_PROXY and the company's
 *  certificate (NODE_EXTRA_CA_CERTS) in .zshrc, which is where Claude Code's
 *  own error tells them to. A Dock launch never sees it. Measured with the real
 *  Claude Code 2.1.301 against a stub model behind a CONNECT proxy and a
 *  self-signed certificate: with both variables it answered in 240 ms; with no
 *  proxy variable it retried for minutes (10 retries, about three) and failed;
 *  with the proxy and no certificate it died in 371 ms on "Self-signed
 *  certificate detected". So a worker started by the app failed on exactly the
 *  machine where the person's terminal worked.
 *
 *  None of these is a key or a login, so the billing scrub has nothing to say
 *  about them, and they go into the app's own environment where every worker,
 *  terminal and git call inherits them. A name the launch environment already
 *  has is left alone, and the proxies are one setting: if any proxy name is
 *  already set, none is added.
 */
const PROXIES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'];
const CERTIFICATES = ['NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE'];

/**
 * THE LANGUAGE SETTING A DOCK LAUNCH DOES NOT HAVE (2026-10-15).
 *
 *  launchd gives an app no LANG and no LC_*: read off a running Dock-launched
 *  Electron app with `ps eww`, and off a bare Electron started with launchd's
 *  environment (process.env.LANG undefined, and none in its children).
 *  Terminal.app sets LANG itself, so the person's own commands always had one
 *  and their agents never did. Measured on this Mac with LANG unset: system
 *  Ruby reads files as US-ASCII (what CocoaPods and fastlane refuse to run
 *  under), `sed 's/./X/g'` turns "café" into five X's, `wc -m` counts five.
 *
 *  So the shell's own, when it has one. On macOS 26 that is usually Apple's:
 *  /etc/zprofile exports LANG=C.UTF-8 when nothing else has, so a zsh login
 *  answers C.UTF-8 (measured on this Mac), which fixes both of the above and
 *  keeps every tool's messages in the English the app reads. Otherwise, on a
 *  Mac only, en_US.UTF-8, which exists on every macOS and is what Terminal
 *  sets for most people. Linux sessions set their own.
 */
const LOCALE = ['LANG', 'LC_ALL', 'LC_CTYPE'];
const MAC_LOCALE = 'en_US.UTF-8';

const SETTINGS = [...DIRS, ...PROXIES, ...CERTIFICATES, ...LOCALE];

/** Everything above from one login shell, as { dirs, network, locale }. */
export async function readShellSettings({ env = process.env, platform = process.platform, run = runShell } = {}) {
  const none = { dirs: {}, network: {}, locale: {} };
  if (platform !== 'darwin' && platform !== 'linux') return none;
  const script = () => `printf '\\0agentbox-dirs\\0${'%s\\0'.repeat(SETTINGS.length)}' ${SETTINGS.map((n) => `"$${n}"`).join(' ')}`;
  const read = (stdout) => {
    const start = stdout.lastIndexOf(DIRS_MARKER);
    if (start < 0) throw Error('Your shell did not answer.');
    return stdout.slice(start + DIRS_MARKER.length).split('\0');
  };
  let values;
  try {
    values = await askLoginShell({ env, platform, run, script, read });
  } catch {
    return none;
  }
  const raw = Object.fromEntries(SETTINGS.map((name, i) => [name, String(values[i] ?? '').trim()]));
  const single = (v) => v && !/[\r\n]/.test(v);
  const folder = (v) => {
    if (!single(v)) return null;
    if (v === '~' || v.startsWith('~/')) {
      if (!env.HOME) return null;
      v = path.join(env.HOME, v.slice(1));
    }
    return path.isAbsolute(v) ? v : null;
  };
  const out = { dirs: {}, network: {}, locale: {} };
  for (const name of DIRS) if (folder(raw[name])) out.dirs[name] = folder(raw[name]);
  for (const name of PROXIES) if (single(raw[name])) out.network[name] = raw[name];
  for (const name of CERTIFICATES) if (folder(raw[name])) out.network[name] = folder(raw[name]);
  for (const name of LOCALE) if (single(raw[name]) && /^[A-Za-z0-9_.@-]+$/.test(raw[name])) out.locale[name] = raw[name];
  return out;
}

export async function readShellDataDirs(opts = {}) {
  return (await readShellSettings(opts)).dirs;
}

/** What to add to a launch environment, given what the shell said. Never overwrites. */
export function launchAdditions({ network = {}, locale = {} } = {}, env = process.env, platform = process.platform) {
  const set = (name) => env[name] !== undefined && env[name] !== '';
  const add = {};
  if (!PROXIES.some(set)) for (const name of PROXIES) if (network[name]) add[name] = network[name];
  for (const name of CERTIFICATES) if (network[name] && !set(name)) add[name] = network[name];
  if (!LOCALE.some(set)) {
    for (const name of LOCALE) if (locale[name]) add[name] = locale[name];
    if (!LOCALE.some((n) => add[n]) && platform === 'darwin') add.LANG = MAC_LOCALE;
  }
  return add;
}

/**
 * What the shell answered, kept for the life of the app. Empty until it
 *  answers, which is long before setup reaches its last card.
 *
 *  AND THE NETWORK AND LANGUAGE SETTINGS ARE PUT INTO `into` (the app's own
 *  environment) here, because this is the one shell read that both the desktop
 *  (main/main.mjs) and the browser copy (bin/agentbox.mjs) wait for before the
 *  first worker starts. */
let shellDataEnv = {};
export const shellDataDirsNow = () => shellDataEnv;
export function learnShellDataDirs({ into = process.env, ...opts } = {}) {
  return readShellSettings(opts).then((found) => {
    shellDataEnv = found.dirs;
    Object.assign(into, launchAdditions(found, opts.env ?? process.env, opts.platform ?? process.platform));
    return found.dirs;
  });
}

export async function recoverShellPath({ env = process.env, platform = process.platform, run = runShell } = {}) {
  const original = env.PATH || '';
  // LINUX TOO (2026-10-15). A launcher entry starts the app with the desktop
  // session's environment, and that session read ~/.profile without -i, so
  // the nvm lines its installer writes into ~/.bashrc (behind Ubuntu's "if not
  // running interactively, return") never reached it. readShellDataDirs above
  // already asked on Linux for the same reason.
  if (platform !== 'darwin' && platform !== 'linux') return { path: original, error: null };
  const script = (shell) => `printf '\\0agentbox-path\\0%s\\0' ${isFish(shell) ? '(string join : $PATH)' : '"$PATH"'}`;
  const read = (stdout) => {
    // NUL framing keeps messages printed by .zshrc out of the returned PATH.
    const start = stdout.lastIndexOf(MARKER);
    const end = start < 0 ? -1 : stdout.indexOf('\0', start + MARKER.length);
    const recovered = end < 0 ? '' : stdout.slice(start + MARKER.length, end);
    if (!recovered || /[\r\n]/.test(recovered)) throw Error('Your shell did not return its command search path.');
    // Only absolute folders. A shell that does not expand "$PATH" hands the
    // words back, and a relative entry is a folder that moves with every cwd.
    const entries = recovered.split(':').filter((p) => p.startsWith('/'));
    if (!entries.length) throw Error('Your shell did not return its command search path.');
    return entries;
  };
  try {
    const recovered = await askLoginShell({ env, platform, run, script, read });
    const entries = [...new Set([...recovered, ...original.split(':')].filter(Boolean))];
    return { path: entries.join(':'), error: null };
  } catch (error) {
    return { path: original, error: String(error?.message || error) };
  }
}
