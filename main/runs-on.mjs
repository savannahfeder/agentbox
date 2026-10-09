// WHETHER THIS MAC IS ALREADY SIGNED INTO A CODING AGENT, AND WHICH ONE.
//
// w-e217e577e5, 2026-10-07. A new user ran an agent and, in her words, was
// "like, 'Oh my God, where are the tokens coming from? I didn't even connect my
// account.'" The app finds whichever coding agent is already signed in on the
// Mac and spends that subscription without ever saying so.
//
// WHICH ENGINE, AND NOTHING ELSE. This read the plan tier too for a few hours,
// so a row in the sidebar's foot could say "Claude · Max 20x"; that row came
// out the same day and the tier came out with it ("very critically, I want to
// get rid of that Claude Max 20x plan"). The question the walk answers is "did
// it connect to something of mine", and the engine is the whole of that answer.
// What somebody is paying for is on each agent's own page in Settings, which is
// where you go when you actually want it (main/settings.mjs reads
// main/claude-plan.mjs and main/codex-account.mjs for exactly that).
//
// NULL IS AN ORDINARY ANSWER AND IT MEANS SAY NOTHING. A Mac mid-setup, a config
// file being rewritten under us, a login that is not there: all null, and the
// walk then says nothing at all rather than guessing. That Mac is also the one
// that gets the plan question instead, which says all of this out loud already.
//
// IT IS CACHED ON THE LOGIN FILES' OWN TIMES, NOT ON A CLOCK. The snapshot is
// built every ten seconds and `~/.claude.json` is 148 KB on the machine this was
// written on, so parsing it per tick is work nobody asked for; it is also a file
// that genuinely changes, since Claude Code refetches its own profile as it
// runs. `signInFiles`/`signInStamp` (main/sign-in-files.mjs) already name the
// files a login writes and read their modification times and nothing else, so
// the cache key is the newest of those times. A moved time re-reads. A cache
// that aged out on a timer instead would be either stale after a sign-in or
// re-parsing for nothing, and the file itself knows which.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planFile } from './claude-plan.mjs';
import { codexAccount, codexAuthFile } from './codex-account.mjs';
import { signInFiles, signInStamp } from './sign-in-files.mjs';

/** keyed by engine, home and folder, valued by the stamp it was read at. */
const remembered = new Map();

/**
 * WHAT THE FLEET IS RUNNING ON, or null because nothing readable is signed in.
 *
 * @param {object} facts
 * @param {string} facts.engine Which coding agent the workspace runs on, which
 *   the supervisor has already decided (`Supervisor#engineFacts`). Never worked
 *   out here: the capability gate lives there, and a line that guessed could
 *   name the subscription the fleet is not spending.
 * @param {string} [facts.claudeProfile] The Claude login, `default` or a folder.
 * @param {string} [facts.codexHome] The CODEX_HOME this workspace runs on.
 * @returns {{ engine: string }|null}
 */
export function runsOn({ engine = null, home = os.homedir(), claudeProfile = 'default', codexHome = null } = {}) {
  if (engine !== 'claude' && engine !== 'codex') return null;
  const folder = engine === 'codex'
    ? (codexHome || path.join(home, '.codex'))
    : (!claudeProfile || claudeProfile === 'default' ? null : claudeProfile);
  // The home is in the key as well as the folder. A default Claude login has no
  // folder of its own, so without it two homes share one entry, which is exactly
  // what a test with a throwaway home does and what a packaged app would do if
  // HOME ever moved under it.
  const key = `${engine}:${home}:${folder ?? 'default'}`;
  const stamp = signInStamp(signInFiles({ engine, folder, home }));
  const seen = remembered.get(key);
  if (seen && seen.stamp === stamp) return seen.value;
  const value = stamp && signedIn(engine, { home, claudeProfile, folder }) ? { engine } : null;
  remembered.set(key, { stamp, value });
  return value;
}

/** Whether there is a login in there at all. Never throws, never guesses. */
function signedIn(engine, { home, claudeProfile, folder }) {
  if (engine === 'codex') return !!codexAccount(null, { file: codexAuthFile(folder) });
  // `oauthAccount` is the object Claude Code writes when somebody signs in, and
  // its absence is the honest "nobody is". A file with no account in it is an
  // ordinary thing: `~/.claude.json` also holds project history, so it exists on
  // plenty of Macs nobody has logged in on.
  try {
    const account = JSON.parse(fs.readFileSync(planFile(claudeProfile, home), 'utf8'))?.oauthAccount;
    return !!account && typeof account === 'object';
  } catch {
    return false;
  }
}

/** Forgets every cached reading. For tests, and for a sign-out that lands. */
export function forgetRunsOn() {
  remembered.clear();
}
