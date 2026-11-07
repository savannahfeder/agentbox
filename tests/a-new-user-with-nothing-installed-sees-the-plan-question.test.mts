// A NEW USER WITH NOTHING INSTALLED, so the plan question can be tried on this
// Mac (w-9f6975906c, 2026-10-05).
//
// The founder opened ⌘K's new-user window to try "Which AI plan do you pay
// for?" and never reached it. Both new-user rows link her own Claude Code
// (`~/.local/bin/claude`) and her keychain into the throwaway home, so the copy
// found a Claude Code that was installed and signed in, and the walk rightly
// skipped the question. Her words: "I'm not sure why it's not presenting fixed
// locally."
//
// So there is a third kind of new user: no Claude Code of hers, and sign-in
// folders of its own. The keychain is still linked, because Claude Code keeps
// its sign-in there, but under a name keyed on CLAUDE_CONFIG_DIR (measured
// 2026-10-05: `CLAUDE_CONFIG_DIR=<tmp> claude auth status` read loggedIn false
// on a Mac that is signed in), so signing in to a test account in that window
// cannot overwrite her own. Codex keeps its sign-in in CODEX_HOME/auth.json.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareHome, freshEnv } from '../shared/fresh-user-home.mts';
import { openFreshUser } from '../main/fresh-user.mts';

function fakeRealHome() {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'real-home-'));
  fs.mkdirSync(path.join(real, '.local/bin'), { recursive: true });
  fs.writeFileSync(path.join(real, '.local/bin/claude'), '#!/bin/sh\n');
  fs.mkdirSync(path.join(real, 'Library/Keychains'), { recursive: true });
  fs.mkdirSync(path.join(real, '.claude'), { recursive: true });
  return real;
}

describe('a new user with nothing installed', () => {
  it('gets no Claude Code of hers, but keeps the keychain Claude Code signs in through', () => {
    const real = fakeRealHome();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-'));
    const out = prepareHome(home, { realHome: real, withTools: false });
    expect(out.claudeBin).toBe(false);
    expect(fs.existsSync(path.join(home, '.local/bin/claude'))).toBe(false);
    expect(out.keychain).toBe(true);
    expect(out.agents).toBe(false);
  });

  it('still gets her Claude Code on the two rows that always had it', () => {
    const real = fakeRealHome();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-'));
    expect(prepareHome(home, { realHome: real }).claudeBin).toBe(true);
  });

  it('signs in to folders of its own, so her own sign-ins are never touched', () => {
    const env = freshEnv('/tmp/fresh-x', { HOME: '/Users/her', CLAUDE_CONFIG_DIR: '/Users/her/.claude-2', CODEX_HOME: '/Users/her/.codex' }, { ownSignIns: true });
    expect(env.CLAUDE_CONFIG_DIR).toBe('/tmp/fresh-x/.claude');
    expect(env.CODEX_HOME).toBe('/tmp/fresh-x/.codex');
  });

  it('does not inherit a sign-in folder of hers on the other rows either way', () => {
    const env = freshEnv('/tmp/fresh-x', { HOME: '/Users/her', CLAUDE_CONFIG_DIR: '/Users/her/.claude-2', CODEX_HOME: '/Users/her/.codex' });
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(env.CODEX_HOME).toBeUndefined();
  });

  it('is what the window opens with when asked for nothing installed', () => {
    let spawned = null;
    const out = openFreshUser({
      withAgents: false, withTools: false, packaged: true, execPath: process.execPath,
      spawnFn: (bin, args, opts) => { spawned = opts; return { pid: 1, unref() {} }; },
    });
    expect(out.ok).toBe(true);
    expect(fs.existsSync(path.join(out.home, '.local/bin/claude'))).toBe(false);
    expect(spawned.env.CLAUDE_CONFIG_DIR).toBe(path.join(out.home, '.claude'));
    expect(spawned.env.CODEX_HOME).toBe(path.join(out.home, '.codex'));
    // And it does not warn about the missing Claude Code it was asked to leave out.
    expect(out.notes.join(' ')).not.toMatch(/Claude Code is not at/);
    fs.rmSync(out.home, { recursive: true, force: true });
  });
});
