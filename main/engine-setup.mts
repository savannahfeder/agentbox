import { harnessFor } from './harnesses.mts';
// SETTING UP SOMEBODY'S PLAN FOR THEM (w-9f6975906c, picked 2026-10-05).
//
// A person with a Claude or ChatGPT plan and no Claude Code or Codex used to
// reach a card with a link to an install page. Now the walk asks which plan
// they pay for and this does the rest: install the tool if it is missing, start
// its own sign-in, and wait until the tool itself says it is signed in. The one
// thing left for them is approving in their browser.
//
// EVERY COMMAND HERE IS THE TOOL'S OWN, and that is a rule, not a style.
// Anthropic does not allow third party apps to offer claude.ai login unless
// approved, so Agentbox never draws a sign-in of its own: it runs Claude Code's
// `auth login`, which opens Anthropic's page, and Codex's `login`, which opens
// OpenAI's. Measured 2026-10-05 into throwaway home folders with stdin closed:
// both installers finish with no prompts (Claude Code 24.6 s, Codex 9.7 s) and
// land in `~/.local/bin`, the first place each finder looks; `claude auth login
// --claudeai` runs `open <url>` with a localhost callback, so approving in the
// browser finishes it with nothing to paste.
//
// NO API KEY REACHES ANYTHING RUN HERE. An inherited ANTHROPIC_API_KEY makes
// Claude Code report itself signed in on the key and bill it, which is the
// opposite of setting up their plan; `terminalEnv` is the scrub the built-in
// terminal already uses.

import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { terminalEnv } from './task-terminals.mts';
import { codexLaunchEnv } from './codex-launch-env.mts';

export interface SetupSpawnOptions { env?: NodeJS.ProcessEnv; onData?: (data: unknown) => void; keepStdin?: boolean }

/** A running command: its exit code settles `exit`. */
export interface SetupProcess { exit: Promise<number>; kill(): void }

/** What the finder answers for a tool. */
export interface EngineFound { found?: boolean; path?: string | null; certain?: boolean }

export interface EngineSetupOptions {
  find: (engine: string) => EngineFound | Promise<EngineFound>;
  spawn?: (file: string, args: string[], options?: SetupSpawnOptions) => SetupProcess;
  wait?: (ms: number) => Promise<unknown>;
  env?: NodeJS.ProcessEnv;
  poll?: number;
  onSignIn?: (engine: string, signedIn: boolean) => void;
  now?: () => number;
  setUpHere?: (engine: string, env: NodeJS.ProcessEnv) => boolean;
}

/**
 * Whether this engine was ever set up in this home. Running either program to
 * ask about sign-in makes its config folder, so on a home with none the answer
 * is "signed out" without running it; sign-in itself makes the folder.
 */
export function engineSetUpHere(engine: string, env: NodeJS.ProcessEnv, { exists = fs.existsSync }: { exists?: (p: string) => boolean } = {}): boolean {
  const home = env.HOME || os.homedir();
  if (engine === 'codex') {
    if (env.OPENAI_API_KEY || env.CODEX_API_KEY) return true;
    return exists(env.CODEX_HOME || path.join(home, '.codex'));
  }
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.CLAUDE_CODE_OAUTH_TOKEN) return true;
  if (env.CLAUDE_CONFIG_DIR) return exists(env.CLAUDE_CONFIG_DIR);
  return exists(path.join(home, '.claude.json')) || exists(path.join(home, '.claude'));
}

interface SetupJob {
  engine: string;
  phase: string;
  error: string | null;
  log: string;
  running: SetupProcess | null;
  login: SetupProcess | null;
  run: number;
  already?: boolean;
  bin?: string | null;
}

export interface EngineSetupStatus {
  engine: string;
  phase: string;
  error: string | null;
  log: string;
  bin: string | null;
  already: boolean;
}

export interface EngineReadiness { engine: string; found: boolean; signedIn: boolean; certain: boolean; error?: string }

export function installCommand(engine: string) { return harnessFor(engine).install(); }

/** The plan, never the API console: `--claudeai` is Claude Code's own name for it. */
export function signInCommand(engine: string, bin: string) {
  return harnessFor(engine).signIn(bin);
}

/** Exit 0 is signed in and 1 is not, for both (measured 2026-10-05). */
export function statusCommand(engine: string, bin: string) {
  return harnessFor(engine).signInStatus(bin);
}

const LOG_LIMIT = 64 * 1024;
const STATUS_TIMEOUT = 15_000;
const POLL = 2_000;
/** How long a sign-in may wait on the browser: long enough for a slow login
 *  full of captchas, and not for ever. */
export const SIGN_IN_WAIT = 30 * 60_000;
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

function realSpawn(file: string, args: string[], { env, onData, keepStdin = false }: SetupSpawnOptions = {}): SetupProcess {
  let child: ChildProcess;
  try {
    child = nodeSpawn(file, args, { env, stdio: [keepStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  } catch (error) {
    onData?.(`${(error as Error).message}\n`);
    return { exit: Promise.resolve(127), kill() {} };
  }
  const feed = (d: unknown) => onData?.(String(d));
  child.stdout?.on('data', feed);
  child.stderr?.on('data', feed);
  const exit = new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (error) => { onData?.(`${error.message}\n`); resolve(127); });
  });
  return { exit, kill: () => { try { child.kill('SIGTERM'); } catch { /* already gone */ } } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One setup per tool, held for the life of the app.
 *
 * `find(engine)` is the finder, looking again from scratch, and may answer
 * with a promise (the caller passes `lookAgainFor`, which also moves the
 * config so the rest of the app runs on what was just installed). `spawn` and
 * `wait` are seams for the tests; nothing in the app passes them.
 */
export function createEngineSetup({ find, spawn = realSpawn, wait = sleep, env = process.env, poll = POLL, onSignIn = () => {}, setUpHere = () => true, now = Date.now }: EngineSetupOptions = {} as EngineSetupOptions) {
  const runEnv = terminalEnv(env);
  const toolEnv = (engine: string, bin: string | null | undefined) => engine === 'codex' ? codexLaunchEnv(bin, runEnv) : runEnv;
  const jobs = new Map<string, SetupJob>();

  const fresh = (engine: string): SetupJob => ({ engine, phase: 'idle', error: null, log: '', running: null, login: null, run: 0 });
  const job = (engine: string) => { if (!jobs.has(engine)) jobs.set(engine, fresh(engine)); return jobs.get(engine)!; };
  const say = (j: Pick<SetupJob, 'log'>, text: unknown) => { j.log = (j.log + String(text).replace(ANSI, '')).slice(-LOG_LIMIT); };
  const lastLine = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';

  async function signedIn(j: Pick<SetupJob, 'engine' | 'log'>, bin: string | null | undefined) {
    const env = toolEnv(j.engine, bin);
    if (!setUpHere(j.engine, env)) { onSignIn(j.engine, false); return false; }
    const { file, args } = statusCommand(j.engine, bin!);
    let output = '';
    const p = spawn(file, args, { env, onData: (d) => { output = (output + String(d).replace(ANSI, '')).slice(-LOG_LIMIT); } });
    const TIMED_OUT = Symbol('no answer');
    const code = await Promise.race([p.exit, wait(STATUS_TIMEOUT).then((): typeof TIMED_OUT => { p.kill(); return TIMED_OUT; })]);
    // TOLD TO THE APP, which routes on it (w-d5d632e503): a Claude Code that
    // is signed out beside a Codex that is signed in is a Mac that runs on
    // Codex. Only a real yes or no; a check that never answered says nothing.
    if (code === 0 || code === 1) onSignIn(j.engine, code === 0);
    if (code === 0 || code === 1) return code === 0;
    if (output) say(j, output);
    const name = j.engine === 'codex' ? 'Codex' : 'Claude Code';
    throw new Error(code === TIMED_OUT
      ? `${name} did not answer the sign-in check. Try again.`
      : `${name} could not check sign-in: ${lastLine(output) || `exit ${code}`}`);
  }

  function startLogin(j: SetupJob, bin: string | null | undefined) {
    j.login?.kill();
    const { file, args } = signInCommand(j.engine, bin!);
    const login = spawn(file, args, { env: toolEnv(j.engine, bin), keepStdin: true, onData: (d) => say(j, d) });
    j.login = login;
    return login;
  }

  async function go(j: SetupJob, run: number) {
    const live = () => j.run === run;
    let hit = await find(j.engine);
    if (!live()) return;
    // The card's first row says Found or Install off this, because it ticks
    // that row either way.
    j.already = !!hit?.found;
    if (!hit?.found) {
      j.phase = 'installing';
      const { file, args } = installCommand(j.engine);
      const p = spawn(file, args, { env: runEnv, onData: (d) => say(j, d) });
      j.running = p;
      const code = await p.exit;
      j.running = null;
      if (!live()) return;
      if (code !== 0) return fail(j, `The installer stopped: ${lastLine(j.log) || `exit ${code}`}`);
      hit = await find(j.engine);
      if (!hit?.found) return fail(j, 'The installer finished, but the app still cannot find it.');
    }
    j.bin = hit.path;
    j.phase = 'checking';
    if (await signedIn(j, hit.path)) return live() && ready(j);
    if (!live()) return;
    j.phase = 'signing-in';
    let login = startLogin(j, hit.path);
    let ended = false;
    let since = now();
    const watchLogin = (loginProcess: SetupProcess) => loginProcess.exit.then(() => { if (loginProcess === j.login) ended = true; });
    watchLogin(login);
    // A check that does not answer says nothing about a login still waiting on
    // the browser, so it must not end that login: killing it closes the
    // callback port the browser is about to come back to.
    const signedInYet = async () => {
      try { return await signedIn(j, hit!.path); } catch (error) { if (ended) throw error; return false; }
    };
    for (;;) {
      await wait(poll);
      if (!live()) return;
      if (await signedInYet()) { if (live()) ready(j); return; }
      if (!live()) return;
      if (j.login !== login) {
        login = j.login!;
        ended = false;
        since = now();
        watchLogin(login);
      }
      if (!ended && now() - since >= SIGN_IN_WAIT) {
        return fail(j, `The sign-in waited ${Math.round(SIGN_IN_WAIT / 60_000)} minutes and stopped. Try again.`);
      }
      // ASK ONCE MORE BEFORE CALLING IT CLOSED. A sign-in that finishes while
      // the check above is running exits before that check answers, and the
      // check, asked a moment too early, says no. Without this, somebody who
      // had just approved it was told it was closed.
      if (ended) {
        if (await signedIn(j, hit.path)) { if (live()) ready(j); return; }
        if (!live()) return;
        return fail(j, `The sign-in was closed before it finished.${lastLine(j.log) ? ` ${lastLine(j.log)}` : ''}`);
      }
    }
  }

  function ready(j: SetupJob) { j.login?.kill(); j.login = null; j.phase = 'ready'; j.error = null; }
  function fail(j: SetupJob, error: string) { j.login?.kill(); j.login = null; j.phase = 'failed'; j.error = error; }

  return {
    start(engine: string): EngineSetupStatus {
      const j = job(engine);
      if (['installing', 'checking', 'signing-in'].includes(j.phase)) return this.status(engine);
      j.run += 1; j.phase = 'checking'; j.error = null; j.log = '';
      const run = j.run;
      go(j, run).catch((e) => { if (j.run === run) fail(j, String(e?.message ?? e)); });
      return this.status(engine);
    },
    /** Kill the sign-in that is waiting and start a new one, which opens the page again. */
    signInAgain(engine: string): EngineSetupStatus {
      const j = job(engine);
      if (j.phase === 'signing-in' && j.bin) startLogin(j, j.bin);
      return this.status(engine);
    },
    cancel(engine: string): EngineSetupStatus {
      const j = job(engine);
      j.run += 1;
      j.running?.kill(); j.login?.kill();
      j.running = null; j.login = null;
      if (j.phase !== 'ready') j.phase = 'idle';
      return this.status(engine);
    },
    status(engine: string): EngineSetupStatus {
      const j = job(engine);
      return { engine, phase: j.phase, error: j.error, log: j.log, bin: j.bin ?? null, already: !!j.already };
    },
    /**
     * WHETHER THIS TOOL CAN RUN AN AGENT RIGHT NOW: found, and signed in by its
     *  own account. The walk asks before it asks anything, so a Mac that is
     *  already set up never sees the plan question.
     *
     *  `certain` is whether anything was established at all, the same rule
     *  `signedIn` above keeps for the app's routing: a check that never
     *  answered says nothing, rather than no. */
    async readiness(engine: string): Promise<EngineReadiness> {
      const hit = await find(engine);
      if (!hit?.found) return { engine, found: false, signedIn: false, certain: hit?.certain !== false };
      try { return { engine, found: true, signedIn: await signedIn({ engine, log: '' }, hit.path), certain: true }; }
      catch (error) { return { engine, found: true, signedIn: false, certain: false, error: (error as Error).message }; }
    },
    /** The same question against a path already found, so asking it at
     *  launch does not search the Mac again. */
    signedInNow(engine: string, bin: string | null | undefined) {
      return signedIn({ engine, log: '' }, bin).catch(() => false);
    },
  };
}
