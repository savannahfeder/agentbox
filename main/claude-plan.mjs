// WHICH CLAUDE PLAN THIS MACHINE IS SIGNED IN ON, and what Agentbox should do
// about it. Written for, 2026-08-29, on the one bullet from a tester's
// onboarding that no session had ever looked at: "not on max plan?"
//
// THE PROBLEM. Agentbox runs several Claude Code sessions at once and the number
// is a flat default (`maxConcurrentSessions: 3`, main/config.mjs) that was
// chosen with the biggest plan in mind and has never been anything else. Nothing
// anywhere in the app mentions a plan: not the walk, not the Accounts page, not
// a row that dies. So a person on a smaller plan gets three sessions started on
// their behalf, all three burn the same allowance, and what they see is agents
// that are slow and rows that fail for a reason nobody named. That is what the
// founder was asking out loud while she watched a tester use it.
//
// THE ANSWER IS ALREADY ON THE DISK. Claude Code writes its own account profile
// into its config file and refreshes it as it runs. On a machine with two
// accounts signed in, for example:
//
//   ~/.claude.json                  oauthAccount.organizationType        claude_max
//                                   oauthAccount.organizationRateLimitTier  default_claude_max_20x
//                                   profileFetchedAt                    (within the day)
//   ~/.claude-second/.claude.json   the same two fields
//                                   profileFetchedAt                    (within the day)
//
// Each is refetched within the day, so the field is live rather than a one-time
// stamp from a login months ago, and it is the honest source: it is Claude
// Code's own answer about its own subscription, not a guess of ours.
//
// WHERE THE FILE IS. Claude Code keeps its config at CLAUDE_CONFIG_DIR when
// that is set, and at the home folder when it is not. Agentbox's default account
// runs with nothing set, so its file is `~/.claude.json`; a second account runs
// with CLAUDE_CONFIG_DIR pointing at a folder, so its file is inside that
// folder (main/supervisor.mjs sets exactly that per spawn). Both are verified
// above. Note that a `~/.claude/.claude.json` can also exist and be days
// STALE — it is what a run with CLAUDE_CONFIG_DIR=~/.claude left behind.
// It is not read for the default account, and that is deliberate: the rule here
// is Claude Code's own rule, not a search for the likeliest looking file.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not guess the strings for plans
// nobody here has seen in a real file, and inventing `default_claude_pro` in
// a table would be a number nobody
// measured. So `max` is decided by looking for the word max, the label is
// derived from the raw string mechanically, and anything unreadable comes back
// `known: false` and changes nothing anywhere.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * WHERE CLAUDE CODE'S CONFIG FILE IS FOR ONE OF AGENTBOX'S ACCOUNTS.
 *
 *  'default' is the account with no CLAUDE_CONFIG_DIR, so its file is beside
 *  the home folder rather than inside `~/.claude`. Anything else is the folder
 *  CLAUDE_CONFIG_DIR names, and the file is inside it. */
export function planFile(profile, home = os.homedir()) {
  if (!profile || profile === 'default') return path.join(home, '.claude.json');
  const dir = profile.startsWith('~/') ? path.join(home, profile.slice(2)) : profile;
  return path.join(dir, '.claude.json');
}

/**
 * THE WORDS A PERSON WOULD USE FOR A RATE LIMIT TIER, worked out from the
 *  string rather than from a table, so a plan this code has never seen still
 *  reads as itself instead of as "unknown".
 *
 *  `default_claude_max_20x` -> `Max 20x`. The `default_` and `claude_` parts
 *  are Anthropic's own scaffolding around the name and say nothing to anybody
 *  looking at a settings page. */
export function planLabel(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const bare = s.replace(/^default_/, '').replace(/^claude_/, '');
  if (!bare) return null;
  return bare
    .split('_')
    .filter(Boolean)
    .map((word) => (/^\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/**
 * WHETHER A TIER STRING IS A MAX PLAN. Whole word, so a plan that merely
 *  contains the letters (a hypothetical `maximum_something`) is not mistaken
 *  for one. */
export function isMaxTier(raw) {
  return /(^|_)max(_|$)/i.test(String(raw ?? ''));
}

/**
 * WHAT PLAN ONE ACCOUNT IS ON.
 *
 *  Never throws and never guesses. A missing file, a half-written one, a login
 *  Claude Code has not fetched a profile for yet: all of them come back
 *  `known: false`, which every caller here treats as "leave everything exactly
 *  as it was". */
export function readPlan(profile, { home = os.homedir(), file = null } = {}) {
  const at = file ?? planFile(profile, home);
  const none = { known: false, max: false, label: null, tier: null, from: null, file: at };
  let account = null;
  try {
    account = JSON.parse(fs.readFileSync(at, 'utf8'))?.oauthAccount ?? null;
  } catch {
    return none;
  }
  if (!account || typeof account !== 'object') return none;
  // THE ORDER IS MOST SPECIFIC FIRST. A rate limit tier names the plan AND its
  // size (`max_20x` against `max_5x`), which is the thing worth showing; the
  // organization type only says which family it is in. The user tier is read
  // last because it is null on both accounts measured here and exists for seats
  // inside an organization.
  const tier = [account.organizationRateLimitTier, account.userRateLimitTier, account.organizationType]
    .find((v) => typeof v === 'string' && v.trim());
  if (!tier) return none;
  const from = tier === account.organizationRateLimitTier
    ? 'org-tier'
    : tier === account.userRateLimitTier ? 'user-tier' : 'org-type';
  return { known: true, max: isMaxTier(tier), label: planLabel(tier), tier, from, file: at };
}

/**
 * THE PLAN ON EVERY ACCOUNT AGENTBOX IS CONFIGURED TO RUN ON, in the same order
 *  the supervisor round-robins them. */
export function readPlans(profiles, { home = os.homedir() } = {}) {
  const list = (Array.isArray(profiles) && profiles.length ? profiles : ['default']).map((p) => p || 'default');
  return list.map((profile) => ({ profile, ...readPlan(profile, { home }) }));
}

/**
 * HOW MANY SESSIONS AT ONCE, WHEN NOBODY HAS SAID.
 *
 *  `fallback` is the number the app has always used and is what comes back in
 *  every case except one: at least one account is readable and is NOT a Max
 *  plan. Then it is one at a time.
 *
 *  WHY THE SMALLEST ACCOUNT DECIDES. The cap is ONE number applied per account
 *  (main/supervisor.mjs multiplies it by the live accounts), so there is no way
 *  here to give a Max account three and a smaller one fewer. Between over- and
 *  under-running somebody's allowance, the under-run is the one that still
 *  leaves them a working app, and the number is a stepper on the Agents page
 *  that they can put back up.
 *
 *  AND AN UNREADABLE ACCOUNT NEVER LOWERS IT. Somebody whose config file we
 *  cannot parse gets exactly the app they had before this existed. */
export function slotsForPlans(plans, fallback = 3) {
  const known = (plans ?? []).filter((p) => p.known);
  if (!known.length) return fallback;
  return known.every((p) => p.max) ? fallback : 1;
}
