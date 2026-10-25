// A .ZSHRC THAT STARTS TMUX (OR ANOTHER SHELL) STILL GIVES WORKERS A PATH.
//
// WHAT BROKE. People who live in tmux put `[ -z "$TMUX" ] && exec tmux` in
// .zshrc, and people who prefer fish put `exec fish` there. The app reads PATH
// by running `zsh -ilc 'printf ...'`, and an interactive zsh reads .zshrc, so
// the exec replaced the shell before our question was asked. Measured
// 2026-10-15 with the real /bin/zsh and a stub tmux that does what tmux does
// without a terminal ("open terminal failed: not a terminal", exit 1), and a
// stub fish that reads its commands from the closed stdin and exits 0:
//
//   recoverShellPath   -> launchd's four folders, error set, in 226 ms and 193 ms
//                         (Homebrew's PATH in .zprofile was lost with it)
//   askShell('claude') -> { answered: true } with no path, for a claude that
//                         .zshrc puts on PATH: tmux's exit 1 read as the shell
//                         saying "not installed", which the setup screen says
//                         out loud.
//
// THE FIX. A probe that comes back without our marker never reached our
// command, so it is not an answer: the PATH read asks again as a login shell
// that is not interactive (.zprofile, not .zshrc), and the program finder's
// runner says "not reached" rather than "no".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { recoverShellPath } from '../main/shell-path.mjs';
import { askShell, shellRunner } from '../main/engine-bin.mjs';

const hasZsh = fs.existsSync('/bin/zsh');
const DOCK = '/usr/bin:/bin:/usr/sbin:/sbin';

const TMUX_WITHOUT_A_TERMINAL = '#!/bin/sh\necho "open terminal failed: not a terminal" >&2\nexit 1\n';
const FISH_READING_A_CLOSED_STDIN = '#!/bin/sh\ncat >/dev/null\nexit 0\n';

let home; let brew; let tools;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'zshrc-execs-'));
  brew = path.join(home, 'brew/bin');
  tools = path.join(home, 'tools/bin');
  fs.mkdirSync(brew, { recursive: true });
  fs.mkdirSync(tools, { recursive: true });
  fs.writeFileSync(path.join(brew, 'tmux'), TMUX_WITHOUT_A_TERMINAL, { mode: 0o755 });
  fs.writeFileSync(path.join(brew, 'fish'), FISH_READING_A_CLOSED_STDIN, { mode: 0o755 });
  // Where Homebrew's installer tells people to put it.
  fs.writeFileSync(path.join(home, '.zprofile'), `export PATH="${brew}:$PATH"\n`);
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

const zshrc = (tail) => fs.writeFileSync(path.join(home, '.zshrc'), `export PATH="${tools}:$PATH"\n${tail}`);
const envOf = () => ({ HOME: home, ZDOTDIR: home, SHELL: '/bin/zsh', PATH: DOCK, USER: 'tester' });
const tool = (dir, name) => fs.writeFileSync(path.join(dir, name), '#!/bin/sh\necho stub\n', { mode: 0o755 });

describe.skipIf(!hasZsh)('the PATH read, against a real zsh', () => {
  it.each([
    ['tmux that exits for want of a terminal', '[ -z "$TMUX" ] && exec tmux\n'],
    ['exec fish', 'exec fish\n'],
  ])('keeps what .zprofile put on PATH when .zshrc runs %s', async (_name, tail) => {
    zshrc(tail);
    const result = await recoverShellPath({ env: envOf(), platform: 'darwin' });
    expect(result.path.split(':')).toContain(brew);
    expect(result.path.split(':')).toEqual(expect.arrayContaining(DOCK.split(':')));
    expect(result.error).toBeNull();
  });

  it('does not ask twice when the interactive shell answers (a guarded autostart)', async () => {
    zshrc('if [[ -o interactive ]] && [ -t 1 ] && [ -z "$TMUX" ]; then exec tmux; fi\n');
    const asked = [];
    const run = (file, args, options) => { asked.push(args[0]); return import('node:child_process').then(({ execFile }) => new Promise((resolve, reject) => {
      const child = execFile(file, args, options, (error, stdout) => (error ? reject(error) : resolve(stdout)));
      child.stdin?.end();
    })); };
    const result = await recoverShellPath({ env: envOf(), platform: 'darwin', run });
    // .zshrc ran in full, so its folder is first, and the fallback never ran.
    expect(result.path.split(':')[0]).toBe(tools);
    expect(asked).toEqual(['-ilc']);
  });
});

describe.skipIf(!hasZsh)('the program finder, against a real zsh', () => {
  const ask = (bin = 'claude') => askShell({ env: envOf(), bin, run: shellRunner(envOf()) });

  it('does not call a tool missing when .zshrc execs tmux before the question', () => {
    tool(tools, 'claude'); // on PATH only through .zshrc, which tmux cut short
    zshrc('[ -z "$TMUX" ] && exec tmux\n');
    expect(ask()).toEqual({ path: null, answered: false });
  });

  it('does not call a tool missing when .zshrc execs fish', () => {
    tool(tools, 'claude');
    zshrc('exec fish\n');
    expect(ask()).toEqual({ path: null, answered: false });
  });

  it('still finds a tool .zprofile puts on PATH, past the tmux', () => {
    tool(brew, 'claude');
    zshrc('[ -z "$TMUX" ] && exec tmux\n');
    expect(ask()).toEqual({ path: path.join(brew, 'claude'), answered: true });
  });

  it('still says a tool is not installed on a plain profile that has none (must not go quiet)', () => {
    zshrc('');
    expect(ask('agentbox-no-such-tool')).toEqual({ path: null, answered: true });
  });

  it('still finds a tool through a profile that prints a banner', () => {
    tool(tools, 'claude');
    zshrc('echo "Welcome back"\n');
    expect(ask()).toEqual({ path: path.join(tools, 'claude'), answered: true });
  });
});

// NUSHELL, BY ITS QUOTING RULES (no nu on this Mac, so not run for real): a
// double-quoted "$PATH" is not expanded in nu, and the external printf it
// reaches prints the words. That came back as a PATH whose first folder was
// the text `$PATH`, with no error. Measured as far as this goes: the bytes nu
// would hand back are what /usr/bin/printf makes of the same arguments.
describe('a login shell that cannot print its PATH', () => {
  const literal = execFileSync('/usr/bin/printf', ['\\0agentbox-path\\0%s\\0', '$PATH'], { encoding: 'utf8' });

  it('is not taken, and the system shell is asked instead', async () => {
    const asked = [];
    const run = async (shell, args) => {
      asked.push(`${shell} ${args[0]}`);
      return shell === '/bin/zsh' ? '\0agentbox-path\0/opt/homebrew/bin:/usr/bin\0' : literal;
    };
    const result = await recoverShellPath({ env: { SHELL: '/opt/homebrew/bin/nu', PATH: DOCK }, platform: 'darwin', run });
    expect(result).toEqual({ path: `/opt/homebrew/bin:${DOCK}`, error: null });
    expect(asked).toEqual(['/opt/homebrew/bin/nu -ilc', '/opt/homebrew/bin/nu -lc', '/bin/zsh -ilc']);
  });

  it('keeps the launch PATH and says so when no shell can', async () => {
    const result = await recoverShellPath({ env: { SHELL: '/opt/homebrew/bin/nu', PATH: DOCK }, platform: 'darwin', run: async () => literal });
    expect(result.path).toBe(DOCK);
    expect(result.error).toMatch(/search path/);
  });

  it('keeps every absolute folder of a real answer, relative ones dropped', async () => {
    const run = async () => '\0agentbox-path\0/a/bin:bin:.:/b/bin\0';
    expect(await recoverShellPath({ env: { SHELL: '/bin/zsh', PATH: DOCK }, platform: 'darwin', run }))
      .toEqual({ path: `/a/bin:/b/bin:${DOCK}`, error: null });
  });
});

// The same rule with no zsh at all, so it holds on the Linux runner too: a
// "shell" that is really a profile ending the process, and one that runs what
// it is handed.
describe('the probe runner, by its exits', () => {
  const shell = (body) => {
    const file = path.join(home, `shell-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    return file;
  };
  const askOnly = (file, bin) => {
    const run = shellRunner({ PATH: DOCK });
    // Only the one shell: the system shells are made not to exist, so their
    // own answers cannot mix in.
    const gone = () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }); };
    return askShell({ env: { SHELL: file }, bin, run: (s, a, t) => (s === file ? run(s, a, t) : gone()) });
  };

  it('counts an exit 1 before our command ran as no answer', () => {
    expect(askOnly(shell('echo "open terminal failed: not a terminal" >&2; exit 1'), 'claude'))
      .toEqual({ path: null, answered: false });
  });

  it('counts an exit 0 that printed nothing of ours as no answer', () => {
    expect(askOnly(shell('exit 0'), 'claude')).toEqual({ path: null, answered: false });
  });

  it('counts a shell that ran the question and said no as an answer', () => {
    // Every probe is this shell, so every one of them said no.
    const sh = shell('shift; exec /bin/sh -c "$1"');
    const run = shellRunner({ PATH: DOCK });
    expect(askShell({ env: { SHELL: sh }, bin: 'agentbox-no-such-tool', run: (_s, a, t) => run(sh, a, t) }))
      .toEqual({ path: null, answered: true });
  });

  it('hands back only what the question printed, not the banner before it', () => {
    const sh = shell('shift; echo banner; echo /not/the/answer; exec /bin/sh -c "$1"');
    const run = shellRunner({ PATH: DOCK });
    expect(run(sh, ['-lic', 'echo /the/answer'], 4000).trim()).toBe('/the/answer');
  });
});
