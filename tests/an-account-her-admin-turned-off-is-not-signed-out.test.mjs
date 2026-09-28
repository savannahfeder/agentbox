// AN ACCOUNT THAT IS SIGNED IN AND BLOCKED IS NOT AN ACCOUNT THAT IS SIGNED OUT.
//
// She was right and the app was wrong. Her second login, work@example.com in
// ~/.claude-work, is signed in — its `oauthAccount` is intact and the browser
// login succeeds every time she does it. What actually happens is that the
// WORKSPACE that account belongs to has Claude Code turned off. Run by hand on
// her Mac that afternoon, and this is the whole of the CLI's output:
//
//   $ CLAUDE_CONFIG_DIR=~/.claude-work claude -p "say ok"
//   Your organization has disabled Claude subscription access for Claude Code ·
//   Use an Anthropic API key instead, or ask your admin to enable access
//
// `/subscription access/i` is in the SIGNED_OUT list, so every one of those was
// filed as a login that had run out, and the row and the Accounts page both
// told her to go and type /login. She did, twice — 10:53am and 2:26pm, both
// visible on the row — and the login SUCCEEDED both times, because there was
// never anything wrong with it. Nothing changed, because nothing about a
// /login can change an admin's policy.
//
// Measured on her store: 4 dead runs on that one row (10:52:07, 10:53:42,
// 13:38:19, 14:27:19), every one of them carrying "could not sign in, so
// nothing has been done on this task. Sign that account back in and it picks
// straight up." — an instruction she cannot carry out, on a row that was never
// going to move.
//
// So this cause gets its own name and its own sentences, and the remedy names
// the only person who has one: an admin of that workspace. The API-key half of
// the CLI's line is deliberately never repeated to her — Agentbox bills workers
// to her subscription and never to a key (CLAUDE.md), so offering it would be
// telling her to do the one thing this app refuses to do.

import { describe, it, expect } from 'vitest';
import {
  troubleCause, needsHerHands, troubleSentence, troubleRemedy, accountSentence,
  deadRunSentence, deadRunCause, causeWord, causeWhat, causeNext, causeAct, causeBreakdown,
} from '../shared/spawn-trouble.mjs';

// The line her CLI actually printed, byte for byte.
const HERS = 'Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access';

describe('the words her own machine printed', () => {
  it('names the organization, not a login', () => {
    expect(troubleCause(HERS)).toBe('org-blocked');
  });

  it('reads it the same way when Claude Code says it a different way', () => {
    // The wording has changed several times and will again; each of these is a
    // shape the same fact has been printed in.
    expect(troubleCause('organization has disabled Claude subscription access')).toBe('org-blocked');
    expect(troubleCause('Ask your admin to enable access')).toBe('org-blocked');
    expect(troubleCause('Claude Code is disabled for your organization')).toBe('org-blocked');
  });

  // THE CASE THAT MUST NOT MATCH, and the one that catches the next regression.
  // A login that really has run out still reads as one: this cause is a new
  // name for a specific fact, not a wider net over the old one.
  it('leaves a login that really has run out exactly where it was', () => {
    expect(troubleCause('Failed to authenticate: OAuth session expired and could not be refreshed')).toBe('signed-out');
    expect(troubleCause('Not logged in. Please run /login')).toBe('signed-out');
    expect(troubleCause('Invalid API key')).toBe('signed-out');
    // THE WORD "organization" IN A SENTENCE THAT IS NOT ABOUT A POLICY. This
    // is the one that catches an over-wide pattern here: it is a real expired
    // login and it must keep reading as one.
    expect(troubleCause("Your organization's session expired · please run /login")).toBe('signed-out');
  });

  it('leaves the other three causes alone', () => {
    expect(troubleCause("You've hit your weekly limit · resets 6pm")).toBe('at-limit');
    expect(troubleCause('Claude will not run here: trust this folder first')).toBe('workspace');
    expect(troubleCause('econnreset')).toBe('interrupted');
    expect(troubleCause('')).toBe('unknown');
  });
});

describe('what she is told about it', () => {
  it('never tells her to sign in, because signing in is not the fix', () => {
    const said = [
      troubleRemedy('org-blocked'),
      accountSentence('org-blocked', '/Users/you/.claude-work'),
      causeNext('org-blocked'),
      deadRunSentence({ engineWord: 'Claude Code', cause: 'org-blocked' }),
    ];
    for (const s of said) {
      expect(s).not.toMatch(/\/login/i);
      expect(s).not.toMatch(/sign (that account|in|back)/i);
      expect(s).not.toMatch(/signed out/i);
    }
  });

  it('never offers her an API key, which this app does not use', () => {
    const said = [
      troubleSentence('org-blocked'),
      troubleRemedy('org-blocked'),
      accountSentence('org-blocked', '/Users/you/.claude-work'),
      causeNext('org-blocked'),
      causeWhat('org-blocked', 2),
      deadRunSentence({ engineWord: 'Claude Code', cause: 'org-blocked' }),
    ];
    for (const s of said) expect(s).not.toMatch(/api key/i);
  });

  it('names the one person who can end it', () => {
    expect(troubleRemedy('org-blocked')).toMatch(/admin/i);
    expect(causeNext('org-blocked')).toMatch(/admin/i);
    expect(accountSentence('org-blocked', '/Users/you/.claude-work')).toMatch(/admin/i);
  });

  it('says on the Accounts page that the account IS signed in, which is her whole complaint', () => {
    expect(accountSentence('org-blocked', '/Users/you/.claude-work')).toMatch(/signed in/i);
  });

  it('offers no button, because there is nothing here she can press', () => {
    expect(causeAct('org-blocked')).toBe(null);
  });

  it('leaves the rotation on the first sighting: no admin is going to act inside thirty minutes', () => {
    expect(needsHerHands('org-blocked')).toBe(true);
  });
});

describe('the sentence that goes on her row', () => {
  const row = deadRunSentence({ engineWord: 'Claude Code', cause: 'org-blocked', runs: 4 });

  it('opens under 112 characters, which is where her inbox row clips', () => {
    const first = `${row.split('. ')[0]}.`;
    expect(first.length).toBeLessThan(112);
  });

  it('still counts the runs, because four times is the part that says this is not a blip', () => {
    expect(row).toMatch(/happened 4 times/);
  });

  it('can be read back off the row, so the count above her list can see it', () => {
    expect(deadRunCause(row)).toBe('org-blocked');
    // And it is not confusable with the cause it used to be filed as.
    expect(deadRunCause(deadRunSentence({ cause: 'signed-out' }))).toBe('signed-out');
  });
});

describe('the pile above her list', () => {
  it('counts it as its own thing and puts it where she can act on it', () => {
    const rows = [{ cause: 'org-blocked' }, { cause: 'org-blocked' }, { cause: 'at-limit' }];
    const out = causeBreakdown(rows);
    const blocked = out.find((c) => c.cause === 'org-blocked');
    expect(blocked.count).toBe(2);
    expect(blocked.hers).toBe(true);
    // Ahead of the limit, which nobody can do anything about.
    expect(out[0].cause).toBe('org-blocked');
  });

  it('has a short name for the shapes with no room for a sentence', () => {
    expect(causeWord('org-blocked')).not.toBe(causeWord('unknown'));
    expect(causeWord('org-blocked')).toMatch(/organi[sz]ation/i);
  });
});
