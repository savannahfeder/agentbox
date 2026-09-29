#!/usr/bin/env node
// OPEN AGENTBOX AS SOMEBODY WHO HAS NEVER OPENED IT.
//
// The problem this solves. Agentbox keeps its state in three places and a
// packaged app on her Mac inherits two of them:
//
//   1. `<appData>/Astral` (or `<appData>/Zero`, see main.mjs:39-43) — the
//      renderer's own settings, which is her theme, her skin, her zoom, her
//      project order and which rows she has already seen.
//   2. `zero.config.json` beside it — her store root, her PostHog key, her
//      store MCP command.
//   3. The store itself, wherever `storeRoot` points.
//
// Deleting any of those to get a clean run would take her real setup with it,
// which is not a thing a test may cost. So nothing is deleted. The app is
// launched inside a THROWAWAY HOME instead, under /tmp, and every one of the
// three lands in there: fresh settings, no config file so it falls to DEFAULTS,
// and an empty store at `<throwaway>/Agentbox`. Her real home is untouched and
// unread.
//
// WHY THIS DOES NOT KILL HER AGENTS, which is the whole reason it is usable.
// `main.mjs:415` is `if (!app.requestSingleInstanceLock) app.quit` and the lock
// is keyed on userData. A throwaway home means a different userData, so the
// fresh copy takes its own lock and both run side by side. Nothing quits,
// `before-quit` never fires, `supervisor.killAll` is never reached.
//
// CFFIXED_USER_HOME IS THE LOAD-BEARING ONE. `HOME` alone does NOT move
// `app.getPath('appData')` on macOS — Chromium asks Core Foundation, not the
// environment — so a probe with only HOME set shares her userData, hits the
// lock and quits in under half a second, which is the "it crashes immediately"
// she reported on 08-20. Both variables, always.
//
// WHAT IS DELIBERATELY LINKED THROUGH, and why it is still an honest test.
// Exactly two things, both of which a stranger already has before they ever
// meet Agentbox, and neither of which Agentbox owns:
//
//   ~/.local/bin/claude    Claude Code itself. The product's prerequisite.
//   ~/Library/Keychains    where Claude Code's login actually lives.
//
// THE KEYCHAIN ONE IS NOT OPTIONAL AND IT IS NOT OBVIOUS. The token is a
// `Claude Code-credentials` item in the login keychain, and macOS finds that
// keychain at `$HOME/Library/ Keychains`, so redirecting HOME hides it. Link it
// and the same command answers "ok". Without this the fresh copy is something
// to look at and not something to use, which is not what she asked for.
//
// WHAT IS DELIBERATELY NOT LINKED. `~/.claude` itself. `main/agents.mjs` reads
// `~/.claude/sessions` and `~/.claude/projects`, so linking it puts her real
// Claude Code sessions in the fresh inbox: ten rows on the first try, about
// two outside repos' work from as far back as 14 August. That is CORRECT
// behaviour for a real new user, and it is hers, but it is not starting from
// zero. `--with-agents` links it when seeing that first run is the point.
//
// Usage:
//   npm run fresh                  a brand new user, every time
//   npm run fresh -- --with-agents  same, plus the Claude Code sessions already on this Mac
//   npm run fresh -- --keep         reopen the last one, to carry on where you left off
//   npm run fresh -- --list         show the throwaway homes on disk
//   npm run fresh -- --clean        delete them all

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// THE RECIPE ITSELF LIVES IN ONE PLACE NOW (shared/fresh-user-home.mjs), because
// the app can do this to itself from ⌘K since 2026-08-23 and two copies of a
// rule about CFFIXED_USER_HOME is exactly how one of them goes quietly wrong.
import { HOMES, existingHomes, makeHome, prepareHome, freshEnv } from '../shared/fresh-user-home.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2));

// NEWEST WINS, not first found, and that is deliberate. On 2026-08-20 the
// signed build in release/ was packed at 15:08 and main moved at 15:20, so a
// fresh-user run against it showed a screen twelve minutes out of date: it
// still carried the nothing-here page she had already killed. A test that
// quietly runs yesterday's app is worse than no test, so the freshest bundle
// wins and its age is printed either way. ASTRAL_APP=/path/to/Astral.app
// overrides, for when the older one is the point (checking a signed build).
// The binary inside a bundle is named after the bundle, so a side build packed
// by scripts/pack-side.mjs has "the app Rest" in there and not "the app". Read it
// rather than assumed: without this, ASTRAL_APP pointed at a side build answers
// "no packaged the app found", which is a confusing thing to be told about a
// folder you are looking straight at.
function binIn(app) {
  const dir = path.join(app, 'Contents', 'MacOS');
  try {
    const named = fs.readdirSync(dir).find((f) => f.startsWith('Agentbox'));
    return named ? path.join(dir, named) : null;
  } catch {
    return null;
  }
}

function findApp() {
  if (process.env.ASTRAL_APP) {
    const app = process.env.ASTRAL_APP;
    const bin = binIn(app);
    return bin ? { app, bin, at: builtAt(app) } : null;
  }
  const candidates = [
    '/Applications/Astral.app',
    path.join(os.homedir(), 'Applications', 'Astral.app'),
    // electron-builder names this folder after the arch it was asked for, so
    // the build target moving from arm64 to universal moved it. Both are
    // listed because a build packed before that change is still a perfectly
    // good app to open, and the sort below picks the newer one.
    path.join(repo, 'release', 'mac-universal', 'Astral.app'),
    path.join(repo, 'release', 'mac-arm64', 'Astral.app'),
    path.join(repo, 'release', 'mac', 'Astral.app'),
    // Where a session leaves an unsigned build packed straight off main, when
    // the signed one beside it has fallen behind. `npm run release` never
    // writes here, so nothing it produces is ever overwritten by a rebuild.
    path.join(repo, 'release', 'from-main', 'Astral.app'),
  ];
  const found = candidates
    .map((app) => ({ app, bin: path.join(app, 'Contents', 'MacOS', 'Agentbox') }))
    .filter((c) => fs.existsSync(c.bin))
    .map((c) => ({ ...c, at: builtAt(c.app) }))
    .sort((a, b) => b.at - a.at);
  return found[0] ?? null;
}

// When the bundle was packed. The asar is the whole app including the renderer,
// so its mtime is the honest answer; the .app directory's own mtime moves for
// reasons that are not a rebuild.
function builtAt(app) {
  try {
    return fs.statSync(path.join(app, 'Contents', 'Resources', 'app.asar')).mtimeMs;
  } catch {
    return 0;
  }
}

const existing = existingHomes;

if (args.has('--list')) {
  const homes = existing();
  if (!homes.length) console.log('No throwaway homes yet.');
  homes.forEach((dir) => console.log(dir));
  process.exit(0);
}

if (args.has('--clean')) {
  fs.rmSync(HOMES, { recursive: true, force: true });
  console.log(`Deleted every throwaway home under ${HOMES}.`);
  process.exit(0);
}

const found = findApp();
if (!found) {
  console.error('No packaged Agentbox found. Build one with `npm run pack`, or install the dmg.');
  console.error('Looked in /Applications, ~/Applications and release/.');
  process.exit(1);
}

let home;
if (args.has('--keep')) {
  home = existing().pop();
  if (!home) {
    console.error('Nothing to reopen. Run it without --keep first.');
    process.exit(1);
  }
} else {
  // Named by the clock so --keep can pick the newest by sorting, and so two
  // fresh users started a minute apart are told apart on disk.
  home = makeHome();
}

// The two prerequisites a stranger already has. Symlinks, not copies: nothing
// is duplicated and nothing here can write back over her real install that the
// app could not already write.
const { claudeBin, keychain } = prepareHome(home, { withAgents: args.has('--with-agents') });

const child = spawn(found.bin, [], {
  detached: true,
  stdio: 'ignore',
  env: freshEnv(home),
});
child.unref();

const mins = Math.round((Date.now() - found.at) / 60000);
const age = found.at ? `built ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} hr`} ago` : 'build time unknown';
console.log(`Opening ${found.app} as a brand new user, ${age}.`);
console.log(`Its whole world is ${home} — settings, config and store.`);
console.log(`Your own Agentbox keeps running and nothing of yours was read or changed.`);
if (!claudeBin) console.log('Note: Claude Code is not at ~/.local/bin/claude, so agents will not run.');
if (!keychain) console.log('Note: no ~/Library/Keychains, so Claude Code will say it is not logged in.');
// The hint has to name the command she actually typed. Run through npm it is
// `npm run fresh -- --clean`; run as a file it is the file. Printing the wrong
// one is a line that does not work when pasted.
const how = process.env.npm_lifecycle_event === 'fresh'
  ? 'npm run fresh -- --clean'
  : `node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))} --clean`;
console.log(`Close its window when you are done. \`${how}\` clears the leftovers.`);
