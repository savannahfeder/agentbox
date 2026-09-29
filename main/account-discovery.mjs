// THE ACCOUNTS AGENTBOX RUNS ON ARE THE ONES ON THE DISK, not the ones somebody
// remembered to type into a config file.
//
// It was logged in. ~/.claude-work held work@example.com, signed in at 15:19
// that afternoon, and the fleet had been stopped since 15:14 on a personal
// subscription that had hit its WEEKLY limit — three days of nothing, with a
// rested paid account on the same disk. The register of accounts was the
// hand-written `authProfiles` key in zero.config.json, which nothing in the app
// writes and nothing in the app checks against reality, so an account set up
// the ordinary way (a new CLAUDE_CONFIG_DIR, a /login) was invisible BY
// CONSTRUCTION. There was no symptom: the page drew two healthy rows and every
// word on them was true.
// tests/an-account-she-signed-into-is-not-invisible.test.mjs has the folders,
// the ids and the CLI's own sentence.
//
// THE RULE, and it is four lines because each one was a way to get this wrong:
//
//   - A folder under the home directory named `.claude` or `.claude-<anything>`
//     that holds a login is an account.
//   - IT ONLY COUNTS IF ITS SUBSCRIPTION IS NEW. Two folders holding one
//     account is a real setup (~/.claude and ~/.claude-second both signed in
//     as the same person), and counting it twice sends two thirds of every
//     spawn round to an account that is already at its limit. The test is on
//     `accountUuid`, the id Claude Code stores for the subscription itself,
//     never on the email, because one email can hold more than one subscription.
//   - NOTHING THE USER CONFIGURED IS EVER DROPPED OR REORDERED. The config is a
//     decision; this is only a discovery. Discovered accounts go after the
//     configured ones.
//   - A folder with no login is not an account. Folders such as
//     ~/.claude-swap-backup or ~/.claude-worktrees are exactly that, and
//     neither is a place to send work.
//
// WHY THERE IS NO REFRESH BUTTON. It is not costly.
// The directory listing is cached on the home folder's own mtime, so the
// readdir happens once and then only when a folder appears or disappears; the
// login inside each candidate is read through `accountIdentity`, which is
// already cached on that file's mtime. Measured on her own home folder on
// 2026-08-31 — 200 entries, 9 .claude-shaped, 5 of them directories, 3 holding
// a login — a warm call costs 0.029 ms, and it is asked on the supervisor's
// 15-second tick. A button would only be a thing to remember to press.
//
// THE DELIBERATE LIMIT: one level, under the home directory only. A profile
// somewhere else stays a config entry, which is what `authProfiles` is still
// for and why nothing here removes it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountIdentity, defaultClaudeHome } from './account-tooling.mjs';

// The listing, held against the home folder's mtime. Creating or deleting a
// folder there moves it; signing IN does not, which is why only the listing is
// cached here and the login is re-read per call.
let listCache = { home: null, mtime: -1, names: [] };

function claudeShapedDirs(home) {
  let mtime;
  try { mtime = fs.statSync(home).mtimeMs; } catch { return []; }
  if (listCache.home === home && listCache.mtime === mtime) return listCache.names;

  let names = [];
  try {
    names = fs.readdirSync(home, { withFileTypes: true })
      // `.claude` and `.claude-second`, yes. `claude-work` with no dot is
      // somebody's source checkout and we do not go reading logins out of it.
      .filter((e) => e.name === '.claude' || e.name.startsWith('.claude-'))
      // A file is not an account however it is named, and ~/.claude.json sits
      // right there next to the folders. `isDirectory` follows nothing, so a
      // symlinked profile folder is checked properly rather than skipped.
      .filter((e) => { try { return fs.statSync(path.join(home, e.name)).isDirectory(); } catch { return false; } })
      .map((e) => e.name)
      .sort();
  } catch {
    names = [];
  }
  listCache = { home, mtime, names };
  return names;
}

/**
 * EVERY CLAUDE ACCOUNT SIGNED IN ON THIS MACHINE, in a stable order with the
 *  default login first when it has one. `{ dir, email, accountUuid }` per
 *  folder; a folder with no login is not in the list at all.
 *
 *  Folders holding the same subscription are all returned — deduplication is
 *  `effectiveProfiles`' job, because a screen that wants to say "these two are
 *  one account" needs to have seen both. */
export function discoverProfiles({ home = os.homedir() } = {}) {
  const out = [];
  const seen = new Set();
  const dflt = defaultClaudeHome(home);
  for (const name of claudeShapedDirs(home)) {
    const dir = path.join(home, name);
    if (seen.has(dir)) continue;
    seen.add(dir);
    const id = accountIdentity(dir, { home });
    if (!id?.accountUuid) continue;
    out.push({ dir, email: id.email, accountUuid: id.accountUuid });
  }
  // The default login leads, because it is the one every other account is a
  // second of, and the rest keep the disk's alphabetical order so the fleet's
  // round-robin does not reshuffle itself between ticks.
  return out.sort((a, b) => (a.dir === dflt ? -1 : b.dir === dflt ? 1 : 0));
}

/**
 * THE PROFILES THE FLEET ACTUALLY RUNS ON: the configured ones first, exactly
 *  as written, then any subscription found on the disk that none of the
 *  configured ones is already running on.
 *
 *  Profiles are the strings the rest of the app has always used: the literal
 *  'default' for ~/.claude (which is what spawning with no CLAUDE_CONFIG_DIR
 *  means), and an absolute folder path for anything else. It always answers
 *  with at least ['default'], because somewhere has to be spawnable. */
export function effectiveProfiles(configured, { home = os.homedir() } = {}) {
  const mine = (Array.isArray(configured) ? configured : []).map((p) => p || 'default');
  const list = mine.length ? [...mine] : ['default'];
  const dflt = defaultClaudeHome(home);
  const dirOf = (p) => (p === 'default' ? dflt : p);

  // Which subscriptions her own list already covers. A configured folder with
  // no readable login covers nothing, which is right: it cannot run anything,
  // so it cannot be the reason a working account is left out.
  const have = new Set();
  for (const p of list) {
    const id = accountIdentity(p === 'default' ? null : dirOf(p), { home });
    if (id?.accountUuid) have.add(id.accountUuid);
  }
  const listed = new Set(list.map((p) => dirOf(p)));

  for (const found of discoverProfiles({ home })) {
    if (listed.has(found.dir)) continue;
    if (have.has(found.accountUuid)) continue;
    have.add(found.accountUuid);
    listed.add(found.dir);
    list.push(found.dir === dflt ? 'default' : found.dir);
  }
  return list;
}

/**
 * Test seam only: forget the cached directory listing. Nothing in the app
 *  calls this — the mtime check is what keeps it honest at runtime. */
export function forgetDiscovery() {
  listCache = { home: null, mtime: -1, names: [] };
}
