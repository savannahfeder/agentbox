// OPEN A SECOND AGENTBOX AS SOMEBODY WHO HAS NEVER OPENED AGENTBOX.
//
// Two halves, and this file is the first one. The second half — walking the
// onboarding again inside the app she already has — is `restartFirstRun` in
// `renderer/src/onboarding.ts`, and it is the small one: it forgets that the
// walk was finished and forgets nothing else. Being a NEW USER is bigger than
// that. A new user has no projects, no settings, no theme, no store and no
// config file, and there was no way to be one on a downloaded app except to
// throw the install away, because `npm run fresh` needs a repo beside it and a
// terminal in front of it and a downloaded app has neither.
//
// So this launches THE RUNNING APP AGAIN, inside a throwaway home. The recipe
// is `shared/fresh-user-home.mjs`, which is the one `scripts/fresh-user.mjs`
// has used since 2026-08-20, so there is one place it is written down.
//
// NOTHING OF HERS IS TOUCHED. Nothing is deleted, nothing is copied out, and
// her own Agentbox keeps running with every agent in it: the single-instance
// lock is keyed on userData, a throwaway home is a different userData, so the
// two take separate locks and stand side by side. That is the property the
// whole thing rests on, and it is why this may not be written as a reset.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HOMES, existingHomes, prepareHome, makeHome, freshEnv } from '../shared/fresh-user-home.mjs';
import { NAME } from '../shared/product-name.mjs';

/**
 * What to run, and what to hand it.
 *
 *  PACKAGED IS THE CASE THAT MATTERS, because the whole ask is about a
 *  downloaded app: `process.execPath` is `Astral.app/Contents/MacOS/Astral`
 *  and it takes no arguments.
 *
 *  UNPACKAGED IT IS ELECTRON, and Electron on its own opens its default window
 *  rather than this app, so the app directory has to be handed back to it.
 *  `process.argv[1]` is that directory when Agentbox is run from source. This
 *  half exists so the row can be driven in a test and in a dev window rather
 *  than only in a build, which is the difference between a feature that is
 *  checked and one that is hoped for. */
export function relaunchCommand({ execPath = process.execPath, argv = process.argv, packaged = true } = {}) {
  if (packaged) return { bin: execPath, args: [] };
  const appPath = argv[1];
  return { bin: execPath, args: appPath ? [appPath] : [] };
}

/**
 * Open one. Returns what happened, in the words the app will show her: this
 *  is reported to the window rather than thrown, because a row in ⌘K that
 *  fails silently is worse than one that says why.
 *
 *  `withAgents` defaults ON. A new user of THIS product already has Claude
 *  Code, and the walk's last card offers to bring their agents over, so a
 *  fresh copy that cannot see any agent files tests a screen no real user of
 *  hers will ever get. Measured 2026-08-22: plain `npm run fresh` hides
 *  `~/.claude`, and the walk's agent beat then says there is nothing to bring.
 *  It cannot break inbox zero: the walk shows only its own three examples. */
export function openFreshUser({
  withAgents = true,
  // False is a new user with no Claude Code or Codex of hers, who signs in
  // for itself: the way to see the walk's plan question (w-9f6975906c).
  withTools = true,
  execPath = process.execPath,
  argv = process.argv,
  packaged = true,
  spawnFn = spawn,
  now,
} = {}) {
  let prepared;
  try {
    prepared = prepareHome(makeHome(now), { withAgents: withTools && withAgents, withTools });
  } catch (err) {
    return { ok: false, error: `Could not make a throwaway home under ${HOMES}: ${err?.message ?? err}` };
  }

  const { bin, args } = relaunchCommand({ execPath, argv, packaged });
  if (!bin || !fs.existsSync(bin)) {
    return { ok: false, error: `Cannot find this app's own program at ${bin}.`, home: prepared.home };
  }

  let child;
  try {
    child = spawnFn(bin, args, {
      detached: true,
      stdio: 'ignore',
      env: freshEnv(prepared.home, process.env, { ownSignIns: !withTools }),
    });
    child.unref?.();
  } catch (err) {
    return { ok: false, error: `Could not start a second ${NAME}: ${err?.message ?? err}`, home: prepared.home };
  }

  // THE NOTES ARE THE HONEST PART. Both of these are things a fresh copy can
  // be missing without looking broken, and a test that quietly cannot run an
  // agent is a test that lies. They are said rather than assumed.
  const notes = [];
  if (withTools && !prepared.claudeBin) notes.push('Claude Code is not at ~/.local/bin/claude, so agents will not run in it.');
  if (!prepared.keychain) notes.push('There is no ~/Library/Keychains here, so Claude Code will say it is not logged in.');
  if (withAgents && !prepared.agents) notes.push('There is no ~/.claude on this computer, so it will have no agents to offer.');

  return { ok: true, home: prepared.home, agents: prepared.agents, notes, pid: child?.pid ?? null };
}

/**
 * The leftovers, so the app can say how many there are rather than growing a
 *  folder under /tmp nobody ever looks at. */
export function freshUserHomes() {
  return { root: HOMES, homes: existingHomes() };
}

/**
 * Delete every throwaway home. Only ever the /tmp folder this file made:
 *  `HOMES` is not configurable, and that is on purpose. */
export function clearFreshUserHomes() {
  try {
    fs.rmSync(HOMES, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export { HOMES, path as _path };
