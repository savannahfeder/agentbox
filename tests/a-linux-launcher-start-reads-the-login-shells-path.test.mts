// A LINUX LAUNCHER START READS THE LOGIN SHELL'S PATH.
//
// WHAT BROKE. recoverShellPath returned the inherited PATH untouched on every
// platform but macOS, so an app started from a Linux launcher entry ran its
// workers on the desktop session's PATH. That session read ~/.profile once, at
// login, WITHOUT -i, and the nvm installer writes its lines into ~/.bashrc
// below Ubuntu's `case $- in *i*) ;; *) return;; esac`. Measured 2026-10-15
// with the real bash and Ubuntu's own skeleton files: `bash -lc` (the
// session's read) has no nvm folder on PATH; `bash -ilc` (the app's read) has
// it. readShellDataDirs already asked on Linux for this reason; the PATH read
// did not.
//
// Windows is still left alone (tests/agents-can-use-the-tools-in-your-shell).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { recoverShellPath, loginShellAttempts } from '../main/shell-path.mjs';

const hasBash = fs.existsSync('/bin/bash');
const SESSION_PATH = '/usr/local/bin:/usr/bin:/bin';

// Ubuntu's /etc/skel, cut to the lines that decide this.
const UBUNTU_PROFILE = `if [ -n "$BASH_VERSION" ]; then
    if [ -f "$HOME/.bashrc" ]; then
        . "$HOME/.bashrc"
    fi
fi
if [ -d "$HOME/.local/bin" ] ; then
    PATH="$HOME/.local/bin:$PATH"
fi
`;
const UBUNTU_BASHRC = `case $- in
    *i*) ;;
      *) return;;
esac
HISTCONTROL=ignoreboth
`;
const NVM_LINES = 'export NVM_DIR="$HOME/.nvm"\nexport PATH="$NVM_DIR/versions/node/v22.14.0/bin:$PATH"\n';

let home; let nvmBin;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-launcher-'));
  nvmBin = path.join(home, '.nvm/versions/node/v22.14.0/bin');
  fs.mkdirSync(nvmBin, { recursive: true });
  fs.mkdirSync(path.join(home, '.local/bin'), { recursive: true });
  fs.writeFileSync(path.join(home, '.profile'), UBUNTU_PROFILE);
  fs.writeFileSync(path.join(home, '.bashrc'), UBUNTU_BASHRC + NVM_LINES);
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

const envOf = () => ({ HOME: home, SHELL: '/bin/bash', PATH: SESSION_PATH, USER: 'tester' });

describe.skipIf(!hasBash)('against a real bash with Ubuntu\'s profile files', () => {
  it('the desktop session itself never had nvm on PATH (the measurement)', () => {
    const session = execFileSync('/bin/bash', ['-lc', 'printf %s "$PATH"'], { env: envOf(), encoding: 'utf8' });
    expect(session.split(':')).toContain(path.join(home, '.local/bin'));
    expect(session.split(':')).not.toContain(nvmBin);
  });

  it('puts the nvm folder on the PATH a Linux launch hands its workers', async () => {
    const result = await recoverShellPath({ env: envOf(), platform: 'linux' });
    expect(result.error).toBeNull();
    expect(result.path.split(':')).toContain(nvmBin);
    expect(result.path.split(':')).toEqual(expect.arrayContaining(SESSION_PATH.split(':')));
  });

  it('adds nothing when .bashrc puts nothing on PATH (must not invent folders)', async () => {
    fs.writeFileSync(path.join(home, '.bashrc'), UBUNTU_BASHRC);
    const result = await recoverShellPath({ env: envOf(), platform: 'linux' });
    expect(result.path.split(':')).not.toContain(nvmBin);
  });
});

describe('which shell Linux asks', () => {
  const seen = (env) => {
    const asked = [];
    const run = async (shell, args) => { asked.push([shell, args[0]]); return `\0agentbox-path\0/from/${path.basename(shell)}\0`; };
    return recoverShellPath({ env, platform: 'linux', run }).then((r) => ({ asked, r }));
  };

  it('asks $SHELL, interactive and login, first', async () => {
    const { asked, r } = await seen({ SHELL: '/usr/bin/zsh', PATH: SESSION_PATH });
    expect(asked).toEqual([['/usr/bin/zsh', '-ilc']]);
    expect(r).toEqual({ path: `/from/zsh:${SESSION_PATH}`, error: null });
  });

  it('asks /bin/sh when there is no $SHELL', async () => {
    const { asked } = await seen({ PATH: SESSION_PATH });
    expect(asked[0]).toEqual(['/bin/sh', '-ilc']);
  });

  it('falls back to bash, not to the Mac\'s zsh', () => {
    expect(loginShellAttempts({ SHELL: '/usr/bin/fish' }, 'linux').map(([s, f]) => `${s} ${f}`))
      .toEqual(['/usr/bin/fish -ilc', '/usr/bin/fish -lc', '/bin/bash -ilc']);
    expect(loginShellAttempts({ SHELL: '/bin/bash' }, 'linux').map(([s]) => s)).toEqual(['/bin/bash', '/bin/bash']);
  });
});
