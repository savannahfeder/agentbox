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
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// THE RECIPE ITSELF LIVES IN ONE PLACE NOW (shared/fresh-user-home.mjs), because
// the app can do this to itself from ⌘K since 2026-08-23 and two copies of a
// rule about CFFIXED_USER_HOME is exactly how one of them goes quietly wrong.
import { HOMES, existingHomes, makeHome, prepareHome, freshEnv } from '../shared/fresh-user-home.mjs';
// AND THE OTHER HALF IS WHICH APP TO OPEN (scripts/fresh-user-target.mjs). On
// Linux there is no bundle to find, so this command used to stop there.
import { freshUserTarget } from './fresh-user-target.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2));

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

const found = freshUserTarget({ repo });
if (found.kind === 'none') {
  console.error(`Nothing to open as a new user: ${found.why}`);
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

const child = spawn(found.bin, found.args, {
  detached: true,
  stdio: 'ignore',
  env: freshEnv(home),
});
child.unref();

const mins = Math.round((Date.now() - found.at) / 60000);
const age = found.kind === 'checkout'
  ? 'run from source'
  : (found.at ? `built ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} hr`} ago` : 'build time unknown');
console.log(`Opening ${found.app} as a brand new user, ${age}.`);
console.log(`Its whole world is ${home} — settings, config and store.`);
console.log(`Your own Agentbox keeps running and nothing of yours was read or changed.`);
if (found.needsBuild) console.log('Note: the screen has not been built here, so run `npm run build` and open it again.');
if (!claudeBin) console.log('Note: Claude Code is not at ~/.local/bin/claude, so agents will not run.');
if (!keychain && process.platform === 'darwin') console.log('Note: no ~/Library/Keychains, so Claude Code will say it is not logged in.');
// The hint has to name the command she actually typed. Run through npm it is
// `npm run fresh -- --clean`; run as a file it is the file. Printing the wrong
// one is a line that does not work when pasted.
const how = process.env.npm_lifecycle_event === 'fresh'
  ? 'npm run fresh -- --clean'
  : `node ${path.relative(process.cwd(), fileURLToPath(import.meta.url))} --clean`;
console.log(`Close its window when you are done. \`${how}\` clears the leftovers.`);
