// A SHELL WAITS UNTIL YOU HAVE READ WHAT IT PRINTED.
//
// What broke (2026-10-11): she ran the AWS tools install in a task's terminal,
// left the thread while it ran, and came back to "[The previous shell here was
// closed after ten minutes idle. This is a new one.]". The install's output,
// the thing she came back to read, was gone. Her words: "we don't want them to
// close prematurely ... I was running it."
//
// Measured against the sweep: the ten minutes ran from the last time the panel
// READ the shell, not from anything the shell did. A command that ran longer
// than ten minutes unwatched was reaped on the first sweep after it finished
// (up to one minute later); a shorter one was reaped ten minutes after she
// left, however recently it had finished. Either way, output nobody had seen.
//
// Now a shell holding output she has not seen is not idle. Reading it starts
// the idle clock (an hour since w-6841800f17; ten minutes here, set by the
// fixture), and the cap takes a shell she has read before one she has not.

import { describe, it, expect, vi } from 'vitest';
import { TaskTerminals } from '../main/task-terminals.mjs';

const MINUTE = 60000;

function fixture() {
  const clock = { t: 0 };
  const made = [];
  const spawn = vi.fn(() => {
    const child = {
      pid: 1000 + made.length, process: 'zsh',
      write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
      onData: (fn) => { child.print = fn; }, onExit: () => {},
    };
    made.push(child);
    return child;
  });
  const manager = new TaskTerminals({
    spawn, resolve: () => '/tmp', disposeProcess: (p) => p.kill(),
    sweepMs: 0, idleMs: 10 * MINUTE, now: () => clock.t,
  });
  return { manager, made, tick: (ms) => { clock.t += ms; } };
}

// She starts the install while watching, then leaves the thread.
function startInstallAndLeave(f, key = 'p:a') {
  f.manager.open(key);
  const child = f.made[f.made.length - 1];
  child.process = 'brew';
  child.print('==> Downloading awscli\r\n');
  f.manager.read(key, 0);
  return child;
}

describe('output nobody has seen keeps the shell', () => {
  it('a long install that finishes while she is away is still there when she comes back', () => {
    const f = fixture();
    const child = startInstallAndLeave(f);
    f.tick(25 * MINUTE);
    child.print('🍺  awscli was successfully installed!\r\n% ');
    child.process = 'zsh';
    f.manager.sweepIdle();
    f.tick(60 * MINUTE);
    f.manager.sweepIdle();
    expect(f.manager.sessions.has('p:a')).toBe(true);
    expect(child.kill).not.toHaveBeenCalled();
    expect(f.manager.read('p:a', 0).data).toContain('successfully installed');
  });

  it('a short install that finishes soon after she leaves is still there too', () => {
    const f = fixture();
    const child = startInstallAndLeave(f);
    f.tick(2 * MINUTE);
    child.print('done\r\n% ');
    child.process = 'zsh';
    f.tick(30 * MINUTE);
    f.manager.sweepIdle();
    expect(f.manager.sessions.has('p:a')).toBe(true);
  });

  it('once she has read it, the ten minutes start again from then', () => {
    const f = fixture();
    const child = startInstallAndLeave(f);
    f.tick(25 * MINUTE);
    child.print('done\r\n% ');
    child.process = 'zsh';
    f.tick(30 * MINUTE);
    f.manager.read('p:a', 0);
    f.tick(9 * MINUTE);
    f.manager.sweepIdle();
    expect(f.manager.sessions.has('p:a')).toBe(true);
    f.tick(2 * MINUTE);
    f.manager.sweepIdle();
    expect(f.manager.sessions.has('p:a')).toBe(false);
  });

  it('a read that waits for output counts as reading what it hands back', async () => {
    const f = fixture();
    const child = startInstallAndLeave(f);
    child.process = 'zsh';
    const end = f.manager.read('p:a', 0).offset;
    const waiting = f.manager.read('p:a', end, 1000);
    child.print('% ');
    await waiting;
    f.tick(11 * MINUTE);
    f.manager.sweepIdle();
    expect(f.manager.sessions.has('p:a')).toBe(false);
  });
});

describe('the shells that should still go, still go', () => {
  it('a shell whose output she has all seen goes after ten idle minutes', () => {
    const f = fixture();
    const child = startInstallAndLeave(f);
    child.process = 'zsh';
    f.tick(10 * MINUTE + 1);
    f.manager.sweepIdle();
    expect(f.manager.sessions.has('p:a')).toBe(false);
  });

  it('at the cap, a shell she has read goes before one she has not, even a newer one', () => {
    const f = fixture();
    const first = startInstallAndLeave(f, 'p:0');
    first.print('done\r\n% ');
    first.process = 'zsh';
    for (let i = 1; i < 20; i++) { f.tick(MINUTE); f.manager.open('p:' + i); }
    f.manager.open('p:new');
    expect(f.manager.sessions.has('p:0')).toBe(true);
    expect(f.manager.sessions.has('p:1')).toBe(false);
  });

  it('at the cap, when every idle shell has something unread, the least recently watched still makes room', () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) {
      f.tick(MINUTE);
      f.manager.open('p:' + i);
      f.made[i].print('done\r\n% ');
    }
    expect(() => f.manager.open('p:new')).not.toThrow();
    expect(f.manager.sessions.has('p:0')).toBe(false);
    expect(f.manager.sessions.size).toBe(20);
  });
});
