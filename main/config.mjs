// the app's config: one JSON file, all paths explicit, no discovery magic.
//
// The store's modules used to be another system's, loaded out of a private repo
// by absolute path, and this file was where that coupling was declared. They are
// Agentbox's own now (main/store/*), so the only outside thing left here is the
// claude binary.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { resolveClaudeBin, candidatePaths } from './claude-bin.mjs';
import { resolveCodexBin } from './codex-bin.mjs';
import { Name } from '../shared/product-name.mjs';
import { readPlans, slotsForPlans } from './claude-plan.mjs';
import { machineSlots } from './machine.mjs';
import { effectiveProfiles } from './account-discovery.mjs';
import { runningAsAFreshUser } from '../shared/fresh-user-home.mjs';
import { runningAsADemo } from '../shared/demo-world.mjs';

const CONFIG_NAME = 'zero.config.json';

/**
 * HOW MANY SESSIONS ONE ACCOUNT RUNS WHEN NOBODY HAS SAID ANYTHING AT ALL.
 *
 * Exported because two places need the same number and a second copy of it is a
 * number that drifts: `DEFAULTS` below, and `Supervisor#_slotsPerAccount`, which
 * reaches for it as CODEX's cap when the number on the config is one a CLAUDE
 * plan lowered. A Claude plan's rate limit says nothing about an OpenAI
 * subscription, and there is no plan tier for Codex anywhere to read, so the
 * honest answer for Codex is the one every engine gets when nobody has said --
 * this, rather than a Codex-shaped number nobody measured.
 */
export const DEFAULT_SESSIONS_AT_ONCE = 3;

const DEFAULTS = {
  // Where the inbox's own files live. WHICH FOLDER THIS SHOULD BE ON A
  // STRANGER'S MAC IS NOT DECIDED HERE: it is the open question on.
  //
  // IT IS THE APP'S OWN NAME SINCE 2026-09-22, where it used to be an older
  // product's. A real store is always named in the config, so this default is
  // only ever the answer for an install carrying none, and renaming it moved
  // no files: the folder it used to point at is untouched and still on disk.
  storeRoot: path.join(os.homedir(), Name),
  // ONE ACCOUNT FOLDER PER INSTALL, AND NOBODY ELSE'S.
  //
  // This was a literal id for most of the app's life, which meant every copy
  // ever downloaded filed its work under a folder named after the machine the
  // app was written on. `null` is the honest default: `loadConfig` mints a
  // fresh one on first run and writes it into the config, so an id exists from
  // then on and is this install's own. An id already in the config always wins,
  // so nothing that is already running moves.
  accountId: null,
  // The brain. Sessions run headless on the founder's subscription. Left unset
  // on purpose: where Claude Code lives depends on how it was installed, so the
  // answer is searched for at load (main/claude-bin.mjs) rather than assumed.
  // Setting it here in zero.config.json still wins over the search.
  claudeBin: null,
  // How many sessions run at once. The queue absorbs the rest; when the plan
  // window caps out, a longer queue is the visible, benign failure mode.
  //
  // THIS IS THE NUMBER FOR A MAX SUBSCRIPTION, which is the only kind this was
  // ever chosen on. When nobody has set one, loadConfig below reads the plan
  // Claude Code is signed in on and lowers this for a smaller one.
  maxConcurrentSessions: DEFAULT_SESSIONS_AT_ONCE,
  // HOLD HEAVY WORK WHEN MEMORY IS SHORT (w-3958c3753d). Off until somebody
  // turns it on from the Agents page. With it on, every shell command a worker
  // runs asks main/memory-gate-server.mjs first, and heavy ones wait their turn
  // while the Mac is short of memory. `memoryGateSlots` is how many heavy
  // commands may run at once; null is Auto, one per 8 GB.
  memoryGate: false,
  memoryGateSlots: null,
  // What spawned sessions are allowed to do. Left unset on purpose, because the
  // right default now depends on whether a store MCP server is present: see
  // Supervisor#sessionArgsFor. Setting it here still wins over that, which is
  // how letting workers build stays the founder's explicit opt-in.
  sessionArgs: null,
  // An OPTIONAL stdio MCP server giving spawned workers tools to read and write
  // the store. Agentbox ships none, so this is null and a worker runs with no store
  // tools at all. Point it at an executable to give workers their hands back.
  storeMcpCommand: null,
  // Products where agent-filed TASK items spawn without waiting for the
  // founder's approval (questions and reviews still hold for them). Empty by
  // default: autonomy here is granted per product, deliberately, in the
  // config file, the same way sessionArgs is.
  autonomousProducts: [],
  // PERSONAL PROJECTS AND THE DRIVE WERE BOTH DECLARED HERE AND BOTH ARE GONE
  // (w-d19d6d387c, 2026-09-22). A personal project ran its sessions on the
  // founder's message and nothing else, with no brief and no store; the drive
  // asked "what next?" by itself on a project that had gone quiet. There is no
  // case where a project should run without a brief and a store, and code that
  // drives a product on its own does not belong in an open-source app.
  //
  // A config still carrying `personalProducts` or `driveEnabled` is not an
  // error; nothing reads either key now.
  // Products the app drives: slugs under the account root. Empty means all
  // non-archived products found on disk.
  products: [],
  // WHETHER THE SECOND ENGINE MAY BE CHOSEN AT ALL, AND FROM WHEN. Null, so it
  // may not, and that is the whole of the default: every row runs Claude Code,
  // including one she marked `engine: "codex"` in August, exactly as it did
  // before this key existed. There is no Settings row and no picker. This is a
  // line somebody writes in zero.config.json on purpose, which is the point of
  // it -- it is the config half of the capability gate in shared/engines.mjs,
  // and `main/supervisor.mjs#_engineFor` is the one place that reads it and
  // hands the gate's token over.
  //
  // IT IS THE MOMENT SHE OPENED IT AND NOT A `true`. The reasoning is in
  // shared/engines.mjs, beside the function that parses this key, and is not
  // repeated here; in one sentence, `engine` survived the 2026-08-27 removal on
  // the work-item contract, so her ledger may still carry rows marked `codex`
  // from 08-25 to 08-27, and a boolean would put every one of them onto a
  // second engine the instant it was written, with no picker, no byline naming
  // the engine and no warning. A moment means "Codex may be chosen from now on"
  // instead.
  //
  // Written as an ISO date or date-time: "2026-09-04", or
  // "2026-09-04T09:30:00Z". Anything else -- true, "yes", "1", or a shape
  // `Date.parse` would merely guess at -- is read as off.
  engineChoice: null,
};

/**
 * `home` is the machine's home folder and exists so a test can be run against
 *  a laid-out one rather than against whoever is logged in. Nothing in the app
 *  passes it. */
export function loadConfig(appDir, { home = os.homedir() } = {}) {
  const file = path.join(appDir, CONFIG_NAME);
  let overrides = {};
  // WHETHER THIS MAC HAS EVER RUN AGENTBOX BEFORE. There is exactly one honest
  // marker of that and this is it: no config file at all. A file that exists
  // but happens not to mention a setting is somebody who has been here for
  // weeks, and treating them as new is how a default silently changes under
  // an install that was working.
  //
  // NOTHING DECIDES A DEFAULT ON THIS ANY MORE. It used to pick the
  // `outsideAgents` default, and that split was the bug: the same machine got
  // two different answers about the same setting depending on whether a file
  // happened to exist. There is one default now, in main/settings.mjs. This
  // stays as a plain fact about the machine, read by nobody today, because the
  // next thing that wants it will want it honest.
  let fresh = false;
  try {
    overrides = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') fresh = true;
    else console.warn(`zero: could not read ${file}: ${err.message}`);
  }
  const config = { ...DEFAULTS, ...overrides, freshInstall: fresh };
  // An older alias for `storeRoot` was read here until 2026-09-22. A config
  // still carrying only the old key falls through to the default now, which is
  // why the key was renamed in zero.config.json in the same step and not after
  // it: the two are one move, and doing them apart points the app at an empty
  // folder.
  // The account id, minted once per install. Written back immediately, because
  // a generated id that is not saved is a different id next launch and the
  // store would move out from under everything.
  //
  // AND A NEW INSTALL MAY CHOOSE CODEX FROM ITS FIRST LAUNCH (w-db6f5e331e).
  // `engineChoice` is the moment from which a row may run on Codex; it exists
  // so August rows in one old store never move engine unasked, and it could
  // only be written by hand, so a new person with both engines never got
  // Codex at all. A Mac with no config file has no old rows, so its first
  // launch is that moment. An install with a config is left as it was.
  const firstLaunch = fresh && !config.engineChoice ? new Date().toISOString() : null;
  if (firstLaunch) config.engineChoice = firstLaunch;
  if (typeof config.accountId !== 'string' || !config.accountId) {
    config.accountId = crypto.randomUUID();
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify({ ...overrides, accountId: config.accountId, ...(firstLaunch ? { engineChoice: firstLaunch } : {}) }, null, 2)}\n`);
    } catch (err) {
      console.warn(`zero: could not write the new account id to ${file}: ${err.message}`);
    }
  }
  config.accountRoot = path.join(config.storeRoot, 'accounts', config.accountId);
  // Where Claude Code is on THIS machine. Her setting wins; otherwise we look
  // (main/claude-bin.mjs). What she SET is kept separately from what we FOUND,
  // because `claudeBin` ends up filled in either way, and a later search that
  // reads its own last answer back as a setting would never search again.
  //
  // When nothing is found at all, `claudeBin` falls back to the installer's
  // path, so anything that tries to spawn it fails the way it always did, with
  // a real path in the message, rather than on a null. `claudeFound` is the
  // honest answer to whether it is there, and it is carried here so no screen
  // has to re-derive it.
  config.claudeBinConfigured = typeof overrides.claudeBin === 'string' && overrides.claudeBin
    ? overrides.claudeBin
    : null;
  const claude = resolveClaudeBin(config.claudeBinConfigured);
  config.claudeBin = claude.path ?? candidatePaths()[0];
  config.claudeFound = claude.found;
  config.claudeCertain = claude.certain !== false;
  config.claudeFrom = claude.from;
  // AND WHERE CODEX IS, THROUGH THE SAME DOOR AND FOR A SHARPER REASON.
  //
  // `codexBin` used to arrive on `config` by the unknown-key spread above: this
  // file keeps whatever is in `zero.config.json` so a setting nobody has taught
  // the app about survives a round trip, which is right for a setting and wrong
  // for A PATH THAT GETS SPAWNED. `this.config.codexBin` reaches `spawn` in the
  // supervisor raw, the file is gitignored and sits in the app directory, and
  // every worker on this machine has a broad Bash allow. So the one path in the
  // second engine that becomes a process was the one with no finder, no
  // existence check and no `configured` split -- while `claudeBin`, three lines
  // up, has had all three since it was written. main/codex-bin.mjs is that
  // finder; until now nothing imported it.
  //
  // THE ONE ASYMMETRY IS DELIBERATE. Claude Code is required, so a miss falls
  // back to the installer's path and anything spawning it fails with a real
  // path in the message. Codex is OPTIONAL, so a miss is null: null is exactly
  // what `engineFor` and `_capacityFor` read as "this Mac cannot run the second
  // engine", and inventing a path there would advertise an engine that is not
  // installed and turn every Codex row into an ENOENT.
  config.codexBinConfigured = typeof overrides.codexBin === 'string' && overrides.codexBin
    ? overrides.codexBin
    : null;
  const codex = resolveCodexBin(config.codexBinConfigured);
  config.codexBin = codex.found ? codex.path : null;
  config.codexFound = codex.found;
  config.codexCertain = codex.certain !== false;
  config.codexFrom = codex.from;
  // HOW MANY AGENTS AT ONCE, WHEN NOBODY HAS SAID, IS THE PLAN AND THE MACHINE
  // TOGETHER. Somebody on a smaller plan gets several sessions started for them,
  // they all spend the same allowance, and what they see is agents that are slow
  // and rows that fail. The founder's own bullet off a tester's onboarding was
  // "not on max plan?". So a plan that is not Max answers 1 and that stands
  // whatever the hardware is.
  //
  // HER OWN NUMBER ALWAYS WINS, including when it is the same as the default:
  // this only fills in a number nobody set. And a Mac whose plan cannot be read
  // keeps whatever the hardware suggests, so this can make an install smaller
  // but never breaks one. `planSlotsFrom` is the account it came from, or null,
  // so the Agents page can say why the number is what it is instead of leaving
  // somebody to wonder why theirs says one.
  // AND WHAT THIS MAC SUGGESTS IS WHAT THE PLAN FALLS BACK TO. The arithmetic
  // and the measurement behind it are in main/machine.mjs; the short version is
  // one agent per 4 GB of memory, which is the founder's own two anchors.
  //
  // THE MACHINE IS THE FALLBACK RATHER THAN A SECOND CAP, and the difference is
  // the whole reason this reads the way it does. `slotsForPlans` answers 1 for a
  // small subscription and its fallback for everything else, so handing it the
  // machine number composes the two correctly in one expression: a Pro plan gets
  // one at a time whatever the hardware, and everybody else gets what the
  // hardware suggests. Taking `Math.min` of a flat 3 and the machine instead,
  // which is what shipped first, held every Mac at 3 or below and so could never
  // do the thing she asked for, which is scale up: "For 24 GB, have it scale
  // accordingly."
  //
  // IT IS NOT A CAP. Nothing downstream clamps to this; the stepper and the
  // writer both use the control's own range, the same on every machine. A number
  // already in zero.config.json is untouched, for the same reason the plan cap
  // leaves it alone.
  config.machineSlots = machineSlots().slots;
  if (typeof overrides.maxConcurrentSessions !== 'number') {
    const plans = readPlans(effectiveProfiles(config.authProfiles, { home }), { home });
    const slots = slotsForPlans(plans, config.machineSlots);
    config.maxConcurrentSessions = slots;
    config.planSlotsFrom = slots === config.machineSlots
      ? null
      : (plans.find((p) => p.known && !p.max)?.label ?? null);
  } else {
    config.planSlotsFrom = null;
  }
  // WHOSE MACHINE THIS IS, carried so nothing downstream has to ask the OS a
  // second time and so a test can lay out a home of its own. The accounts the
  // fleet runs on are read from it (main/account-discovery.mjs).
  config.home = home;
  // Where the file is, so anything that edits a setting can write it back
  // without being handed appDir a second time.
  config.appDir = appDir;
  return config;
}

export function configFile(appDir) {
  return path.join(appDir, CONFIG_NAME);
}

/**
 * WHICH FOLDER `zero.config.json` IS READ FROM, and the whole of it is one
 * rule: A COPY PRETENDING TO BE SOMEBODY ELSE MAY NOT READ THE CHECKOUT'S
 * CONFIG.
 *
 * Running from source the config is the checkout's, which is what every session
 * and every test already assumes. Packaged it cannot be, because the bundle is
 * signed and a write into it breaks the signature notarisation just bought, so
 * it is the user data folder.
 *
 * THE THIRD CASE IS THE ONE THAT WAS MISSING, AND IT IS WHAT SHE SAW. She
 * pressed the ⌘K new user row on 2026-09-27 and the second window opened on HER
 * INBOX, the personal rows among them, with no first run in front of it. A
 * throwaway home moves the user data folder and it does NOT move the checkout,
 * so on a source-run app the copy that was meant to be a stranger read
 * `<checkout>/zero.config.json` and took her store root, her account id, her
 * PostHog key and her session arguments off it. `shared/fresh-user-home.mjs`
 * strips those names out of the child's ENVIRONMENT, which was the other half
 * of the same leak; this is the half a file on disk causes, and no environment
 * variable can fix it.
 *
 * The demo copy goes the same way, for the same reason rather than a second
 * one: it seeds its own small store into the throwaway home and was then
 * pointed straight past it at hers.
 *
 * Both marks are read off the environment the copy was launched with, so this
 * answers correctly inside the child while staying a plain function a test can
 * call with no Electron and no launch.
 */
export function configDir({ appDir, userData, packaged = false, env = process.env } = {}) {
  if (packaged) return userData;
  return runningAsAFreshUser(env) || runningAsADemo(env) ? userData : appDir;
}

// Change settings from the app, on the founder's own file.
//
// Two halves, and both are required. The FILE is rewritten so the choice
// survives a restart, merging into whatever is on disk right now rather than
// into what this process read at boot: several sessions edit this repo, and a
// whole-object overwrite from stale memory is how an unrelated key silently
// reverts. The LIVE object is then mutated in place, because every consumer
// (the supervisor's tick, spawnPlan's grants, the digest) reads
// `config.*` per call, so a setting she changes takes effect on the next tick
// rather than at the next restart. A running app that ignores its own settings
// screen until relaunch is the same failure as a fix that is not running.
//
// Written through a rename, like the standing instructions: a half-written
// config is a fleet that boots with no grants at all.
export function saveConfig(config, patch) {
  const appDir = config.appDir;
  if (!appDir) throw new Error('config has no appDir; cannot save');
  const file = configFile(appDir);
  let onDisk = {};
  try {
    onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const next = { ...onDisk };
  // NOTHING IS PINNED HERE ANY MORE, and the deletion is the point. This used
  // to write `outsideAgents` into a new install's first save, because the
  // default flipped from "only the ones asking" to "every session" the moment a
  // config file existed, and a stranger who had never opened the setting would
  // have been flipped by it. There is one default now for every install, `off`
  // in main/settings.mjs, so there is no flip left to guard against and no
  // setting to write on somebody's behalf.
  for (const [key, value] of Object.entries(patch)) {
    // An explicit undefined REMOVES the key, which is how a per-project
    // override goes back to meaning "same as the workspace" rather than
    // hardening into an empty list that means something else entirely.
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete config[key];
    else config[key] = value;
  }
  return next;
}
