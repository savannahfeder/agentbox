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
import { terminalEnv } from './task-terminals.mjs';
import { codexLaunchEnv } from './codex-launch-env.mjs';

const INSTALLERS = {
  claude: { shell: '/bin/bash', url: 'https://claude.ai/install.sh', pipe: 'bash' },
  codex: { shell: '/bin/sh', url: 'https://chatgpt.com/codex/install.sh', pipe: 'sh' },
};

export function installCommand(engine) {
  const i = INSTALLERS[engine];
  return { file: i.shell, args: ['-c', `curl -fsSL ${i.url} | ${i.pipe}`] };
}

/** The plan, never the API console: `--claudeai` is Claude Code's own name for it. */
export function signInCommand(engine, bin) {
  return engine === 'claude'
    ? { file: bin, args: ['auth', 'login', '--claudeai'] }
    : { file: bin, args: ['login'] };
}

/** Exit 0 is signed in and 1 is not, for both (measured 2026-10-05). */
export function statusCommand(engine, bin) {
  return engine === 'claude'
    ? { file: bin, args: ['auth', 'status', '--json'] }
    : { file: bin, args: ['login', 'status'] };
}

const LOG_LIMIT = 64 * 1024;
const STATUS_TIMEOUT = 15_000;
const POLL = 2_000;
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

function realSpawn(file, args, { env, onData, keepStdin = false } = {}) {
  let child;
  try {
    child = nodeSpawn(file, args, { env, stdio: [keepStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  } catch (error) {
    onData?.(`${error.message}\n`);
    return { exit: Promise.resolve(127), kill() {} };
  }
  const feed = (d) => onData?.(String(d));
  child.stdout?.on('data', feed);
  child.stderr?.on('data', feed);
  const exit = new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (error) => { onData?.(`${error.message}\n`); resolve(127); });
  });
  return { exit, kill: () => { try { child.kill('SIGTERM'); } catch { /* already gone */ } } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One setup per tool, held for the life of the app.
 *
 * `find(engine)` is the finder, looking again from scratch (the caller passes
 * `recheckClaude` / `recheckCodex`, which also move the config so the rest of
 * the app runs on what was just installed). `spawn` and `wait` are seams for
 * the tests; nothing in the app passes them.
 */
export function createEngineSetup({ find, spawn = realSpawn, wait = sleep, env = process.env, poll = POLL, onSignIn = () => {} } = {}) {
  const runEnv = terminalEnv(env);
  const toolEnv = (engine, bin) => engine === 'codex' ? codexLaunchEnv(bin, runEnv) : runEnv;
  const jobs = new Map();

  const fresh = (engine) => ({ engine, phase: 'idle', error: null, log: '', running: null, login: null, run: 0 });
  const job = (engine) => { if (!jobs.has(engine)) jobs.set(engine, fresh(engine)); return jobs.get(engine); };
  const say = (j, text) => { j.log = (j.log + String(text).replace(ANSI, '')).slice(-LOG_LIMIT); };
  const lastLine = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';

  async function signedIn(j, bin) {
    const { file, args } = statusCommand(j.engine, bin);
    let output = '';
    const p = spawn(file, args, { env: toolEnv(j.engine, bin), onData: (d) => { output = (output + String(d).replace(ANSI, '')).slice(-LOG_LIMIT); } });
    const TIMED_OUT = Symbol('no answer');
    const code = await Promise.race([p.exit, wait(STATUS_TIMEOUT).then(() => { p.kill(); return TIMED_OUT; })]);
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

  function startLogin(j, bin) {
    j.login?.kill();
    const { file, args } = signInCommand(j.engine, bin);
    const login = spawn(file, args, { env: toolEnv(j.engine, bin), keepStdin: true, onData: (d) => say(j, d) });
    j.login = login;
    return login;
  }

  async function go(j, run) {
    const live = () => j.run === run;
    let hit = find(j.engine);
    if (!hit?.found) {
      j.phase = 'installing';
      const { file, args } = installCommand(j.engine);
      const p = spawn(file, args, { env: runEnv, onData: (d) => say(j, d) });
      j.running = p;
      const code = await p.exit;
      j.running = null;
      if (!live()) return;
      if (code !== 0) return fail(j, `The installer stopped: ${lastLine(j.log) || `exit ${code}`}`);
      hit = find(j.engine);
      if (!hit?.found) return fail(j, 'The installer finished, but the app still cannot find it.');
    }
    j.bin = hit.path;
    j.phase = 'checking';
    if (await signedIn(j, hit.path)) return live() && ready(j);
    if (!live()) return;
    j.phase = 'signing-in';
    let login = startLogin(j, hit.path);
    let ended = false;
    const watchLogin = (loginProcess) => loginProcess.exit.then(() => { if (loginProcess === j.login) ended = true; });
    watchLogin(login);
    for (;;) {
      await wait(poll);
      if (!live()) return;
      if (await signedIn(j, hit.path)) { if (live()) ready(j); return; }
      if (j.login !== login) {
        login = j.login;
        ended = false;
        watchLogin(login);
      }
      if (ended) return fail(j, `The sign-in was closed before it finished.${lastLine(j.log) ? ` ${lastLine(j.log)}` : ''}`);
    }
  }

  function ready(j) { j.login?.kill(); j.login = null; j.phase = 'ready'; j.error = null; }
  function fail(j, error) { j.login?.kill(); j.login = null; j.phase = 'failed'; j.error = error; }

  return {
    start(engine) {
      const j = job(engine);
      if (['installing', 'checking', 'signing-in'].includes(j.phase)) return this.status(engine);
      j.run += 1; j.phase = 'checking'; j.error = null; j.log = '';
      const run = j.run;
      go(j, run).catch((e) => { if (j.run === run) fail(j, String(e?.message ?? e)); });
      return this.status(engine);
    },
    /** Kill the sign-in that is waiting and start a new one, which opens the page again. */
    signInAgain(engine) {
      const j = job(engine);
      if (j.phase === 'signing-in' && j.bin) startLogin(j, j.bin);
      return this.status(engine);
    },
    cancel(engine) {
      const j = job(engine);
      j.run += 1;
      j.running?.kill(); j.login?.kill();
      j.running = null; j.login = null;
      if (j.phase !== 'ready') j.phase = 'idle';
      return this.status(engine);
    },
    status(engine) {
      const j = job(engine);
      return { engine, phase: j.phase, error: j.error, log: j.log };
    },
    /**
     * WHETHER THIS TOOL CAN RUN AN AGENT RIGHT NOW: found, and signed in by its
     *  own account. The walk asks before it asks anything, so a Mac that is
     *  already set up never sees the plan question. */
    async readiness(engine) {
      const hit = find(engine);
      if (!hit?.found) return { engine, found: false, signedIn: false };
      try { return { engine, found: true, signedIn: await signedIn({ engine, log: '' }, hit.path) }; }
      catch (error) { return { engine, found: true, signedIn: false, error: error.message }; }
    },
    /** The same question against a path already found, so asking it at
     *  launch does not search the Mac again. */
    signedInNow(engine, bin) {
      return signedIn({ engine, log: '' }, bin).catch(() => false);
    },
  };
}
