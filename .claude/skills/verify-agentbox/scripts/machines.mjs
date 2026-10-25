// OTHER PEOPLE'S MACHINES, BUILT ON THIS ONE.
//
// Most of what breaks for a new user is not logic. It is where their Claude
// Code or Codex is installed, which shell they use, what PATH an app opened
// from the Dock sees, and whether their Node is somewhere a worker can find.
// None of that varies on the machine the code was written on, so the tests
// stay green while the bug ships.
//
// Each shape below is one such machine. `build(m)` lays it out under a
// throwaway root: a fake HOME, and a fake `/` (m.sys) standing in for the
// system folders the app looks in (/opt/homebrew, /usr/local). The checker
// then runs the APP'S OWN finders and worker setup against it, with an
// environment shaped like a Dock launch rather than inherited from whatever
// terminal ran the check.
//
// WHY A FAKE `/`: the finders look at absolute folders. Without one, this
// Mac's own installs answer for every shape and the check proves nothing about
// a Mac that has none. `virtual` below is the only way paths outside the fake
// home are read.
//
// The stubs are not Claude Code or Codex. A native install is a /bin/sh script
// (it needs nothing on PATH, like the real binary); an npm install is a
// `#!/usr/bin/env node` script (it needs `node` on PATH, like the real one).
// That difference is the whole point of several shapes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CLAUDE_VERSION = '2.1.999 (Claude Code)';
export const CODEX_VERSION = 'codex-cli 0.999.0';

// What an app opened from the Dock or Finder starts with on macOS (launchd).
export const DOCK_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
// Folders the OS itself owns. Everything else outside the fake home is read
// from the fake `/`, so a real /usr/local/bin/node cannot rescue a shape.
const OS_DIRS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin', '/System/', '/Library/Apple/', '/usr/libexec'];
const isOsDir = (p) => OS_DIRS.some((d) => (d.endsWith('/') ? p.startsWith(d) : p === d || p.startsWith(`${d}/`)));

const NATIVE = (version) => `#!/bin/sh
case "$1" in
  --version|-v) echo "${version}"; exit 0 ;;
  auth) exit 0 ;;
  login) exit 0 ;;
esac
echo "stub: $0 $*"; exit 0
`;
const NPM = (version) => `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === '--version' || a[0] === '-v') { console.log(${JSON.stringify(version)}); process.exit(0); }
console.log('stub: ' + a.join(' '));
`;

/**
 * THE SHAPES. `why` names the bug class it stands for; `expect` is what a
 * person on that machine needs to be true, not what the code happens to do.
 *
 *   files     [{ at, kind: 'native'|'npm'|'node'|'text'|'link'|'dir', engine, text, to }]
 *             `at` starting with `~/` is in the fake home, `/` is in the fake `/`.
 *   shell     the login shell ($SHELL)
 *   rc        { '.zshrc': '...' } profile files written into the fake home
 *   launch    extra variables in the launch environment
 *   platform  'darwin' unless it says 'linux' (a launcher entry, not the Dock)
 *   expect    { claude: { found, from?, certain? , runs? }, codex: {...}, scrubbed?: [names],
 *               bootPath?: [folders the app's PATH must hold],
 *               workerEnv?: { NAME: value every found engine's worker must be handed } }
 *   known     a product gap already understood. The shape still runs and prints
 *             KNOWN instead of FAIL, so the run stays usable as a gate while
 *             the gap waits on its own fix. Take it off when the fix lands.
 */
export const SHAPES = [
  {
    name: 'installer-defaults',
    why: 'Both tools from their own install scripts, opened from the Dock. The baseline every other shape differs from.',
    files: [
      { at: '~/.local/share/claude/versions/2.1.999', kind: 'native', engine: 'claude' },
      { at: '~/.local/bin/claude', kind: 'link', to: '~/.local/share/claude/versions/2.1.999' },
      { at: '~/.codex/packages/standalone/releases/0.999.0/bin/codex', kind: 'native', engine: 'codex' },
      { at: '~/.codex/packages/standalone/current', kind: 'link', to: '~/.codex/packages/standalone/releases/0.999.0' },
      { at: '~/.local/bin/codex', kind: 'link', to: '~/.codex/packages/standalone/current/bin/codex' },
    ],
    expect: { claude: { found: true, from: 'disk', runs: true }, codex: { found: true, from: 'disk', runs: true } },
  },
  {
    name: 'codex-npm-under-nvm',
    why: 'Codex from `npm i -g` under nvm, nvm loaded in .zshrc. The npm bin is `#!/usr/bin/env node`, and a Dock launch has no node on PATH.',
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '~/.nvm/versions/node/v22.14.0/bin/node', kind: 'node' },
      { at: '~/.nvm/versions/node/v22.14.0/bin/codex', kind: 'npm', engine: 'codex' },
    ],
    rc: { '.zshrc': 'export NVM_DIR="$HOME/.nvm"\nexport PATH="$NVM_DIR/versions/node/v22.14.0/bin:$PATH"\n' },
    // The shell, since the one finder asks the shell first (1cfdd62): this
    // .zshrc puts Codex on its PATH. The lazy shape below is the one only the
    // disk search can answer.
    expect: { claude: { found: true, from: 'disk', runs: true }, codex: { found: true, from: 'shell', runs: true } },
  },
  {
    name: 'codex-npm-under-nvm-lazy',
    why: 'Same Codex, but nvm is lazy-loaded so no shell profile puts node on PATH. Only the app can find the node beside Codex.',
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '~/.nvm/versions/node/v20.11.1/bin/node', kind: 'node' },
      { at: '~/.nvm/versions/node/v20.11.1/bin/codex', kind: 'npm', engine: 'codex' },
    ],
    rc: { '.zshrc': 'nvm() { unset -f nvm; . "$NVM_DIR/nvm.sh"; nvm "$@"; }\n' },
    expect: { claude: { found: true, runs: true }, codex: { found: true, runs: true } },
  },
  {
    name: 'claude-npm-under-nvm-lazy',
    why: 'Claude Code from npm under a lazy-loaded nvm. Since 2.1.x its postinstall swaps bin/claude.exe for the native binary, so it needs no node.',
    files: [
      { at: '~/.nvm/versions/node/v20.11.1/bin/node', kind: 'node' },
      { at: '~/.nvm/versions/node/v20.11.1/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe', kind: 'native', engine: 'claude' },
      { at: '~/.nvm/versions/node/v20.11.1/bin/claude', kind: 'link', to: '~/.nvm/versions/node/v20.11.1/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe' },
    ],
    rc: { '.zshrc': 'nvm() { unset -f nvm; . "$NVM_DIR/nvm.sh"; nvm "$@"; }\n' },
    expect: { claude: { found: true, from: 'disk', runs: true }, codex: { found: false, certain: true } },
  },
  {
    name: 'claude-old-npm-under-nvm-lazy',
    why: 'An npm Claude Code from before the native binary: bin/claude is `#!/usr/bin/env node`, and nothing puts node on a Dock launch\'s PATH. The worker needs the node beside it (main/claude-launch-env.mjs).',
    files: [
      { at: '~/.nvm/versions/node/v20.11.1/bin/node', kind: 'node' },
      { at: '~/.nvm/versions/node/v20.11.1/lib/node_modules/@anthropic-ai/claude-code/cli.js', kind: 'npm', engine: 'claude' },
      { at: '~/.nvm/versions/node/v20.11.1/bin/claude', kind: 'link', to: '~/.nvm/versions/node/v20.11.1/lib/node_modules/@anthropic-ai/claude-code/cli.js' },
    ],
    rc: { '.zshrc': 'nvm() { unset -f nvm; . "$NVM_DIR/nvm.sh"; nvm "$@"; }\n' },
    expect: { claude: { found: true, runs: true }, codex: { found: false, certain: true } },
  },
  {
    name: 'homebrew-apple-silicon',
    why: 'Both from Homebrew casks on Apple Silicon: /opt/homebrew/bin links into the Caskroom.',
    files: [
      { at: '/opt/homebrew/Caskroom/claude-code/2.1.999/claude', kind: 'native', engine: 'claude' },
      { at: '/opt/homebrew/bin/claude', kind: 'link', to: '/opt/homebrew/Caskroom/claude-code/2.1.999/claude' },
      { at: '/opt/homebrew/Caskroom/codex/0.999.0/bin/codex', kind: 'native', engine: 'codex' },
      { at: '/opt/homebrew/bin/codex', kind: 'link', to: '/opt/homebrew/Caskroom/codex/0.999.0/bin/codex' },
    ],
    expect: { claude: { found: true, from: 'disk', runs: true }, codex: { found: true, from: 'disk', runs: true } },
  },
  {
    name: 'homebrew-codex-mid-upgrade',
    why: 'brew upgrade in progress: /opt/homebrew/bin/codex points at a Caskroom version that is gone. The app must not tell them Codex is missing.',
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '/opt/homebrew/bin/codex', kind: 'link', to: '/opt/homebrew/Caskroom/codex/0.998.0/bin/codex' },
    ],
    expect: { claude: { found: true, runs: true }, codex: { found: false, certain: false } },
  },
  {
    name: 'intel-homebrew-and-npm',
    why: 'An Intel Mac: Homebrew and `npm -g` both write /usr/local/bin. npm Codex is a node script and needs the node beside it.',
    files: [
      { at: '/usr/local/bin/node', kind: 'node' },
      { at: '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe', kind: 'native', engine: 'claude' },
      { at: '/usr/local/bin/claude', kind: 'link', to: '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe' },
      { at: '/usr/local/lib/node_modules/@openai/codex/bin/codex.js', kind: 'npm', engine: 'codex' },
      { at: '/usr/local/bin/codex', kind: 'link', to: '/usr/local/lib/node_modules/@openai/codex/bin/codex.js' },
    ],
    expect: { claude: { found: true, from: 'disk', runs: true }, codex: { found: true, from: 'disk', runs: true } },
  },
  {
    name: 'only-on-the-shell-path',
    why: 'Claude Code somewhere no list covers, put on PATH by .zshrc. Only asking the login shell finds it.',
    files: [{ at: '~/tools/claude-code/bin/claude', kind: 'native', engine: 'claude' }],
    rc: { '.zshrc': 'export PATH="$HOME/tools/claude-code/bin:$PATH"\n' },
    expect: { claude: { found: true, from: 'shell', runs: true }, codex: { found: false, certain: true } },
  },
  {
    name: 'bash-user',
    why: 'Login shell is bash and PATH is set in .bash_profile, not .zshrc.',
    shell: '/bin/bash',
    files: [{ at: '~/opt/bin/claude', kind: 'native', engine: 'claude' }],
    rc: { '.bash_profile': 'export PATH="$HOME/opt/bin:$PATH"\n' },
    expect: { claude: { found: true, from: 'shell', runs: true }, codex: { found: false, certain: true } },
  },
  {
    name: 'noisy-zshrc',
    why: 'A .zshrc that prints a banner and a prompt line. The PATH the app reads back must not swallow the noise.',
    files: [{ at: '~/tools/bin/claude', kind: 'native', engine: 'claude' }],
    rc: { '.zshrc': 'echo "Welcome back!"\nprintf "%s\\n" "/not/a/path"\nexport PATH="$HOME/tools/bin:$PATH"\necho "done loading"\n' },
    expect: { claude: { found: true, from: 'shell', runs: true }, codex: { found: false, certain: true } },
  },
  {
    name: 'slow-shell-profile',
    why: 'A .zshrc slower than the app will wait. No shell answered, so the app must stay quiet rather than say "not installed".',
    files: [],
    rc: { '.zshrc': 'sleep 8\n' },
    expect: { claude: { found: false, certain: false }, codex: { found: false, certain: false } },
  },
  {
    name: 'slow-zshrc-homebrew-in-zprofile',
    why: 'A .zshrc slower than the app will wait, with Homebrew on PATH from .zprofile as its installer says. The app must still find what .zprofile gives and hand it to workers.',
    files: [{ at: '~/brew/bin/claude', kind: 'native', engine: 'claude' }],
    rc: { '.zprofile': 'export PATH="$HOME/brew/bin:$PATH"\n', '.zshrc': 'sleep 8\n' },
    expect: { claude: { found: true, from: 'shell', runs: true }, codex: { found: false, certain: false }, bootPath: ['~/brew/bin'] },
  },
  {
    name: 'tmux-autostart-in-zshrc',
    why: '`[ -z "$TMUX" ] && exec tmux` in .zshrc. With no terminal tmux exits 1 before the app\'s question runs, which read as "not installed" and lost the whole PATH.',
    files: [
      { at: '~/brew/bin/tmux', kind: 'text', text: '#!/bin/sh\necho "open terminal failed: not a terminal" >&2\nexit 1\n' },
      { at: '~/brew/bin/claude', kind: 'native', engine: 'claude' },
    ],
    rc: { '.zprofile': 'export PATH="$HOME/brew/bin:$PATH"\n', '.zshrc': '[ -z "$TMUX" ] && exec tmux\n' },
    expect: { claude: { found: true, from: 'shell', runs: true }, codex: { found: false, certain: false }, bootPath: ['~/brew/bin'] },
  },
  {
    name: 'tmux-autostart-tool-only-in-zshrc',
    why: 'The same tmux line, and Claude Code on PATH only through .zshrc. No shell the app can ask gets that far, so it must not be called missing.',
    files: [
      { at: '~/brew/bin/tmux', kind: 'text', text: '#!/bin/sh\necho "open terminal failed: not a terminal" >&2\nexit 1\n' },
      { at: '~/tools/bin/claude', kind: 'native', engine: 'claude' },
    ],
    rc: { '.zprofile': 'export PATH="$HOME/brew/bin:$PATH"\n', '.zshrc': 'export PATH="$HOME/tools/bin:$PATH"\n[ -z "$TMUX" ] && exec tmux\n' },
    expect: { claude: { found: false, certain: false }, codex: { found: false, certain: false } },
  },
  {
    name: 'exec-fish-in-zshrc',
    why: '`exec fish` at the end of .zshrc, fish reading its commands from a closed stdin and exiting 0 having printed nothing.',
    files: [
      { at: '~/brew/bin/fish', kind: 'text', text: '#!/bin/sh\ncat >/dev/null\nexit 0\n' },
      { at: '~/brew/bin/claude', kind: 'native', engine: 'claude' },
    ],
    rc: { '.zprofile': 'export PATH="$HOME/brew/bin:$PATH"\n', '.zshrc': 'exec fish\n' },
    expect: { claude: { found: true, from: 'shell', runs: true }, codex: { found: false, certain: false }, bootPath: ['~/brew/bin'] },
  },
  {
    name: 'company-proxy-in-zshrc',
    why: 'HTTPS_PROXY and the company certificate exported in .zshrc, where Claude Code\'s own error says to put them. A Dock launch never sees them, and without them every request fails.',
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '~/.local/bin/codex', kind: 'native', engine: 'codex' },
      { at: '~/certs/corp.pem', kind: 'text', text: 'not a real certificate\n' },
    ],
    rc: { '.zshrc': 'export HTTPS_PROXY=http://proxy.corp.test:3128\nexport NO_PROXY=localhost,127.0.0.1\nexport NODE_EXTRA_CA_CERTS="$HOME/certs/corp.pem"\n' },
    expect: {
      claude: { found: true, runs: true }, codex: { found: true, runs: true },
      workerEnv: { HTTPS_PROXY: 'http://proxy.corp.test:3128', NO_PROXY: 'localhost,127.0.0.1', NODE_EXTRA_CA_CERTS: '~/certs/corp.pem' },
    },
  },
  {
    name: 'dock-launch-has-no-language',
    why: 'launchd hands a Dock app no LANG (read off a real Dock-launched Electron app). Without one, Ruby reads files as US-ASCII and sed counts bytes, unlike the person\'s own Terminal.',
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '~/.local/bin/codex', kind: 'native', engine: 'codex' },
    ],
    // Which UTF-8 depends on this Mac's /etc/zprofile, which the fake root does
    // not replace: macOS 26 sets C.UTF-8 there, and the app's own fallback is
    // en_US.UTF-8. Either is what the person needs.
    expect: { claude: { found: true, runs: true }, codex: { found: true, runs: true }, workerEnv: { LANG: /\.UTF-8$/ } },
  },
  {
    name: 'linux-launcher-nvm-in-bashrc',
    why: 'Linux, started from the launcher entry. The desktop session read ~/.profile without -i, so the nvm lines in ~/.bashrc (below Ubuntu\'s interactive guard) never reached it.',
    platform: 'linux',
    shell: '/bin/bash',
    launch: { PATH: '/usr/local/bin:/usr/bin:/bin' },
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '~/.nvm/versions/node/v22.14.0/bin/node', kind: 'node' },
      { at: '~/.nvm/versions/node/v22.14.0/bin/codex', kind: 'npm', engine: 'codex' },
    ],
    rc: {
      '.profile': 'if [ -n "$BASH_VERSION" ]; then\n  [ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"\nfi\n',
      '.bashrc': 'case $- in\n  *i*) ;;\n  *) return;;\nesac\nexport NVM_DIR="$HOME/.nvm"\nexport PATH="$NVM_DIR/versions/node/v22.14.0/bin:$PATH"\n',
    },
    expect: { claude: { found: true, runs: true }, codex: { found: true, from: 'shell', runs: true }, bootPath: ['~/.nvm/versions/node/v22.14.0/bin'] },
  },
  {
    name: 'claude-only-inside-the-desktop-app',
    why: 'Claude Code only as the copy the Claude desktop app keeps for itself.',
    files: [{ at: '~/Library/Application Support/Claude/claude-code/2.1.999/claude.app/Contents/MacOS/claude', kind: 'native', engine: 'claude' }],
    expect: { claude: { found: true, from: 'app', runs: true }, codex: { found: false, certain: true } },
  },
  {
    name: 'codex-home-moved',
    why: 'CODEX_HOME exported in .zshrc. A Dock launch never sees it, so the app has to ask the shell where Codex keeps its sessions.',
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '~/.local/bin/codex', kind: 'native', engine: 'codex' },
      { at: '~/work/codex-home/sessions', kind: 'dir' },
    ],
    rc: { '.zshrc': 'export CODEX_HOME="$HOME/work/codex-home"\n' },
    expect: { claude: { found: true, runs: true }, codex: { found: true, runs: true }, shellDirs: { CODEX_HOME: '~/work/codex-home' } },
  },
  {
    name: 'claude-config-dir-moved',
    why: 'CLAUDE_CONFIG_DIR exported in .zshrc (a second Claude account, or a tidy home). A Dock launch never sees it, so the app has to ask the shell, or it reads the wrong login and the wrong sessions.',
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '~/.claude-work/projects', kind: 'dir' },
    ],
    rc: { '.zshrc': 'export CLAUDE_CONFIG_DIR="$HOME/.claude-work"\n' },
    expect: { claude: { found: true, runs: true }, codex: { found: false, certain: true }, shellDirs: { CLAUDE_CONFIG_DIR: '~/.claude-work' } },
  },
  {
    name: 'space-in-the-home-folder',
    why: 'A home folder with a space in it, and npm Codex under nvm. Anything that splits or forgets to quote a path breaks here.',
    home: 'Jo Tester',
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '~/.nvm/versions/node/v22.14.0/bin/node', kind: 'node' },
      { at: '~/.nvm/versions/node/v22.14.0/bin/codex', kind: 'npm', engine: 'codex' },
    ],
    expect: { claude: { found: true, runs: true }, codex: { found: true, runs: true } },
  },
  {
    name: 'api-keys-in-the-launch-environment',
    why: 'Agentbox started from a terminal that exports API keys. Workers bill the subscription, so no key may reach one.',
    files: [
      { at: '~/.local/bin/claude', kind: 'native', engine: 'claude' },
      { at: '~/.local/bin/codex', kind: 'native', engine: 'codex' },
    ],
    launch: { ANTHROPIC_API_KEY: 'sk-ant-verify-not-real', OPENAI_API_KEY: 'sk-verify-not-real', CLAUDE_CODE_USE_BEDROCK: '1' },
    expect: {
      claude: { found: true, runs: true }, codex: { found: true, runs: true },
      scrubbed: { claude: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_USE_BEDROCK'], codex: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] },
    },
  },
];

/** One shape laid out on disk. Returns everything the checker needs to read it. */
export function build(shape, { root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-verify-machine-')) } = {}) {
  const home = path.join(root, shape.home ?? 'tester');
  const sys = path.join(root, 'sys');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(sys, { recursive: true });
  const real = (p) => (p.startsWith('~/') ? path.join(home, p.slice(2)) : path.join(sys, p));
  for (const f of shape.files ?? []) {
    const at = real(f.at);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    if (f.kind === 'dir') { fs.mkdirSync(at, { recursive: true }); continue; }
    if (f.kind === 'link') { fs.symlinkSync(real(f.to), at); continue; }
    if (f.kind === 'node') { fs.symlinkSync(process.execPath, at); continue; }
    const version = f.engine === 'codex' ? CODEX_VERSION : CLAUDE_VERSION;
    const text = f.kind === 'npm' ? NPM(version) : f.kind === 'native' ? NATIVE(version) : (f.text ?? '');
    fs.writeFileSync(at, text, { mode: 0o755 });
  }
  for (const [name, text] of Object.entries(shape.rc ?? {})) fs.writeFileSync(path.join(home, name), text);

  const inHome = (p) => p === home || p.startsWith(home + path.sep);
  /** Where the app's view of `p` really is on this disk. */
  const toReal = (p) => (inHome(p) || isOsDir(p) ? p : path.join(sys, p));
  const virtual = {
    exists: (p) => fs.existsSync(toReal(p)),
    readdir: (dir) => { try { return fs.readdirSync(toReal(dir)); } catch { return []; } },
    dangles: (p) => { try { return !!fs.lstatSync(toReal(p)) && !fs.existsSync(toReal(p)); } catch { return false; } },
    executable: (p) => { try { fs.accessSync(toReal(p), fs.constants.X_OK); return fs.statSync(toReal(p)).isFile(); } catch { return false; } },
  };
  /** A PATH the app computed, made spawnable: each folder read through the fake `/`. */
  const realPath = (value) => String(value ?? '').split(':').filter(Boolean).map(toReal).join(':');

  // The environment a Dock launch hands the app: launchd's, and nothing from
  // the terminal this check happens to run in. NO LANG: it used to say
  // en_US.UTF-8 here, and a real Dock-launched Electron app has none (read off
  // one with `ps eww`, 2026-10-15), so every shape was hiding that.
  const launchEnv = {
    HOME: home,
    CFFIXED_USER_HOME: home,
    USER: 'tester',
    LOGNAME: 'tester',
    SHELL: shape.shell ?? '/bin/zsh',
    PATH: DOCK_PATH,
    TMPDIR: os.tmpdir(),
    ...(shape.launch ?? {}),
  };
  return { shape, root, home, sys, toReal, realPath, virtual, launchEnv, platform: shape.platform ?? 'darwin', tilde: (p) => (p && inHome(p) ? `~/${path.relative(home, p)}` : p) };
}
