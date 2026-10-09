// THE APP SAYS WHICH PLAN YOUR AGENTS RUN ON (w-e217e577e5, 2026-10-07).
//
// From a session with a new user: "He didn't realize it auto-connected to
// Claude/Codex; he wasn't sure how it was even running. Would be nice to have
// some small indication."
//
// He was right that nothing said it. Measured on the tree before this change:
// the string "Claude" appears nowhere in renderer/src/components/WorkspaceNavigation.tsx,
// and the walk skips its plan question entirely when a tool is already signed in
// (`needsPlan`, renderer/src/plan-setup.ts), so a Mac that was already set up
// got the plan question, the setup card and the sentence about whose
// subscription this is: none of them. The only screen that has ever named the
// account is Settings, and you have to already suspect there is something there
// to go looking.
//
// So three things, and the third is the one that gets skipped:
//   - the words (shared/runs-on.mjs), which never invent a plan;
//   - the reading off disk (main/runs-on.mjs), which never guesses;
//   - and SILENCE where nothing is known. A Mac with nobody signed in, a config
//     file half written, a plan string this code has never seen: each of those
//     draws nothing at all rather than "Claude · unknown" or a dash. The app
//     saying something it cannot stand behind about what somebody is paying for
//     is worse than the app saying nothing, which is where this started.
//
// 2026-10-07, w-d193de0dbb: the user rejected the one subscription row in
// the sidebar. Keep the reading and onboarding words, but draw no plan row
// in either sidebar state, even when a subscription is known.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { foundOnThisMac, runsOnLine, runsOnName, runsOnTitle } from '../shared/runs-on.mjs';
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

describe('the words', () => {
  it('names the plan people pay for, not the tool underneath', () => {
    expect(runsOnName('claude')).toBe('Claude');
    expect(runsOnName('codex')).toBe('ChatGPT');
    expect(runsOnLine({ engine: 'claude', plan: 'Max 20x' })).toBe('Claude · Max 20x');
    expect(runsOnLine({ engine: 'codex', plan: 'Pro' })).toBe('ChatGPT · Pro');
    // Never the CLI's name, which is a byline's word about a row and not a
    // thing anybody buys (renderer/src/byline.ts).
    expect(runsOnLine({ engine: 'claude', plan: 'Max 20x' })).not.toContain('Claude Code');
    expect(runsOnLine({ engine: 'codex', plan: 'Pro' })).not.toContain('Codex');
  });

  it('says the name alone when the plan cannot be read', () => {
    for (const plan of [null, undefined, '', '   ']) {
      expect(runsOnLine({ engine: 'claude', plan })).toBe('Claude');
    }
    expect(foundOnThisMac({ engine: 'claude', plan: null }))
      .toBe('Your agents will run on the Claude account already signed in on this Mac.');
    expect(foundOnThisMac({ engine: 'claude', plan: 'Max 20x' }))
      .toBe('Your agents will run on the Claude Max 20x plan already signed in on this Mac.');
  });

  // THE CASE THAT MUST NOT DRAW ANYTHING. An engine nobody named is the shape
  // every caller here hands over on a Mac with no login at all.
  it('says nothing at all about an engine it cannot name', () => {
    for (const engine of [null, undefined, '', 'gemini', 'CLAUDE']) {
      expect(runsOnName(engine)).toBe(null);
      expect(runsOnLine({ engine, plan: 'Max 20x' })).toBe(null);
      expect(runsOnTitle({ engine, plan: 'Max 20x' })).toBe(null);
      expect(foundOnThisMac({ engine })).toBe(null);
    }
    expect(runsOnLine()).toBe(null);
  });

  it('spells the whole answer out for a hover and for a screen reader', () => {
    expect(runsOnTitle({ engine: 'claude', plan: 'Max 20x' }))
      .toBe('Your agents run on the Claude account already signed in on this Mac. Your Max 20x plan.');
    expect(runsOnTitle({ engine: 'codex', plan: null }))
      .toBe('Your agents run on the ChatGPT account already signed in on this Mac.');
  });
});

describe('the reading off this Mac', () => {
  it('reads the plan Claude Code itself reports', () => {
    layClaude({ organizationRateLimitTier: 'default_claude_max_20x' });
    expect(runsOn({ engine: 'claude', home })).toEqual({ engine: 'claude', plan: 'Max 20x' });
  });

  it('reads the plan Codex itself reports, under its own home', () => {
    layCodex('pro');
    expect(runsOn({ engine: 'codex', home, codexHome: path.join(home, '.codex') }))
      .toEqual({ engine: 'codex', plan: 'Pro' });
  });

  // THE BOUNDARY EITHER SIDE. A login with no plan string is still a login, and
  // the screen then says the name alone; a file with no login in it is not.
  it('still names the account when the plan string is missing', () => {
    layClaude({ emailAddress: 'ada@example.test' });
    expect(runsOn({ engine: 'claude', home })).toEqual({ engine: 'claude', plan: null });
    expect(runsOnLine(runsOn({ engine: 'claude', home }))).toBe('Claude');
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

  // A plan id nobody has measured is printed as the tool spells it, never
  // title-cased into a product name OpenAI has never used. That rule is
  // main/codex-account.mjs's; this pins that it survives the trip.
  it('does not invent a product name for a plan id nobody has seen', () => {
    layCodex('prolite');
    expect(runsOn({ engine: 'codex', home, codexHome: path.join(home, '.codex') }))
      .toEqual({ engine: 'codex', plan: 'prolite' });
  });

  it('reads a second Claude login out of its own folder', () => {
    const dir = path.join(home, 'second');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { organizationType: 'claude_pro' } }));
    expect(runsOn({ engine: 'claude', home, claudeProfile: dir })).toEqual({ engine: 'claude', plan: 'Pro' });
  });
});

describe('the sidebar keeps subscription details in Settings', () => {
  const noop = () => {};
  const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
    view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop,
    onFeedback: noop, onInstructions: noop, onSettings: noop, ...extra,
  }));

  it.each([false, true])('has no subscription shortcut when collapsed is %s', (collapsed) => {
    for (const runsOn of [
      { engine: 'claude', plan: 'Max 20x' },
      { engine: 'codex', plan: 'Pro' },
      { engine: 'claude', plan: null },
      null, undefined, { engine: null, plan: null },
    ]) {
      const html = draw({ runsOn, onAccounts: noop, collapsed });
      expect(html).not.toContain('th-runs-on');
      expect(html).not.toContain('Claude ·');
      expect(html).not.toContain('ChatGPT ·');
      expect(html).toContain('aria-label="Threads"');
      expect(html).toContain('aria-label="Feedback"');
      expect(html).toContain('aria-label="Settings"');
    }
  });

  // THE AIR UNDER SETTINGS IS 4 POINTS AND IT STAYS 4 POINTS. It is
  // `.workspace-utilities:last-child` (w-b59cbe3154), three rounds of her
  // picking a number. Removing the plan row must preserve that list.
  it('keeps Settings at the end of the foot list with the same spacing', () => {
    const html = draw();
    const foot = html.split('workspace-utilities')[1] ?? '';
    const after = foot.split('</div>')[0] ?? '';
    expect(after).toContain('aria-label="Settings"');
    const css = fs.readFileSync(path.join(root, 'renderer/src/workspace-navigation.css'), 'utf8');
    expect(css).toContain('.workspace-utilities:last-child');
  });
});
