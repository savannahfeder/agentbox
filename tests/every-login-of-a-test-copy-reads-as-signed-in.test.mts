// A test copy's first Claude login read as "Not signed in" while its threads ran.
//
// live.mjs wrote each stand-in login into `<folder>/.claude.json`, the first
// one into `~/.claude/.claude.json`. Since 2026-10-30 the app reads the default
// login only from `~/.claude.json`, beside the folder, which is where Claude
// Code keeps it. So on every stand-in copy Settings > Claude Code showed the
// default login as "Not signed in / Finish signing in to use it" (power test
// 2026-11-08, round 2, #33 and #38). Measured on a home laid out the old way:
// effectiveProfiles listed default, .claude-second and .claude-third, and
// accountIdentity found an email for the last two only.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { layStandInLogins } = await import('../.claude/skills/verify-agentbox/scripts/live.mjs');
const { effectiveProfiles } = await import('../main/account-discovery.mts');
const { accountIdentity } = await import('../main/account-tooling.mts');

function homeWith(logins) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'stand-in-home-'));
  layStandInLogins(home, logins);
  return home;
}

/** Each login the Claude Code page lists, by the email it names, or null for "Not signed in". */
const listed = (home) => effectiveProfiles([], { home, shellDir: null })
  .map((p) => accountIdentity(p === 'default' ? null : p, { home })?.email ?? null);

describe('a test copy\'s stand-in Claude logins', () => {
  it('one login is the default, signed in', () => {
    expect(listed(homeWith(1))).toEqual(['one@verify.invalid']);
  });

  it('three logins are all signed in, the first as the default', () => {
    const home = homeWith(3);
    expect(listed(home)).toEqual(['one@verify.invalid', 'two@verify.invalid', 'three@verify.invalid']);
    expect(effectiveProfiles([], { home, shellDir: null })[0]).toBe('default');
  });

  it('four is the most, and none is never asked for', () => {
    const four = listed(homeWith(9));
    expect(four[0]).toBe('one@verify.invalid');
    expect([...four].sort()).toEqual(['four@verify.invalid', 'one@verify.invalid', 'three@verify.invalid', 'two@verify.invalid']);
    expect(listed(homeWith(0))).toEqual(['one@verify.invalid']);
  });

  it('the default login keeps a Claude Code folder, and no stale login inside it', () => {
    const home = homeWith(2);
    expect(fs.statSync(path.join(home, '.claude')).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(home, '.claude', '.claude.json'))).toBe(false);
  });
});
