// A SIGN-IN THAT FINISHED WAS REPORTED AS ONE THAT WAS CLOSED.
//
// 2026-10-13: `codex-can-find-node-when-opened-from-the-desktop` went red on
// GitHub's Linux runner with the setup in `failed` instead of `ready`. The
// cause was not the runner. Setup polls "are you signed in?" while the sign-in
// command waits on the browser. When the sign-in finished WHILE one of those
// checks was already running, the check (asked a moment too early) said no,
// the sign-in's exit had by then marked it ended, and setup gave up with "The
// sign-in was closed before it finished", for somebody who had just approved
// it. A slow machine widens the window; a real person can land in it too.
//
// These drive the setup with pretend processes so the order is exact: the
// sign-in exits in the middle of a check, before that check answers.

import { describe, it, expect } from 'vitest';
import { createEngineSetup } from '../main/engine-setup.mts';

// `signedInAfterLogin` is what a check started AFTER the sign-in exited says.
// `loginEnds` picks when the sign-in exits: during the second status check, or
// before it starts.
function machine({ signedInAfterLogin = true, loginEnds = 'during-check' } = {}) {
  let loginDone = false;
  let endLogin;
  const loginExit = new Promise((r) => { endLogin = () => { loginDone = true; r(0); }; });
  let checks = 0;
  const spawn = (file, args) => {
    if (args.join(' ') !== 'login status') return { exit: loginExit, kill: () => {} };
    checks += 1;
    if (checks === 2 && loginEnds === 'during-check') {
      // This check was asked while the browser was still open, so it says no,
      // and the sign-in exits before that answer arrives.
      endLogin();
      return { exit: loginExit.then(() => 1), kill: () => {} };
    }
    if (checks === 2 && loginEnds === 'before-check') endLogin();
    return { exit: Promise.resolve(loginDone && signedInAfterLogin ? 0 : 1), kill: () => {} };
  };
  const find = () => ({ found: true, path: '/b/codex' });
  return { spawn, find, checks: () => checks };
}

const quick = { wait: () => new Promise((r) => setTimeout(r, 0)), env: { PATH: '/usr/bin:/bin', HOME: '/home/x' } };
const settle = async (setup) => {
  for (let i = 0; i < 400; i++) {
    const s = setup.status('codex');
    if (s.phase === 'ready' || s.phase === 'failed') return s;
    await new Promise((r) => setTimeout(r, 1));
  }
  return setup.status('codex');
};

describe('a sign-in that finishes while setup is asking', () => {
  it('is ready, not "closed before it finished"', async () => {
    const m = machine({ loginEnds: 'during-check' });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('codex');
    const s = await settle(setup);
    expect(s.error).toBe(null);
    expect(s.phase).toBe('ready');
  });

  it('is ready when it finishes just before a check, as it always was', async () => {
    const m = machine({ loginEnds: 'before-check' });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('codex');
    expect((await settle(setup)).phase).toBe('ready');
  });

  it('still fails when the sign-in exits and nobody is signed in', async () => {
    const m = machine({ loginEnds: 'during-check', signedInAfterLogin: false });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('codex');
    const s = await settle(setup);
    expect(s.phase).toBe('failed');
    expect(s.error).toMatch(/closed before it finished/);
  });
});
