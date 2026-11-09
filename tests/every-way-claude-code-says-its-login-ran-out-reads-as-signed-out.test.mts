// EVERY WAY CLAUDE CODE SAYS ITS LOGIN RAN OUT READS AS SIGNED OUT.
//
// A tester's first task came back "Claude Code stopped before it did anything"
// with no reason, and kept coming back that way. Their terminal said the login
// was about to expire, and /login fixed it. The app reads why a run died off
// the CLI's words, and several of Claude Code's sign-in refusals matched none
// of its patterns, so they fell to 'unknown'. The strings below are copied out
// of the Claude Code 2.1.310 binary (2026-10-27); the ones already caught were
// measured on real signed-out runs the same day.
//
// One more was caught wrongly: in a -p run, another Claude Code process
// refreshing the same login says "Failed to refresh OAuth token ... usually
// transient", and its "OAuth" filed it as signed out, which benches the
// account and asks for a sign-in a minute would have made unnecessary.
import { describe, it, expect } from 'vitest';
import { troubleCause, deadRunSentence } from '../shared/spawn-trouble.mts';

const NEWLY_SIGNED_OUT = [
  'Login expired · Run /login to sign in again, or re-authenticate your Anthropic profile',
  'Anthropic profile login expired · Re-authenticate your Anthropic profile',
  'Authentication required · Sign in again to continue',
  'Your Claude session has expired. Sign in again to continue (claude auth login).',
  'The claude.ai login cannot be refreshed in this session — the token was supplied via CLAUDE_CODE_OAUTH_TOKEN, or its refresh token has expired or was revoked. Run /login to reconnect.',
];

const ALREADY_SIGNED_OUT = [
  'Login expired · Please run /login',
  'Not logged in · Please run /login',
  'OAuth token revoked · Please run /login',
  'Failed to authenticate: OAuth session expired and could not be refreshed',
  'Failed to authenticate. API Error: 401 OAuth access token is invalid.',
];

const ANOTHER_PROCESS_REFRESHING = [
  'Failed to refresh OAuth token: another Claude Code process is refreshing it or exited mid-refresh. This is usually transient; retry in a minute, and if it persists close other Claude Code processes or sign in again',
  'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute; if it keeps happening, close other Claude Code windows or sign in again with /login',
];

describe('a login Claude Code says has run out', () => {
  for (const said of NEWLY_SIGNED_OUT) {
    it(`is signed out: ${said.slice(0, 60)}`, () => expect(troubleCause(said)).toBe('signed-out'));
  }

  for (const said of ALREADY_SIGNED_OUT) {
    it(`is still signed out: ${said.slice(0, 60)}`, () => expect(troubleCause(said)).toBe('signed-out'));
  }

  it('and the row says to sign it back in, not that the run stopped for no reason', () => {
    const line = deadRunSentence({ engineWord: 'Claude Code', cause: troubleCause(NEWLY_SIGNED_OUT[0]) });
    expect(line).toMatch(/could not sign in/);
    expect(line).toMatch(/Sign that account back in/);
    expect(line).not.toMatch(/stopped before it did anything/);
  });
});

describe('a login another Claude Code is refreshing', () => {
  for (const said of ANOTHER_PROCESS_REFRESHING) {
    it(`is a run cut off, tried again on its own: ${said.slice(0, 50)}`, () => expect(troubleCause(said)).toBe('interrupted'));
  }
});

describe('what the new words must not take', () => {
  it('a limit stays a limit', () => {
    expect(troubleCause("You've hit your session limit · resets 6:50pm")).toBe('at-limit');
  });

  it("an organization's refusal stays the organization's", () => {
    expect(troubleCause('Your organization has disabled API key authentication · Sign in again with your claude.ai account')).toBe('org-blocked');
  });

  it('a connected MCP server asking for its own sign-in is not the Claude login', () => {
    expect(troubleCause('linear needs you to sign in again (run /mcp to re-authenticate)')).not.toBe('signed-out');
  });

  it('a full disk, which signing in again cannot fix, is not called signed out', () => {
    expect(troubleCause("Could not refresh your login: the disk that holds the Claude Code config directory (~/.claude by default), or your disk quota on it, is full · Delete files you no longer need on that disk, then try again · Signing in again won't help")).not.toBe('signed-out');
  });

  it('nor is a run whose words name no login at all', () => {
    expect(troubleCause('something nobody has seen before')).toBe('unknown');
    expect(troubleCause('the agent wrote about a session it had planned')).toBe('unknown');
  });
});
