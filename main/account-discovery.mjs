// THE ACCOUNTS AGENTBOX KNOWS ABOUT ARE THE ONES ON THE DISK, not the ones
// somebody remembered to type into a config file.
//
// The register of accounts was the hand-written `authProfiles` key in
// zero.config.json, which nothing in the app writes and nothing in the app
// checks against reality, so an account set up the ordinary way (a new
// CLAUDE_CONFIG_DIR, a /login) was invisible BY CONSTRUCTION: it could not be
// seen on the Accounts page and could not be picked.
// tests/an-account-she-signed-into-is-not-invisible.test.mjs has the folders,
// the ids and the CLI's own sentence.
//
// KNOWING ABOUT AN ACCOUNT IS NOT SENDING WORK TO IT (w-dac993a554). This list
// is what the Accounts page draws and what somebody picks from; the work goes
// to one account, `Supervisor#_theOneAccount`. A second subscription found here
// sits idle until it is picked or a project is tied to it.
//
// THE RULE, and it is four lines because each one was a way to get this wrong:
//
//   - A folder under the home directory named `.claude` or `.claude-<anything>`
//     that holds a login is an account.
//   - IT ONLY COUNTS IF ITS SUBSCRIPTION IS NEW. Two folders holding one
//     account is a real setup (~/.claude and ~/.claude-second both signed in
//     as the same person), and counting it twice draws one subscription as two
//     rows to choose between. The test is on `accountUuid`, the id Claude Code
//     stores for the subscription itself, never on the email, because one
//     email can hold more than one subscription.
//   - NOTHING THE USER CONFIGURED IS REORDERED, and nothing is dropped except
//     a home-directory folder that fails the two rules above and below: one
//     with no login, or a second one holding a subscription already listed.
//     Discovered accounts go after the configured ones.
//   - A folder with no login is not an account. Folders such as
//     ~/.claude-swap-backup or ~/.claude-worktrees are exactly that, and
//     neither is a place to send work.
//
// WHY THERE IS NO REFRESH BUTTON. It is not costly.
// The directory listing is cached on the home folder's own mtime, so the
// readdir happens once and then only when a folder appears or disappears; the
// login inside each candidate is read through `accountIdentity`, which is
// already cached on that file's mtime. Measured on a home folder of 200
// entries, 9 .claude-shaped, 5 of them directories, 3 holding a login, a
// warm call costs 0.029 ms, and it is asked on the supervisor's
// 15-second tick. A button would only be a thing to remember to press.
//
// THE DELIBERATE LIMIT: one level, under the home directory only. A profile
// somewhere else stays a config entry, which is what `authProfiles` is still
// for and why nothing here removes it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountIdentity, defaultClaudeHome } from './account-tooling.mjs';
import { shellDataDirsNow } from './shell-path.mjs';

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
  // second of and the one work runs on until somebody picks another
  // (`_theOneAccount` takes the first of this list). The rest keep the disk's
  // alphabetical order, so the order does not change between ticks.
  return out.sort((a, b) => (a.dir === dflt ? -1 : b.dir === dflt ? 1 : 0));
}

/** A `.claude-<anything>` folder directly in the home directory: the shape
 *  discovery looks for and Add account makes. */
function isHomeFolder(dir, home) {
  const full = path.resolve(dir);
  return path.dirname(full) === path.resolve(home) && path.basename(full).startsWith('.claude-');
}

/**
 * THE PROFILES THE FLEET ACTUALLY RUNS ON: the configured ones first, in her
 *  order, then any subscription found on the disk that none of the configured
 *  ones is already running on.
 *
 *  Profiles are the strings the rest of the app has always used: the literal
 *  'default' for ~/.claude (which is what spawning with no CLAUDE_CONFIG_DIR
 *  means), and an absolute folder path for anything else. It always answers
 *  with at least ['default'], because somewhere has to be spawnable. */
export function effectiveProfiles(configured, { home = os.homedir(), shellDir = shellDataDirsNow().CLAUDE_CONFIG_DIR } = {}) {
  const mine = (Array.isArray(configured) ? configured : []).map((p) => p || 'default');
  const dflt = defaultClaudeHome(home);
  const dirOf = (p) => (p === 'default' ? dflt : p);
  const isDefault = (p) => p === 'default' || dirOf(p) === dflt;
  const idOf = (p) => accountIdentity(isDefault(p) ? null : dirOf(p), { home });

  // Which subscriptions her own list already covers, the default login's first
  // so that it is the one kept when a second folder holds the same account.
  const have = new Set();
  for (const p of mine) {
    const id = isDefault(p) ? idOf(p) : null;
    if (id?.accountUuid) have.add(id.accountUuid);
  }

  // A `.claude-<n>` FOLDER IN THE HOME DIRECTORY IS AN ACCOUNT ONLY WHEN IT IS
  // SIGNED IN, AND ONLY ONCE PER SUBSCRIPTION, whether discovery found it or
  // the config names it. Add account used to write its folder into the config
  // before the sign-in, so an abandoned one sat in Settings as "Not signed in"
  // and was handed every other task; and one account signed into two folders
  // was listed twice (tests/an-account-shows-once-and-only-once-it-is-signed-in).
  // The default login is never judged, and a folder anywhere else is a
  // hand-written setting and stays exactly as written.
  const list = [];
  for (const p of mine) {
    if (isDefault(p)) { list.push(p); continue; }
    const id = idOf(p);
    if (isHomeFolder(dirOf(p), home)) {
      if (!id?.accountUuid || have.has(id.accountUuid)) continue;
    }
    if (id?.accountUuid) have.add(id.accountUuid);
    list.push(p);
  }
  if (!list.length) list.push('default');

  // THE LOGIN THE PERSON'S SHELL PROFILE POINTS AT (w-6d8c543a43). Their
  // terminal's `claude` reads the folder `CLAUDE_CONFIG_DIR` names in .zshrc,
  // which an app opened from the Dock never sees. When the default holds no
  // login, or the same account, the shell's folder takes its place; a
  // different account at ~/.claude keeps running beside it. It is always a
  // folder, never 'default', even when it IS ~/.claude: Claude Code names its
  // keychain entry after the variable, so naming the folder out loud is a
  // different sign-in from naming nothing.
  const shell = typeof shellDir === 'string' && path.isAbsolute(shellDir) ? shellDir : null;
  const shellId = shell ? accountIdentity(shell, { home }) : null;
  if (shellId?.accountUuid && !list.includes(shell)) {
    const dfltId = idOf('default');
    const takesDefault = !dfltId?.accountUuid || dfltId.accountUuid === shellId.accountUuid;
    if (takesDefault && list.some(isDefault)) {
      list.splice(list.findIndex(isDefault), 1, shell);
      for (let i = list.length - 1; i >= 0; i--) if (list[i] !== shell && isDefault(list[i])) list.splice(i, 1);
      have.add(shellId.accountUuid);
    } else if (!have.has(shellId.accountUuid)) {
      have.add(shellId.accountUuid);
      list.push(shell);
    }
  }
  const listed = new Set(list.map((p) => dirOf(p)));
  if (shell && list.includes(shell)) listed.add(dflt);

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
 * WHAT IS WRONG WITH THE SUBSCRIPTION THIS ROW STANDS FOR, not merely with the
 *  folder it is named after.
 *
 *  Trouble is filed per FOLDER, because a folder is what a worker is handed.
 *  `effectiveProfiles` above lists one row per SUBSCRIPTION, dropping a second
 *  folder holding an account it already has. So a limit hit in the dropped
 *  folder is filed under a key no row carries and is drawn nowhere, while the
 *  row for that same subscription goes on showing whatever was last filed on
 *  the listed folder, however old.
 *
 *  Measured 2026-10-16: ~/.claude-3 hit a session limit at 3:15pm and the row
 *  for that subscription showed an "organization has turned Claude Code off"
 *  filed on ~/.claude five days earlier. Both folders hold accountUuid
 *  8fe4a357; the newest fact about the account was the invisible one.
 *
 *  THE NEWEST READING WINS, because that is the only honest answer when two
 *  folders of one subscription disagree: each entry is what was true when a
 *  run last died there, and nothing clears a folder nothing spawns on.
 *  Codex keys are never considered — an account's key carries its engine. */
export function troubleForProfile(troubles, profile, { home = os.homedir() } = {}) {
  const dflt = defaultClaudeHome(home);
  const dirOf = (p) => (p === 'default' ? dflt : p);
  const idOf = (p) => accountIdentity(dirOf(p) === dflt ? null : dirOf(p), { home });
  const own = troubles?.[profile] ?? null;
  const mine = idOf(profile)?.accountUuid;
  if (!mine) return own;
  const when = (t) => t?.at ?? t?.since ?? 0;
  let best = own;
  for (const [key, t] of Object.entries(troubles ?? {})) {
    if (!t || key === profile || key.startsWith('codex:')) continue;
    if (idOf(key)?.accountUuid !== mine) continue;
    if (when(t) > when(best)) best = t;
  }
  return best;
}

/**
 * Test seam only: forget the cached directory listing. Nothing in the app
 *  calls this — the mtime check is what keeps it honest at runtime. */
export function forgetDiscovery() {
  listCache = { home: null, mtime: -1, names: [] };
}
