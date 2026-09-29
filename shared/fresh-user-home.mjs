// A THROWAWAY HOME, SO AGENTBOX CAN BE OPENED BY SOMEBODY WHO HAS NEVER OPENED IT.
//
// This is the recipe `scripts/fresh-user.mjs` has used since 2026-08-20, lifted
// out of it so the app itself can use the same one.A downloaded app has no repo
// beside it and no terminal in front of it, so the script could never be the
// answer to the first half of that; the app has to be able to do it to itself.
//
// WHY A THROWAWAY HOME AND NOT A RESET. Agentbox keeps its state in three places
// and a packaged app on her Mac inherits two of them: `<appData>/Astral` (the
// renderer's settings, her theme, her skin, her zoom, her project order),
// `zero.config.json` beside it (her store root and her keys), and the store
// itself wherever storeRoot points. Deleting any of them to get a clean run
// would take her real setup with it, which is not a thing a test may cost. So
// NOTHING IS DELETED, EVER. A second copy is launched inside a fresh home under
// /tmp and all three land in there: fresh settings, no config file so it falls
// to DEFAULTS, and an empty store at `<throwaway>/<Name>`.
//
// WHY IT DOES NOT KILL HER AGENTS, which is the whole reason it is usable.
// `main.mjs` quits on `app.requestSingleInstanceLock`, and that lock is keyed
// on userData. A throwaway home means a different userData, so the fresh copy
// takes its own lock and both run side by side. Nothing quits, `before-quit`
// never fires, `supervisor.killAll` is never reached.
//
// CFFIXED_USER_HOME IS THE LOAD-BEARING ONE. `HOME` alone does NOT move
// `app.getPath('appData')` on macOS — Chromium asks Core Foundation, not the
// environment — so a launch with only HOME set shares her userData, hits the
// lock and quits in under half a second, which is the "it crashes immediately"
// she reported on 2026-08-20. Both variables, always. `freshEnv` is the only
// place either is written.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { envName, envNames, nameSlug } from './product-name.mjs';

/**
 * Where every throwaway home lives. One folder so `--clean` and the ⌘K row's
 *  own tidy-up have exactly one thing to delete. */
export const HOMES = path.join(os.tmpdir(), `${nameSlug}-fresh-user`);

// A THROWAWAY INSTALL IS NOT A PERSON, AND IT HAS TO SAY SO OUT LOUD.
//
// Why it happened. A throwaway home is a throwaway userData, so
// `readInstallId` finds no file and writes a NEW random one; and `npm run
// fresh` launches the PACKAGED app, which carries the baked PostHog key. So
// every test run arrived as a brand new stranger who opened Agentbox once and
// never came back, which is also exactly what a real user who bounced looks
// like. Nothing downstream could tell them apart.
//
// THE ID IS NOT MADE STICKY, AND THAT IS DELIBERATE. Carrying an install id
// across a wipe would make that sentence false for everybody, to fix something
// that only ever happens on her own Mac. So the throwaway home declares itself
// instead, and a copy inside one sends under ONE fixed id that names itself as
// not a person.
export const FRESH_USER_ENV = envName('FRESH_USER');
export const FRESH_INSTALL_ID = `${nameSlug}-fresh-user`;

/**
 * Is this copy of Agentbox running inside a throwaway home? TWO tests, because
 *  the answer still has to be right for a launch route nobody has written yet.
 *  The mark is what `freshEnv` sets. The path is the fallback, and it is safe
 *  because no real person's home is ever under `HOMES`. */
export function runningAsAFreshUser(env = process.env) {
  if (env?.[FRESH_USER_ENV] === '1') return true;
  const home = env?.CFFIXED_USER_HOME || env?.HOME;
  return !!home && (home === HOMES || home.startsWith(HOMES + path.sep));
}

/**
 * The throwaway homes on disk, oldest first. Sorted by name, which is a clock
 *  stamp, so the last one is the newest. */
export function existingHomes() {
  if (!fs.existsSync(HOMES)) return [];
  return fs
    .readdirSync(HOMES)
    .map((name) => path.join(HOMES, name))
    .filter((dir) => { try { return fs.statSync(dir).isDirectory(); } catch { return false; } })
    .sort();
}

/**
 * Named by the clock so the newest can be picked by sorting, and so two fresh
 *  users started a minute apart are told apart on disk. */
export function makeHome(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const home = path.join(HOMES, stamp);
  fs.mkdirSync(home, { recursive: true });
  return home;
}

/**
 * Symlinks, not copies: nothing is duplicated, and nothing here can write back
 *  over her real install that the app could not already write. */
function link(from, to) {
  try {
    if (!fs.existsSync(from)) return false;
    // A LINK THAT IS ALREADY THERE IS ONLY GOOD IF IT STILL RESOLVES. `lstat`
    // does not follow a symlink, so a DANGLING one — the target moved, or a
    // throwaway home this one was chained off got tidied away — answered "yes,
    // linked" while the file was not reachable. The copy then reported nothing
    // wrong and told whoever opened it "Agentbox could not find Claude Code on
    // this Mac", which is the one screen in the walk that cannot be argued
    // with. Existence is checked THROUGH the link, and a dead one is replaced
    // rather than believed.
    if (fs.lstatSync(to, { throwIfNoEntry: false })) {
      if (fs.existsSync(to)) return true;
      fs.rmSync(to, { force: true });
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.symlinkSync(from, to);
    // And the answer is what the fresh copy will really see, not what we just
    // tried to do.
    return fs.existsSync(to);
  } catch {
    return false;
  }
}

// WHAT IS DELIBERATELY LINKED THROUGH, and why it is still an honest test.
// Exactly two things, both of which a stranger already has before they ever
// meet Agentbox, and neither of which Agentbox owns:
//
//   ~/.local/bin/claude    Claude Code itself. The product's prerequisite.
//   ~/Library/Keychains    where Claude Code's login actually lives.
//
// THE KEYCHAIN ONE IS NOT OPTIONAL AND IT IS NOT OBVIOUS. The token is a
// `Claude Code-credentials` item in the login keychain, and macOS finds that
// keychain at `$HOME/Library/ Keychains`, so redirecting HOME hides it. Link
// it and the same command answers "ok".
//
// `~/.claude` ITSELF IS THE ONE CHOICE. `main/agents.mjs` reads
// `~/.claude/sessions` and `~/.claude/projects`, so linking it puts the Claude
// Code sessions already on this Mac into the fresh inbox. It is not starting
// from absolute zero, so it is a flag rather than a default here and the
// caller says which test it wants.
export function prepareHome(home, { withAgents = false, realHome = os.homedir() } = {}) {
  const claudeBin = link(path.join(realHome, '.local/bin/claude'), path.join(home, '.local/bin/claude'));
  const keychain = link(path.join(realHome, 'Library/Keychains'), path.join(home, 'Library/Keychains'));
  const agents = withAgents
    ? link(path.join(realHome, '.claude'), path.join(home, '.claude'))
    : false;
  return { home, claudeBin, keychain, agents };
}

/**
 * THE VARIABLES THAT POINT AT HER REAL WORLD, AND WHY A FRESH COPY MAY NOT
 * INHERIT ONE OF THEM.
 *
 * This was the whole bug. `main.mjs` writes the store root into its own
 * `process.env` at startup so every store module can read it at call time, and
 * `freshEnv` spread that environment straight into the child. So the copy that
 * was supposed to be a stranger got a throwaway HOME, no config file and
 * DEFAULTS, exactly as the note at the top of this file promises, and then read
 * the store root out of the environment anyway and opened HER INBOX. She sent a
 * screenshot of it on 2026-09-27: the fresh window listing her own rows, down
 * to the personal ones, with no first run in front of it.
 *
 * Nothing about this is new and it is not the rename's doing. One variable was
 * always enough, and the rename only added the names beside it, which is why
 * this strips EVERY spelling rather than the current one.
 *
 * THE FIXTURE SWITCHES GO TOO, for the same reason rather than a second one. A
 * fresh user is an ordinary first launch of the real app; a copy started from a
 * terminal that had `ZERO_FIXTURES` in it would show canned data and a copy
 * with `ZERO_NO_SUPERVISOR` would never start an agent, and in both cases what
 * she is looking at is not what a stranger would see.
 */
export const NOT_INHERITED = Object.freeze([
  ...envNames('HOME'),
  'ZERO_FIXTURES',
  'ZERO_NO_SUPERVISOR',
]);

/**
 * The environment a fresh copy is launched with. BOTH VARIABLES, ALWAYS: see
 *  the note at the top of this file for what happens with only one. The third
 *  is the mark, so the copy knows it is a test and does not count as a person;
 *  see `runningAsAFreshUser` above. And everything in `NOT_INHERITED` is taken
 *  out, because a stranger's copy may not be handed her store. */
export function freshEnv(home, env = process.env) {
  const fresh = { ...env, HOME: home, CFFIXED_USER_HOME: home, [FRESH_USER_ENV]: '1' };
  for (const key of NOT_INHERITED) delete fresh[key];
  return fresh;
}

/** Make one and link its two prerequisites, in a single call. */
export function newFreshHome({ withAgents = false, realHome = os.homedir(), now } = {}) {
  return prepareHome(makeHome(now), { withAgents, realHome });
}
