// NOBODY ENDS A SHELL, SO THE SHELLS END THEMSELVES.
//
// Her pick out of three, 2026-09-21: "Ten minute idle timer, plus reuse the
// oldest idle slot at the cap."
//
// The clock is injected, so these are exact rather than slow: no test here
// waits for anything.

import { describe, it, expect, vi } from 'vitest';
import { TaskTerminals } from '../main/task-terminals.mjs';

const MINUTE = 60000;

// `process` is what node-pty reports as the foreground process name, and it is
// the one thing that decides busy from idle. `sweepMs: 0` keeps the real
// interval out of the suite; the sweep is called by hand instead.
function fixture({ now = 0 } = {}) {
  const clock = { t: now };
  const made = [];
  const spawn = vi.fn(() => {
    const child = {
      pid: 1000 + made.length, process: 'zsh',
      write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
      onData: () => {}, onExit: () => {},
    };
    made.push(child);
    return child;
  });
  const manager = new TaskTerminals({
    spawn, resolve: () => '/tmp', disposeProcess: (p) => p.kill(),
    sweepMs: 0, idleMs: 10 * MINUTE, now: () => clock.t,
  });
  return { manager, spawn, made, clock, tick: (ms) => { clock.t += ms; } };
}

describe('a shell nobody is watching ends itself', () => {
  it('goes after ten idle minutes', () => {
    const f = fixture();
    f.manager.open('p:a');
    f.tick(10 * MINUTE + 1);
    f.manager.sweepIdle();
    expect(f.manager.sessions.size).toBe(0);
    expect(f.made[0].kill).toHaveBeenCalled();
  });

  it('stays while it is still being watched', () => {
    // The panel reads every 150ms while it is on screen, so a terminal she is
    // looking at is one whose `lastReadAt` never gets ten minutes old.
    const f = fixture();
    f.manager.open('p:a');
    for (let i = 0; i < 12; i++) { f.tick(MINUTE); f.manager.read('p:a', 0); }
    f.manager.sweepIdle();
    expect(f.manager.sessions.size).toBe(1);
  });

  it('is never taken while a command is running in it', () => {
    // The case this whole rule exists to protect: she starts a dev server, hides
    // the terminal, and goes away for an hour.
    const f = fixture();
    f.manager.open('p:a');
    f.made[0].process = 'npm';
    f.tick(60 * MINUTE);
    f.manager.sweepIdle();
    expect(f.manager.sessions.size).toBe(1);
    expect(f.made[0].kill).not.toHaveBeenCalled();
  });

  it('goes once that command finishes and nobody comes back', () => {
    const f = fixture();
    f.manager.open('p:a');
    f.made[0].process = 'npm';
    f.tick(60 * MINUTE);
    f.manager.sweepIdle();
    expect(f.manager.sessions.size).toBe(1);
    f.made[0].process = 'zsh';
    f.manager.sweepIdle();
    expect(f.manager.sessions.size).toBe(0);
  });

  it('takes only the idle ones, and leaves the busy one alone', () => {
    const f = fixture();
    f.manager.open('p:a'); f.manager.open('p:b'); f.manager.open('p:c');
    f.made[1].process = 'vim';
    f.tick(11 * MINUTE);
    f.manager.sweepIdle();
    expect([...f.manager.sessions.keys()]).toEqual(['p:b']);
  });
});

describe('the twenty-first terminal reuses instead of refusing', () => {
  it('takes the least recently watched idle slot', () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) { f.tick(MINUTE); f.manager.open('p:' + i); }
    // p:0 was opened first and never read since, so it is the one that goes.
    expect(() => f.manager.open('p:new')).not.toThrow();
    expect(f.manager.sessions.has('p:0')).toBe(false);
    expect(f.manager.sessions.has('p:new')).toBe(true);
    expect(f.manager.sessions.size).toBe(20);
  });

  it('will not take a busy one even to make room', () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) { f.tick(MINUTE); f.manager.open('p:' + i); }
    f.made[0].process = 'npm';
    f.manager.open('p:new');
    expect(f.manager.sessions.has('p:0')).toBe(true);
    expect(f.manager.sessions.has('p:1')).toBe(false);
  });

  it('still refuses when all twenty are genuinely running something', () => {
    // The only state the wall is still true in, and the sentence says why rather
    // than telling her to do the thing she never does.
    const f = fixture();
    for (let i = 0; i < 20; i++) f.manager.open('p:' + i);
    for (const child of f.made) child.process = 'npm';
    expect(() => f.manager.open('p:new')).toThrow(/every one of them is running something/);
    expect(f.manager.sessions.size).toBe(20);
  });

  it('reconnecting to a shell that is already open never evicts anything', () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) f.manager.open('p:' + i);
    f.manager.open('p:5');
    expect(f.manager.sessions.size).toBe(20);
    expect(f.spawn).toHaveBeenCalledTimes(20);
  });
});

describe('reopening one the app tidied away says so', () => {
  it('opens with a line about the shell that went, not a blank screen', () => {
    const f = fixture();
    f.manager.open('p:a');
    f.tick(11 * MINUTE);
    f.manager.sweepIdle();
    const back = f.manager.open('p:a');
    expect(back.data).toContain('closed after ten minutes idle');
    expect(back.data).toContain('This is a new one');
  });

  it('says the other true thing when the cap took it', () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) { f.tick(MINUTE); f.manager.open('p:' + i); }
    f.manager.open('p:new');
    const back = f.manager.open('p:0');
    expect(back.data).toContain('to make room for a newer terminal');
  });

  it('says nothing at all on a terminal opened for the first time', () => {
    const f = fixture();
    expect(f.manager.open('p:a').data).toBe('');
  });

  it('says nothing when she ended it herself', () => {
    // She pressed End shell. She knows. A line explaining it would be the app
    // narrating her own action back to her.
    const f = fixture();
    f.manager.open('p:a');
    f.manager.close('p:a');
    expect(f.manager.open('p:a').data).toBe('');
  });
});

describe('the sweep does not outlive the manager', () => {
  it('is cleared by dispose, so nothing calls close on a dead map', () => {
    const f = new TaskTerminals({ spawn: () => ({ pid: 1, process: 'zsh', write() {}, resize() {}, kill() {}, onData() {}, onExit() {} }), resolve: () => '/tmp', disposeProcess: () => {} });
    expect(f.timer).toBeTruthy();
    f.dispose();
    expect(f.timer).toBe(null);
  });
});
