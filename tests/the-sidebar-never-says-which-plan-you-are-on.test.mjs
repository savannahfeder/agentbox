// THE SIDEBAR NEVER SAYS WHICH PLAN YOU ARE ON (w-e217e577e5, 2026-10-07).
//
// This file was written the same day for the opposite behaviour, and that is the
// point of keeping it rather than deleting it. A row reading "Claude · Max 20x"
// went into the foot of the sidebar, shipped to main, and came straight back out
// a few hours later. Her words, with a photograph of the row attached: "we have
// to get rid of this. It should never say that on the sidebar. I never approved
// it." And on the half she wanted gone most: "very critically, I want to get rid
// of that Claude Max 20x plan."
//
// WHAT THE ROW WAS ANSWERING IS REAL AND IS NOT THIS. In her words, a new user
// came in, started running an agent, and was "like, 'Oh my God, where are the
// tokens coming from? I didn't even connect my account.'" That is a question
// somebody asks ONCE, on their first day. A permanent row is the wrong shape for
// a one-time surprise, and a plan tier printed in the corner of the eye for ever
// is billing detail nobody asked to live with. The answer is one line in the
// walk, which is `tests/the-walk-says-what-it-found-already-signed-in-on-this-mac`.
//
// So what is pinned here is the ABSENCE, three ways: the sidebar cannot be made
// to draw it even when it is handed the facts, the words carry no plan at all,
// and the reading off disk no longer even collects one. The last two are what
// stop it coming back by accident: a tier that is never read cannot be printed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as words from '../shared/runs-on.mjs';
import { forgetRunsOn, runsOn } from '../main/runs-on.mjs';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-runs-on-')); forgetRunsOn(); });
afterEach(() => { try { fs.rmSync(home, { recursive: true, force: true }); } catch {} });

/** A Claude Code config file, as the CLI itself writes one. */
const layClaude = (account) => {
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify(account ? { oauthAccount: account } : { projects: {} }));
};

/**
 * A Codex login, with the one claim its id_token really carries. Signed with
 *  nothing: main/codex-account.mjs verifies no signature and says why.
 */
const layCodex = (plan) => {
  const dir = path.join(home, '.codex');
  fs.mkdirSync(dir, { recursive: true });
  const body = Buffer.from(JSON.stringify({
    email: 'ada@example.test',
    'https://api.openai.com/auth': plan ? { chatgpt_plan_type: plan } : {},
  })).toString('base64url');
  fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ tokens: { id_token: `x.${body}.y` } }));
};

describe('the foot of the sidebar', () => {
  const noop = () => {};
  const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
    view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop,
    onFeedback: noop, onInstructions: noop, onSettings: noop, ...extra,
  }));

  it('says nothing about a plan, an account or an agent, however it is called', () => {
    // Handed exactly what the removed row was handed, including the props it
    // used to read. Anything that drew it again would light this up.
    for (const extra of [{}, { runsOn: { engine: 'claude', plan: 'Max 20x' }, onAccounts: noop }]) {
      const html = draw(extra);
      for (const banned of ['Claude', 'ChatGPT', 'Codex', 'Max 20x', 'plan', 'th-runs-on']) {
        expect(html).not.toContain(banned);
      }
    }
  });

  it('still ends at Settings, with Feedback above it', () => {
    const html = draw({ runsOn: { engine: 'claude', plan: 'Max 20x' } });
    expect(html).toContain('aria-label="Feedback"');
    expect(html).toContain('aria-label="Settings"');
    // The air under Settings is `.workspace-utilities:last-child`, 4 points,
    // picked over 0, 8 and 12 (w-b59cbe3154). Nothing follows the foot list.
    expect(fs.readFileSync(path.join(root, 'renderer/src/workspace-navigation.css'), 'utf8'))
      .toContain('.workspace-utilities:last-child');
  });

  it('has no stylesheet left that could draw the row', () => {
    for (const sheet of ['renderer/src/threads/pages.css', 'renderer/src/workspace-navigation.css', 'renderer/src/styles.css']) {
      expect(fs.readFileSync(path.join(root, sheet), 'utf8')).not.toContain('th-runs-on');
    }
  });
});

describe('the words', () => {
  it('names the plan people pay for, not the tool underneath', () => {
    expect(words.runsOnName('claude')).toBe('Claude');
    expect(words.runsOnName('codex')).toBe('ChatGPT');
    expect(words.foundOnThisMac({ engine: 'claude' }))
      .toBe('Your agents will run on the Claude account already signed in on this Mac.');
    expect(words.foundOnThisMac({ engine: 'codex' }))
      .toBe('Your agents will run on the ChatGPT account already signed in on this Mac.');
  });

  // THE TIER CANNOT COME BACK THROUGH THE WORDS. The two functions that drew it
  // are gone rather than unused, and a plan handed in anyway is ignored.
  it('has no way left to put a plan in a sentence', () => {
    expect(words.runsOnLine).toBeUndefined();
    expect(words.runsOnTitle).toBeUndefined();
    expect(words.foundOnThisMac({ engine: 'claude', plan: 'Max 20x' })).not.toContain('Max 20x');
  });

  // THE CASE THAT MUST NOT SAY ANYTHING. An engine nobody named is the shape
  // every caller here hands over on a Mac with no login at all.
  it('says nothing at all about an engine it cannot name', () => {
    for (const engine of [null, undefined, '', 'gemini', 'CLAUDE']) {
      expect(words.runsOnName(engine)).toBe(null);
      expect(words.foundOnThisMac({ engine })).toBe(null);
    }
    expect(words.foundOnThisMac()).toBe(null);
  });
});

describe('the reading off this Mac', () => {
  it('knows a Claude login is there, and never reads a tier out of it', () => {
    layClaude({ organizationRateLimitTier: 'default_claude_max_20x' });
    expect(runsOn({ engine: 'claude', home })).toEqual({ engine: 'claude' });
  });

  it('knows a Codex login is there, under its own home', () => {
    layCodex('pro');
    expect(runsOn({ engine: 'codex', home, codexHome: path.join(home, '.codex') })).toEqual({ engine: 'codex' });
  });

  // THE BOUNDARY EITHER SIDE. A login with no plan string in it is still a
  // login, which is now the ordinary case rather than a lesser one; a file with
  // no login in it is not.
  it('counts a login with no plan string exactly like any other', () => {
    layClaude({ emailAddress: 'ada@example.test' });
    expect(runsOn({ engine: 'claude', home })).toEqual({ engine: 'claude' });
  });

  it('says nothing when nobody is signed in, or the file cannot be read', () => {
    expect(runsOn({ engine: 'claude', home })).toBe(null);
    layClaude(null);
    expect(runsOn({ engine: 'claude', home })).toBe(null);
    fs.writeFileSync(path.join(home, '.claude.json'), '{ half written');
    expect(runsOn({ engine: 'claude', home })).toBe(null);
    expect(runsOn({ engine: 'codex', home, codexHome: path.join(home, '.codex') })).toBe(null);
    expect(runsOn({ engine: 'gemini', home })).toBe(null);
  });

  it('reads a second Claude login out of its own folder', () => {
    const dir = path.join(home, 'second');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { organizationType: 'claude_pro' } }));
    expect(runsOn({ engine: 'claude', home, claudeProfile: dir })).toEqual({ engine: 'claude' });
  });

  // A tier that is never collected cannot be printed by anybody downstream.
  it('hands no plan to anything, on any engine', () => {
    layClaude({ organizationRateLimitTier: 'default_claude_max_20x' });
    layCodex('pro');
    for (const facts of [{ engine: 'claude', home }, { engine: 'codex', home, codexHome: path.join(home, '.codex') }]) {
      expect(Object.keys(runsOn(facts))).toEqual(['engine']);
    }
  });
});
