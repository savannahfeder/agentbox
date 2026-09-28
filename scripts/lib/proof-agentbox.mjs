// A WHOLE AGENTBOX, UNDER /tmp, FOR A PROOF SCRIPT TO DRIVE.
//
// The proofs beside this file are not tests and they are not mocks: they run
// main/store.mjs and main/supervisor.mjs exactly as the app runs them, and the
// only things constructed here are the throwaway store and the throwaway git
// repos the work is about. Nothing reaches the founder's ~/Zero, her
// zero.config.json, her ~/.codex or her ~/.claude.
//
// WHY A SHARED FILE RATHER THAN A COPY IN EACH SCRIPT. Five proofs need the
// same six-line store on disk, and the one thing they must not disagree about
// is what a clean starting point looks like: a proof that quietly built a
// different store from its neighbour is a proof about a store, not about
// Agentbox. The config below is where the deliberate choices are, and they are
// commented for that reason rather than for tidiness.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../../main/store.mjs';
import { Supervisor } from '../../main/supervisor.mjs';

export const APP_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

/**
 * THE STAND-IN FOR `claude -p`, WHICH IS NOT CLAUDE CODE AND SAYS SO.
 *
 * scripts/lib/stub-claude-worker.mjs holds the whole argument for why the
 * Claude half of these proofs is a stand-in and exactly which parts of it are
 * still real. It is named here so no proof has to build the path itself and get
 * it subtly different from its neighbour.
 */
export const STUB_CLAUDE = path.join(APP_DIR, 'scripts', 'lib', 'stub-claude-worker.mjs');

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
export const green = (s) => `\x1b[32m${s}\x1b[0m`;
export const red = (s) => `\x1b[31m${s}\x1b[0m`;
export const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

export const say = (s = '') => console.log(s);
export const note = (s) => console.log(dim(`   ${s}`));
export function step(n, title) {
  console.log(`\n${bold(`${n}. ${title}`)}\n${dim('-'.repeat(72))}`);
}

/**
 * ONE CLAIM, WITH THE FACT THAT SETTLES IT PRINTED BESIDE IT.
 *
 * The report at the end of a proof is a count of these, so a script cannot
 * finish green by forgetting to look at something: every claim it makes is
 * either in this list having been checked, or it was never made.
 */
export const claims = [];
export function claim(ok, sentence, evidence = '') {
  claims.push({ ok: !!ok, sentence });
  const mark = ok ? green('PASS') : red('FAIL');
  console.log(`   ${mark}  ${sentence}${evidence ? dim(`  — ${evidence}`) : ''}`);
  return !!ok;
}

/** How the script exits: 0 only if every claim it made held. */
export function verdict() {
  const bad = claims.filter((c) => !c.ok);
  console.log(`\n${bold('── verdict ──')}`);
  console.log(`   ${claims.length - bad.length}/${claims.length} claims held`);
  for (const c of bad) console.log(`   ${red('FAILED')}  ${c.sentence}`);
  return bad.length === 0;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * WAIT FOR A FACT, AND SAY WHICH FACT WHEN IT NEVER ARRIVES.
 *
 * A proof that hangs tells nobody anything, and a proof that polls with no
 * deadline is a proof that hangs. `why` is printed on the timeout because at
 * that moment the useful sentence is the one naming what was being waited for,
 * not a stack.
 */
export async function until(fn, { ms = 90_000, every = 100, why = 'something' } = {}) {
  const deadline = Date.now() + ms;
  for (;;) {
    const got = await fn();
    if (got) return got;
    if (Date.now() > deadline) throw new Error(`waited ${Math.round(ms / 1000)}s for ${why} and it never happened`);
    await wait(every);
  }
}

/**
 * AN EMPTY SCRATCH FOLDER, WIPED ONCE, BY THE SCRIPT AND NOT BY A HELPER.
 *
 * `throwawayApp` used to do this itself, and it cost the first run of the
 * two-worker proof: the script had already written the stub CODEX_HOME inside
 * the scratch folder, the helper deleted the folder out from under it, and
 * every app-server died with `CODEX_HOME points to "..." but that path does not
 * exist`. Which folder is emptied and when is a decision the script makes, in
 * one visible line, before it puts anything anywhere.
 */
export function freshScratch(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function git(cwd, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

/**
 * A STORE, ITS PRODUCTS, AND A REAL GIT REPO BEHIND EACH ONE.
 *
 * `products` is `[{ slug, name, files }]`; `files` is a plain map of path to
 * contents, committed as the repo's first commit so a proof can show a diff
 * against something.
 *
 * THE CONFIG IS THE INTERESTING PART:
 *
 *   `claudeBin` POINTS AT NOTHING ON PURPOSE for the Codex proofs. If any of
 *   them ever routed a row to Claude Code the spawn would fail loudly rather
 *   than quietly succeeding and proving the wrong thing.
 *
 *   `engineChoice` IS THE GATE. shared/engines.mjs refuses the second engine
 *   for every caller that cannot produce the ENGINE_CHOICE_ENABLED symbol, and
 *   main/supervisor.mjs derives that symbol from exactly this value. Without a
 *   date here every row in these proofs would run on Claude Code -- which is
 *   what the app does today, and is itself one of the things proved.
 *
 *   `codexHome` IS WHY NOBODY'S REAL LOGIN IS TOUCHED. The supervisor spawns
 *   one `codex app-server` per home with CODEX_HOME set to it, so a home under
 *   /tmp is a Codex with no auth.json of anyone's, no config of hers, no MCP
 *   servers of hers, and rollouts written where this script can read them.
 *
 *   `storeMcpCommand` IS LEFT NULL, which is what every downloaded copy of
 *   Agentbox has. It means `requireMcpServer` is null and a worker does not wait
 *   for a store server, and it means these proofs say nothing about the store
 *   MCP gate -- that path has its own tests
 *   (tests/a-codex-worker-can-write-to-her-store-or-it-does-not-run.test.mjs).
 */
export async function throwawayApp({
  scratch,
  products = [],
  config: extra = {},
} = {}) {
  // AGENTBOX'S OWN HOME GOES IN THE SCRATCH FOLDER TOO, AND IT DID NOT AT FIRST.
  // A run's trace is written under `appHome`, which is `~/.astral` unless
  // ASTRAL_HOME says otherwise (main/store/home.mjs) -- so the first green run
  // of the two-worker proof left two project folders in the real ~/.astral for
  // a store that lives in /tmp and is deleted on the next run. A proof that
  // tidies up after itself everywhere except one directory is a proof that
  // quietly accumulates, so the override is set here rather than remembered.
  process.env.ASTRAL_HOME = path.join(scratch, 'agentbox-home');
  const storeRoot = path.join(scratch, 'store');
  const accountId = 'proof-account';
  const accountRoot = path.join(storeRoot, 'accounts', accountId);
  const repos = new Map();

  for (const p of products) {
    const dir = path.join(accountRoot, p.slug);
    const repo = path.join(scratch, `${p.slug}-repo`);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(repo, { recursive: true });
    for (const [name, text] of Object.entries(p.files ?? { 'README.md': `${p.name}\n` })) {
      fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
      fs.writeFileSync(path.join(repo, name), text);
    }
    git(repo, 'init', '-q');
    git(repo, 'add', '-A');
    git(repo, '-c', 'user.email=proof@agentbox', '-c', 'user.name=proof', 'commit', '-qm', 'seed');
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
      schemaVersion: 2, id: p.slug, name: p.name, repoPath: repo, oneLiner: 'a throwaway',
    }, null, 1));
    repos.set(p.slug, repo);
  }

  const config = {
    storeRoot,
    accountRoot,
    accountId,
    claudeBin: '/nonexistent/claude-must-not-be-reached',
    maxConcurrentSessions: 3,
    authProfiles: [],
    sessionArgs: [],
    products: [],
    personalProducts: [],
    autonomousProducts: [],
    driveEnabled: false,
    storeMcpCommand: null,
    ...extra,
  };

  const store = await new Store(config).init();
  const supervisor = new Supervisor(config, store, APP_DIR, APP_DIR);
  return { scratch, storeRoot, accountRoot, accountId, config, store, supervisor, repoOf: (slug) => repos.get(slug) };
}

/**
 * EVERY `codex app-server` THIS PROCESS HAS RUNNING, COUNTED ON THE MAC.
 *
 * Asked of the operating system rather than of the app's own bookkeeping,
 * because the claim being made is "one process carries both workers" and a
 * counter inside the thing under test cannot settle that. Children of this
 * node process only, so another session's Codex on the same machine is not
 * miscounted as ours.
 */
export function codexServerPids() {
  const out = spawnSync('pgrep', ['-P', String(process.pid), '-f', 'app-server'], { encoding: 'utf8' });
  return (out.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}
