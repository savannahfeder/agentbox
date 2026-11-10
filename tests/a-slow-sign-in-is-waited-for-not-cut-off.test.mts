// A SLOW SIGN-IN WAS CUT OFF, AND THE BROWSER CAME BACK TO NOTHING (F-197).
//
// QA batch 013, Debian 13, 0.1.22: a fresh user pressed Install Claude Code
// and took several minutes of captchas to log in. When they approved, Claude
// redirected to localhost:PORT/callback and Chrome said ERR_CONNECTION_REFUSED;
// the app had already shown "Claude Code did not answer the sign-in check. Try
// again." Setup polls `auth status` while the login waits on the browser, and
// one of those checks running past its 15 second deadline threw out of the
// wait, failed the setup and killed the login that was holding the callback
// port open. A check that does not answer says nothing about the sign-in, so it
// must not end it.
//
// These drive setup with pretend processes: status checks that never answer
// while the login is open, then a login that finishes.

import { describe, it, expect } from 'vitest';
import { createEngineSetup, SIGN_IN_WAIT } from '../main/engine-setup.mts';

function machine({ checksAnswer = 'after-login', loginEndsAfter = 6, signedInAfter = true } = {}) {
  let loginDone = false;
  let endLogin;
  let killed = 0;
  const loginExit = new Promise((r) => { endLogin = () => { loginDone = true; r(0); }; });
  let checks = 0;
  const spawn = (file, args) => {
    if (args.join(' ') !== 'auth status --json') return { exit: loginExit, kill: () => { killed += 1; } };
    checks += 1;
    if (checks === 1) return { exit: Promise.resolve(1), kill: () => {} };
    if (checks === loginEndsAfter) endLogin();
    const hangs = checksAnswer === 'never' || (checksAnswer === 'after-login' && !loginDone);
    if (hangs) return { exit: new Promise(() => {}), kill: () => {} };
    return { exit: Promise.resolve(signedInAfter ? 0 : 1), kill: () => {} };
  };
  return { spawn, find: () => ({ found: true, path: '/b/claude' }), killed: () => killed, endLogin };
}

const quick = { wait: () => new Promise((r) => setTimeout(r, 0)), env: { PATH: '/usr/bin:/bin', HOME: '/home/x' } };
const settle = async (setup, tries = 400) => {
  for (let i = 0; i < tries; i++) {
    const s = setup.status('claude');
    if (s.phase === 'ready' || s.phase === 'failed') return s;
    await new Promise((r) => setTimeout(r, 1));
  }
  return setup.status('claude');
};

describe('a sign-in whose status checks stop answering', () => {
  it('keeps waiting, and is ready once the login finishes', async () => {
    const m = machine({ checksAnswer: 'after-login' });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    const s = await settle(setup);
    expect(s.error).toBe(null);
    expect(s.phase).toBe('ready');
  });

  it('does not kill the login while it is still waiting on the browser', async () => {
    const m = machine({ checksAnswer: 'after-login', loginEndsAfter: 1e9 });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    await settle(setup, 60);
    expect(setup.status('claude').phase).toBe('signing-in');
    expect(m.killed()).toBe(0);
    setup.cancel('claude');
  });

  // The boundary on the other side: the login is over and still nothing answers.
  it('fails and says so when the login ends and the check still does not answer', async () => {
    const m = machine({ checksAnswer: 'never' });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    const s = await settle(setup);
    expect(s.phase).toBe('failed');
    expect(s.error).toMatch(/did not answer the sign-in check/);
  });

  it('still fails when the login ends and the answer is a real no', async () => {
    const m = machine({ checksAnswer: 'always', signedInAfter: false });
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn });
    setup.start('claude');
    const s = await settle(setup);
    expect(s.phase).toBe('failed');
    expect(s.error).toMatch(/closed before it finished/);
  });
});

describe('a sign-in nobody finishes', () => {
  it('stops after the long wait, ends the login and says why', async () => {
    const m = machine({ checksAnswer: 'always', signedInAfter: false, loginEndsAfter: 1e9 });
    let t = 0;
    const setup = createEngineSetup({ ...quick, find: m.find, spawn: m.spawn, now: () => (t += 60_000) });
    setup.start('claude');
    const s = await settle(setup);
    expect(s.phase).toBe('failed');
    expect(s.error).toMatch(/waited \d+ minutes/i);
    expect(m.killed()).toBeGreaterThan(0);
  });

  it('waits far longer than a few minutes of captchas', () => {
    expect(SIGN_IN_WAIT).toBeGreaterThanOrEqual(20 * 60_000);
  });
});
