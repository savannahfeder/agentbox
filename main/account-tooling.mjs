// A SECOND ACCOUNT GETS YOUR SKILLS, COMMANDS AND AGENTS.
//
// THE PROBLEM THIS EXISTS FOR, and it is one we ship rather than one a person
// causes. The Accounts page in Settings tells a person to add a second
// subscription by logging in with CLAUDE_CONFIG_DIR set to a brand new folder.
// Do exactly that and the folder holds a login and nothing else, because
// Claude Code reads a session's skills, commands and subagents out of whichever
// folder CLAUDE_CONFIG_DIR names. The supervisor then round-robins every spawn
// across the accounts, so from that moment half the person's workers run with
// none of their own tooling and nothing anywhere says so. Measured on the one
// machine where it had happened: 65 skills on the first login, 12 on the
// second, and 445 of 874 sessions had already run on the empty one.
//
// THE REPAIR IS THREE SYMLINKS, made the first time a worker spawns on an
// account that is missing them:
//
//   <account folder>/skills   -> ~/.claude/skills
//   <account folder>/commands -> ~/.claude/commands
//   <account folder>/agents   -> ~/.claude/agents
//
// Links rather than copies, so a person edits a skill once and every account
// has it. Claude Code 2.1.236 follows them; that was verified on her machine
// rather than assumed.
//
// WHAT IS DELIBERATELY NOT IN THAT LIST. Plugins. They carry their own install
// records and two of the ones on this machine want their own login, so sharing
// that folder is a different and riskier change and it should be its own
// decision. Settings, credentials, history, projects and todos are per account
// on purpose: a shared `.credentials.json` or `settings.json` would be two
// subscriptions fighting over one file, which is the opposite of the point.
//
// WHAT THIS WILL NOT DO, in every case leaving the folder exactly as it found
// it: overwrite anything. If a name is already taken, by a real directory of
// their own, a file, or a link pointing somewhere else, it is left alone and
// reported as theirs. Someone who copied their commands across by hand keeps
// the copy.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The three folders a session reads its own tooling out of, and the only
 *  three. See the note above for why `plugins` is not here. */
export const SHARED_DIRS = ['skills', 'commands', 'agents'];

/**
 * Where the first login lives: the home folder Claude Code uses when nothing
 *  sets CLAUDE_CONFIG_DIR, which is the account every one of these links
 *  points back at. */
export function defaultClaudeHome(home = os.homedir()) {
  return path.join(home, '.claude');
}

/**
 * A FOLDER FOR THE NEXT CLAUDE LOGIN, MADE BEFORE ANYTHING IS ASKED TO USE IT.
 *
 * The twin of `makeCodexHome`, and it exists for the same reason that one does:
 * a second login is a second home folder, and the app should make it rather
 * than print a line telling somebody to make it themselves.
 *
 * THE NAME IS COUNTED, NEVER GUESSED. `~/.claude-2` and up, skipping anything
 * that exists, so pressing Add twice cannot hand the second login the first
 * one's folder and sign over a working account. The `.claude-` shape is also
 * exactly what main/account-discovery.mjs looks for, so a folder made here is
 * found again on its own even if the config entry is later removed by hand.
 *
 * Claude Code will create a config directory it is pointed at, unlike
 * codex-cli, so this is not strictly required to make the sign in work. It is
 * still made here: the row for the new account appears the moment she presses,
 * and a row for a folder that does not exist yet would be a screen describing
 * something that is not there.
 *
 * @returns {{ home: string, profile: string }} `profile` is the word the fleet
 *   spawns on, which for every home but the first one IS the path.
 */
export function makeClaudeHome({ home = os.homedir(), mkdir = fs.mkdirSync, exists = fs.existsSync } = {}) {
  for (let n = 2; n < 100; n += 1) {
    const dir = path.join(home, `.claude-${n}`);
    if (exists(dir)) continue;
    mkdir(dir, { recursive: true });
    return { home: dir, profile: dir };
  }
  throw new Error('There are already a lot of Claude folders in your home directory.');
}

/**
 * The one line that signs a new Claude account in, for the terminal to run.
 *
 *  `claude auth login` is their own sign-in command and this app has no
 *  business driving the browser half of it. The folder is spelled out in full
 *  rather than left as `~`, because `~` inside a variable assignment is not
 *  expanded by every shell the same way. */
export function claudeLoginCommand(home) {
  return `CLAUDE_CONFIG_DIR=${home} claude auth login`;
}

function realOrNull(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

/**
 * WHAT IS ALREADY AT THIS NAME, without following the link, because a link is
 *  precisely the thing we must be able to see. Returns 'none' when the name is
 *  free, 'ours' when it is already the link this module would have made, and
 *  'theirs' for anything else at all. */
function occupancy(target, source) {
  let st;
  try { st = fs.lstatSync(target); } catch { return 'none'; }
  if (!st.isSymbolicLink()) return 'theirs';
  const to = realOrNull(target);
  const from = realOrNull(source);
  return to && from && to === from ? 'ours' : 'theirs';
}

/**
 * MAKE THE LINKS FOR ONE ACCOUNT. `dir` is the folder that account's
 *  CLAUDE_CONFIG_DIR names.
 *
 *  Returns what happened, in the four kinds a person could be told about:
 *  `linked` are the ones this call created, `already` were there and correct,
 *  `theirs` are names that were taken and were left untouched, and `missing`
 *  are folders the first login does not have either, which is not a fault and
 *  is why nothing is created for them.
 *
 *  `skipped` is set instead when there was nothing to do at all, and is one of:
 *  'default' (the first login, which is the source), 'same' (an account folder
 *  that IS the first login by another path), or 'no-dir' (a folder that does
 *  not exist, which means the account is misconfigured and making a home for it
 *  would only hide that). */
export function linkAccountTooling(dir, { home = os.homedir(), source = null } = {}) {
  const src = source ?? defaultClaudeHome(home);
  const out = { dir, linked: [], already: [], theirs: [], missing: [], skipped: null };
  if (!dir || dir === 'default') return { ...out, skipped: 'default' };

  const real = realOrNull(dir);
  if (!real) return { ...out, skipped: 'no-dir' };
  try { if (!fs.statSync(real).isDirectory()) return { ...out, skipped: 'no-dir' }; } catch { return { ...out, skipped: 'no-dir' }; }
  // An account pointed at ~/.claude by a second path is the first login. Linking
  // a folder into itself would make skills/skills/skills and there is a real way
  // to arrive here: a symlinked home, or `authProfiles: ["~/.claude"]`.
  if (real === realOrNull(src)) return { ...out, skipped: 'same' };

  for (const name of SHARED_DIRS) {
    const from = path.join(src, name);
    if (!realOrNull(from)) { out.missing.push(name); continue; }
    const to = path.join(real, name);
    const held = occupancy(to, from);
    if (held === 'ours') { out.already.push(name); continue; }
    if (held === 'theirs') { out.theirs.push(name); continue; }
    try {
      fs.symlinkSync(from, to, 'dir');
      out.linked.push(name);
    } catch {
      // A read-only folder, a race with another Agentbox, a permission the app
      // does not have. The account still runs; it just runs the way it did
      // before this module existed, so this is reported and never thrown.
      out.theirs.push(name);
    }
  }
  return out;
}

/**
 * ONE LINE FOR THE TRACE, in the words she would use, or null when nothing
 *  changed and there is therefore nothing to say. Silence is the ordinary case:
 *  after the first spawn on an account every later one finds the links already
 *  made. */
export function toolingLine(result) {
  if (!result || !result.linked.length) return null;
  const where = path.basename(result.dir);
  return `Gave the ${where} account your ${list(result.linked)}.`;
}

function list(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* ------------------------- WHOSE LOGIN IS IN THERE ------------------------ */
// WHICH CLAUDE ACCOUNT A FOLDER IS ACTUALLY SIGNED IN AS.
//
// The Accounts page named its two rows `default` and `.claude-second`, which
// are folders, not people. So there was no way to tell from the screen which
// subscription either row was running on, and that can cost a person their
// second account. Say the page reports the second account signed out. They do
// exactly what it tells them to do, run the command and type /login, and the
// browser is already signed in as the account the first row uses, so the login
// hands that one back. The other account that had been in that folder is gone,
// replaced by the same account the first row was already using; the config
// backups the CLI itself writes show the swap. Nothing on the page changes
// when it happens, because nothing on the page had ever said whose account it
// was: "Idk which is logged in nothing changed in settings".
//
// One line of the answer, read from the file Claude Code keeps its own account
// in. Null when the folder holds no login, which reads on the page as the one
// honest thing we can say about it.
const identityCache = new Map();

export function accountIdentity(dir, { home = os.homedir() } = {}) {
  let file = path.join(dir || defaultClaudeHome(home), '.claude.json');
  if (!dir && !fs.existsSync(file)) file = path.join(home, '.claude.json');
  // Cached on the file's own mtime rather than on a timer. That file is ~120 KB
  // on this machine and the settings page re-reads on every poll, so parsing it
  // each time would be real work for an answer that changes about twice a
  // month; keying on mtime means a /login is still seen the moment it lands.
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch { return null; }
  const hit = identityCache.get(file);
  if (hit && hit.mtime === mtime) return hit.value;

  let value = null;
  try {
    const acct = JSON.parse(fs.readFileSync(file, 'utf8'))?.oauthAccount;
    if (acct?.emailAddress) {
      value = { email: acct.emailAddress, accountUuid: acct.accountUuid ?? null };
    }
  } catch {
    // A half-written file, or one Claude Code has changed the shape of. The
    // page falls back to naming the folder, which is what it did before this
    // existed, so a bad read costs the extra sentence and nothing else.
  }
  identityCache.set(file, { mtime, value });
  return value;
}

/**
 * THE SENTENCE FOR TWO ROWS THAT TURNED OUT TO BE ONE ACCOUNT. It only ever
 * speaks on a machine that already has two profile folders, so it describes a
 * setup rather than suggesting one.
 *
 *  The first fault is that it is an instruction she cannot carry out from this
 *  screen and, worse, one that only means anything to somebody who already has
 *  a second subscription. Anybody else reads it as Agentbox telling them to go
 *  and get one, which is the thing her standing rule forbids. So this sentence
 *  instructs nobody now. It says what is true and stops.
 *
 *  The second is her point about email, and it is a fair one, so it is worth
 *  writing down plainly: THE CHECK IS NOT ON THE EMAIL. It is on `accountUuid`,
 *  the id Claude Code stores for the subscription itself, so what it catches is
 *  two folders holding one subscription, not two folders showing one address.
 *
 * AND IT NO LONGER CLAIMS THEY ADD NO CAPACITY, because that is not what the
 * app does. `_capacity` in main/supervisor.mjs is `maxConcurrentSessions *
 * liveProfiles.length`, which counts FOLDERS. So a duplicated machine is told
 * it can run double and really does start double, all of it against one
 * subscription. The old sentence described what we intended; this one describes
 * what happens, and says the number above is too high rather than telling her
 * to go and change something.
 *  Null when the two really are different subscriptions. */
export function duplicateAccountNote(identities) {
  const seen = new Map();
  for (const id of identities) {
    if (!id?.accountUuid) continue;
    seen.set(id.accountUuid, (seen.get(id.accountUuid) ?? 0) + 1);
  }
  const dupes = [...seen.values()].filter((n) => n > 1).length;
  if (!dupes) return null;
  return 'Both of these are signed in to the same Claude account.'
    + ' That is one subscription rather than two, so the number above is higher than it should be.';
}
