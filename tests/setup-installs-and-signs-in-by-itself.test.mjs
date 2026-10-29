// SOMEBODY WITH A CLAUDE OR CHATGPT PLAN AND NOTHING INSTALLED GOT A LINK TO A
// WEB PAGE. Now Agentbox does the setup itself and asks them for one thing:
// approving the sign-in in their browser (w-9f6975906c, picked 2026-10-05:
// "asking which plan, then doing it for them, makes the most sense").
//
// What it runs is the tools' own commands, never a sign-in of ours: Anthropic
// does not allow third party apps to offer claude.ai login unless approved, so
// the browser page is Claude Code's and Codex's own. Measured 2026-10-05 into
// throwaway home folders, stdin closed and no terminal:
//
//   curl -fsSL https://claude.ai/install.sh | bash     24.6 s, exit 0, no prompts  (public-check: allow, Anthropic's documented installer)
//     -> ~/.local/bin/claude 2.1.290
//   curl -fsSL https://chatgpt.com/codex/install.sh | sh   9.7 s, exit 0, no prompts  (public-check: allow, OpenAI's documented installer)
//     -> ~/.local/bin/codex 0.160.1
//   claude auth login --claudeai   runs `open <url>` with a localhost callback,
//     so approving in the browser finishes it with nothing to paste
//   claude auth status --json / codex login status   exit 0 signed in, 1 not

import { describe, it, expect } from 'vitest';
import { createEngineSetup, installCommand, signInCommand, statusCommand } from '../main/engine-setup.mjs';

// A pretend machine. `found` is what the finder says, `signedIn` is what the
// status command answers each time it is asked, and every spawn is recorded.
function machine({ found = false, installs = true, installExit = 0, signedIn = [false], loginExit = null } = {}) {
  const calls = [];
  let isFound = found;
  let statusAnswers = [...signedIn];
  const spawn = (file, args, opts) => {
    const call = { file, args, env: opts?.env, killed: false };
    calls.push(call);
    const line = [file, ...args].join(' ');
    let exit;
    if (line.includes('install.sh')) {
      exit = Promise.resolve().then(() => { opts?.onData?.('Installing...\nlast line of the installer\n'); if (installExit === 0 && installs) isFound = true; return installExit; });
    } else if (line.includes(' status')) {
      const yes = statusAnswers.length > 1 ? statusAnswers.shift() : statusAnswers[0];
      exit = Promise.resolve(yes ? 0 : 1);
    } else {
      // The sign-in command: it waits for the browser until it is killed, or
      // exits with `loginExit` when one is given.
      exit = loginExit === null ? new Promise(() => {}) : Promise.resolve(loginExit);
    }
    return { exit, kill: () => { call.killed = true; } };
  };
  const find = () => (isFound ? { found: true, path: '/Users/x/.local/bin/tool' } : { found: false, path: null });
  return { calls, spawn, find };
}

// A wait that yields to the timer queue, so a setup polling a browser that
// never answers cannot starve the test of its own clock.
const quick = { wait: () => new Promise((r) => setTimeout(r, 0)), env: { PATH: '/usr/bin:/bin', ANTHROPIC_API_KEY: 'sk-nope', OPENAI_API_KEY: 'sk-nope', HOME: '/Users/x' } };
const settle = async (setup, engine) => { for (let i = 0; i < 400; i++) { const s = setup.status(engine); if (s.phase === 'ready' || s.phase === 'failed') return s; await new Promise((r) => setTimeout(r, 0)); } return setup.status(engine); };

describe('the commands are the tools\' own', () => {
  it('installs Claude Code with Anthropic\'s installer and Codex with OpenAI\'s', () => {
    expect(installCommand('claude')).toEqual({ file: '/bin/bash', args: ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'] }); // public-check: allow
    expect(installCommand('codex')).toEqual({ file: '/bin/sh', args: ['-c', 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'] }); // public-check: allow
  });
  it('signs in with the subscription, never the API console', () => {
    expect(signInCommand('claude', '/b/claude')).toEqual({ file: '/b/claude', args: ['auth', 'login', '--claudeai'] });
    expect(signInCommand('codex', '/b/codex')).toEqual({ file: '/b/codex', args: ['login'] });
  });
  it('asks each tool whether it is signed in', () => {
    expect(statusCommand('claude', '/b/claude')).toEqual({ file: '/b/claude', args: ['auth', 'status', '--json'] });
    expect(statusCommand('codex', '/b/codex')).toEqual({ file: '/b/codex', args: ['login', 'status'] });
  });
});

describe('setting up a plan', () => {
  it('installs, signs in and is ready, on a Mac with nothing', async () => {
    const m = machine({ found: false, signedIn: [false, false, true] });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    const s = await settle(setup, 'claude');
    expect(s.phase).toBe('ready');
    const lines = m.calls.map((c) => [c.file, ...c.args].join(' '));
    expect(lines[0]).toBe('/bin/bash -c curl -fsSL https://claude.ai/install.sh | bash'); // public-check: allow
    expect(lines).toContain('/Users/x/.local/bin/tool auth login --claudeai');
    // And the sign-in that was waiting on the browser is not left running.
    expect(m.calls.find((c) => c.args.includes('login')).killed).toBe(true);
  });

  it('installs nothing and asks for nothing when it is already there and signed in', async () => {
    const m = machine({ found: true, signedIn: [true] });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    expect((await settle(setup, 'claude')).phase).toBe('ready');
    expect(m.calls.map((c) => c.args.join(' '))).toEqual(['auth status --json']);
  });

  it('only signs in when it is there but signed out', async () => {
    const m = machine({ found: true, signedIn: [false, true] });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('codex');
    expect((await settle(setup, 'codex')).phase).toBe('ready');
    const lines = m.calls.map((c) => c.args.join(' '));
    expect(lines.some((l) => l.includes('install.sh'))).toBe(false);
    expect(lines).toContain('login');
  });

  it('says where it is while it waits on the browser', async () => {
    const m = machine({ found: true, signedIn: [false] });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    expect(setup.status('claude').phase).toBe('signing-in');
    setup.cancel('claude');
  });

  it('stops at a failed install and says what the installer said last', async () => {
    const m = machine({ found: false, installExit: 1 });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    const s = await settle(setup, 'claude');
    expect(s.phase).toBe('failed');
    expect(s.error).toContain('last line of the installer');
    expect(m.calls.some((c) => c.args.includes('login'))).toBe(false);
  });

  it('fails rather than waits forever when the installer exits fine and nothing is there', async () => {
    const m = machine({ found: false, installs: false });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    expect((await settle(setup, 'claude')).phase).toBe('failed');
  });

  it('fails when the sign-in gives up and they are still signed out', async () => {
    const m = machine({ found: true, signedIn: [false], loginExit: 1 });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    expect((await settle(setup, 'claude')).phase).toBe('failed');
  });

  it('never hands an API key to anything it runs, so the plan is what gets used', async () => {
    const m = machine({ found: false, signedIn: [false, true] });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    await settle(setup, 'claude');
    for (const c of m.calls) {
      expect(c.env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(c.env.OPENAI_API_KEY).toBeUndefined();
      expect(c.env.HOME).toBe('/Users/x');
    }
  });

  it('does not start a second install while the first is running', async () => {
    const m = machine({ found: false, signedIn: [false] });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    setup.start('claude');
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    expect(m.calls.filter((c) => c.args.join(' ').includes('install.sh'))).toHaveLength(1);
    setup.cancel('claude');
  });

  it('opens the sign-in page again by starting a fresh sign-in, not a second one beside it', async () => {
    const m = machine({ found: true, signedIn: [false] });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    setup.signInAgain('claude');
    const logins = m.calls.filter((c) => c.args.includes('login'));
    expect(logins).toHaveLength(2);
    expect(logins[0].killed).toBe(true);
    expect(logins[1].killed).toBe(false);
    setup.cancel('claude');
    expect(logins[1].killed).toBe(true);
  });

  it('keeps Claude and Codex apart, so setting up both runs both', async () => {
    const m = machine({ found: true, signedIn: [true] });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    setup.start('codex');
    expect((await settle(setup, 'claude')).phase).toBe('ready');
    expect((await settle(setup, 'codex')).phase).toBe('ready');
  });

  it('says whether a tool is ready without installing or signing in anything', async () => {
    const signedOut = machine({ found: true, signedIn: [false] });
    const a = createEngineSetup({ ...quick, find: signedOut.find, spawn: signedOut.spawn });
    // `certain` since F-132: a reading says whether it established anything,
    // and these three all did
    // (tests/the-plan-bar-only-says-agents-cannot-start-when-that-is-true).
    expect(await a.readiness('claude')).toEqual({ engine: 'claude', found: true, signedIn: false, certain: true });
    const ready = machine({ found: true, signedIn: [true] });
    const b = createEngineSetup({ ...quick, find: ready.find, spawn: ready.spawn });
    expect(await b.readiness('codex')).toEqual({ engine: 'codex', found: true, signedIn: true, certain: true });
    const none = machine({ found: false });
    const c = createEngineSetup({ ...quick, find: none.find, spawn: none.spawn });
    expect(await c.readiness('claude')).toEqual({ engine: 'claude', found: false, signedIn: false, certain: true });
    for (const m of [signedOut, ready, none]) {
      expect(m.calls.every((x) => x.args.join(' ').match(/status/))).toBe(true);
    }
  });

  it('reads idle for a tool nobody has asked it to set up', () => {
    const setup = createEngineSetup({ ...quick, find: () => ({ found: false }), spawn: () => ({ exit: new Promise(() => {}), kill() {} }) });
    expect(setup.status('codex').phase).toBe('idle');
  });
});
