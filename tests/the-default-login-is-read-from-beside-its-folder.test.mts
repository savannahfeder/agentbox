// THE DEFAULT LOGIN IS NAMED FROM THE FILE CLAUDE CODE SIGNS IT IN WITH.
//
// Claude Code with no CLAUDE_CONFIG_DIR keeps its login in ~/.claude.json,
// beside ~/.claude, and never reads ~/.claude/.claude.json (read from the
// 2.1.314 binary: `join(CLAUDE_CONFIG_DIR || homedir(), '.claude.json')`).
// That inside file is left by a run with CLAUDE_CONFIG_DIR=~/.claude.
//
// WHAT BROKE: accountIdentity preferred the inside file for the default login.
// On a Mac holding a stale one, Settings named the default row after an
// account it was not signed in as, and read its usage on the account it really
// was: two tiles with different emails and the same 96% session, 54% week.
//
// WHAT CAN SILENTLY BREAK: a NAMED folder must still be read from inside, or
// every second login reports the default account's email.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountIdentity } from '../main/account-tooling.mts';
import { effectiveProfiles } from '../main/account-discovery.mts';

const login = (file, uuid) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ oauthAccount: { accountUuid: uuid, emailAddress: `${uuid}@example.com` } }));
};

function withHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-default-login-'));
  try { return fn(home); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

describe('whose login the default account is', () => {
  it('reads the file beside the folder', () => withHome((home) => {
    fs.mkdirSync(path.join(home, '.claude'));
    expect(accountIdentity(null, { home })).toBe(null);
    login(path.join(home, '.claude.json'), 'beside');
    expect(accountIdentity(null, { home })).toEqual({ email: 'beside@example.com', accountUuid: 'beside' });
    expect(accountIdentity(path.join(home, '.claude'), { home })).toBe(null);
  }));

  it('ignores a file inside the folder, which Claude Code does not read without CLAUDE_CONFIG_DIR', () => withHome((home) => {
    login(path.join(home, '.claude', '.claude.json'), 'inside');
    login(path.join(home, '.claude.json'), 'beside');
    expect(accountIdentity(null, { home })?.accountUuid).toBe('beside');
  }));

  it('is not signed in when only the inside file holds a login', () => withHome((home) => {
    login(path.join(home, '.claude', '.claude.json'), 'inside');
    expect(accountIdentity(null, { home })).toBe(null);
  }));

  it('still reads a named folder from inside, including ~/.claude named out loud', () => withHome((home) => {
    login(path.join(home, '.claude', '.claude.json'), 'inside');
    login(path.join(home, '.claude.json'), 'beside');
    expect(accountIdentity(path.join(home, '.claude'), { home })?.accountUuid).toBe('inside');
  }));

  it('lists one account, not two, when a second folder holds the default login and ~/.claude holds a stale one', () => withHome((home) => {
    login(path.join(home, '.claude', '.claude.json'), 'stale');
    login(path.join(home, '.claude.json'), 'real');
    login(path.join(home, '.claude-2', '.claude.json'), 'real');
    login(path.join(home, '.claude-3', '.claude.json'), 'other');
    expect(effectiveProfiles([], { home, shellDir: undefined })).toEqual(['default', path.join(home, '.claude-3')]);
  }));
});
