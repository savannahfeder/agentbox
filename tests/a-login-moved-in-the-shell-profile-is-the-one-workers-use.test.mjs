// A LOGIN MOVED IN THE SHELL PROFILE IS THE ONE WORKERS USE — w-6d8c543a43.
//
// WHAT BROKE. Somebody with `export CLAUDE_CONFIG_DIR="$HOME/.config/claude"`
// in .zshrc signs in from their terminal, and their login lives in that
// folder. An app opened from the Dock never sees .zshrc, and the shell's answer
// (main/shell-path.mjs) was only ever used to find sessions to import. Workers
// ran on an empty ~/.claude and every task said Claude Code could not sign in.
// Measured by the setups check (verify-agentbox, setup `config-dir-from-zshrc`)
// on the real Claude Code 2.1.301, 2026-10-15: no task on that home answered.
//
// THE SAME FOLDER NAMED OUT LOUD IS NOT THE DEFAULT. Claude Code names its
// keychain entry after CLAUDE_CONFIG_DIR (measured 2026-10-05, see
// shared/fresh-user-home.mjs), so `export CLAUDE_CONFIG_DIR=~/.claude` signs in
// under a different entry than no variable at all. A worker started with no
// variable reads the other one and is signed out. So a folder the shell names
// is passed as a folder, even when it is ~/.claude.
//
// CODEX HAD THE SAME HOLE. The worker scrub removes every CODEX_*, and the home
// was chosen from that scrubbed environment, so a CODEX_HOME exported in .zshrc
// could never be the one Codex ran on.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { effectiveProfiles, forgetDiscovery } from '../main/account-discovery.mjs';
import { codexHome } from '../main/codex-models.mjs';

let home;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-login-'));
  forgetDiscovery();
});

/** A Claude Code login, as `/login` with CLAUDE_CONFIG_DIR set leaves it: .claude.json inside the folder. */
function signIn(dir, n) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: `p${n}@x.invalid`, accountUuid: `acct-${n}` } }));
}
/** The default login, which keeps its .claude.json beside ~/.claude. */
function signInDefault(n) {
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: `p${n}@x.invalid`, accountUuid: `acct-${n}` } }));
}

describe('a Claude Code login the shell profile moved', () => {
  it('is where workers run when it is the only login, and ~/.claude is not tried', () => {
    const moved = path.join(home, '.config', 'claude');
    signIn(moved, 1);
    expect(effectiveProfiles([], { home, shellDir: moved })).toEqual([moved]);
  });

  it('runs beside a different account still signed in at ~/.claude', () => {
    const moved = path.join(home, '.config', 'claude');
    signInDefault(1);
    signIn(moved, 2);
    expect(effectiveProfiles([], { home, shellDir: moved })).toEqual(['default', moved]);
  });

  it('replaces the default when both folders hold the same account, because the shell\'s is the one the terminal uses', () => {
    const moved = path.join(home, 'claude-config');
    signInDefault(1);
    signIn(moved, 1);
    expect(effectiveProfiles([], { home, shellDir: moved })).toEqual([moved]);
  });

  it('is passed as a folder even when the shell names ~/.claude itself', () => {
    const dflt = path.join(home, '.claude');
    signIn(dflt, 1);
    expect(effectiveProfiles([], { home, shellDir: dflt })).toEqual([dflt]);
  });

  it('keeps a person\'s own configured list first', () => {
    const second = path.join(home, 'work-claude');
    const moved = path.join(home, '.config', 'claude');
    signIn(second, 3);
    signIn(moved, 2);
    expect(effectiveProfiles([second], { home, shellDir: moved })).toEqual([second, moved]);
  });
});

describe('what must not change', () => {
  it('a folder the shell names that holds no login is ignored', () => {
    signInDefault(1);
    const empty = path.join(home, '.config', 'claude');
    fs.mkdirSync(empty, { recursive: true });
    expect(effectiveProfiles([], { home, shellDir: empty })).toEqual(['default']);
  });

  it('no shell answer leaves the default exactly as it was', () => {
    signInDefault(1);
    expect(effectiveProfiles([], { home, shellDir: undefined })).toEqual(['default']);
    expect(effectiveProfiles([], { home, shellDir: 'relative/claude' })).toEqual(['default']);
  });
});

describe('a Codex home the shell profile moved', () => {
  it('is the home Codex runs on when nothing else names one', () => {
    expect(codexHome({ env: {}, home, shell: '/opt/codex-home' })).toBe('/opt/codex-home');
  });

  it('loses to a home set in the app\'s own settings', () => {
    expect(codexHome({ configured: '/chosen', env: {}, home, shell: '/opt/codex-home' })).toBe('/chosen');
  });

  it('falls back to ~/.codex with no shell answer, and ignores a relative one', () => {
    expect(codexHome({ env: {}, home, shell: undefined })).toBe(path.join(home, '.codex'));
    expect(codexHome({ env: {}, home, shell: 'codex' })).toBe(path.join(home, '.codex'));
  });
});
