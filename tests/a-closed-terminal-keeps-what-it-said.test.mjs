// A CLOSED TERMINAL KEEPS WHAT IT SAID.
//
// Reported 2026-10-14 (w-6841800f17): "I come back after maybe 15 minutes and
// it's gone. I have to do it all over again and it happens six or more times.
// I don't see the error message." Her screenshot shows a deploy terminal that
// read only "[The previous shell here was closed after ten minutes idle. This
// is a new one.]" above a fresh prompt.
//
// Measured against main/task-terminals.mjs as it was: a deploy that finished
// (or failed) at minute 0 left an idle shell, the sweep ended it at minute 10,
// and the reopened terminal's whole screen was that one line, 70 characters,
// with the deploy's output gone. Two fixes, both tested here: the wait is an
// hour, and whatever the old shell last showed comes back above the new one.

import { describe, it, expect, vi } from 'vitest';
import { TaskTerminals } from '../main/task-terminals.mjs';

const MINUTE = 60000;

function fixture() {
  const clock = { t: 0 };
  const made = [];
  const spawn = vi.fn(() => {
    let onData = () => {};
    const child = {
      pid: 1000 + made.length, process: 'zsh',
      write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
      onData: (fn) => { onData = fn; }, onExit: () => {},
      say: (text) => onData(text),
    };
    made.push(child);
    return child;
  });
  // No idleMs: these tests are about the app's own default.
  const manager = new TaskTerminals({
    spawn, resolve: () => '/tmp', disposeProcess: (p) => p.kill(),
    sweepMs: 0, now: () => clock.t,
  });
  return { manager, made, tick: (ms) => { clock.t += ms; } };
}

// She watched it print, then left. A shell holding output she has not read is
// never closed for idling (a-shell-waits-until-you-have-read-what-it-printed),
// so these tests read it first to reach the close they are about.
function sawIt(f, key) { f.manager.read(key, 0); }

describe('a terminal you walked away from is still there when you come back', () => {
  it('is still open after the fifteen minutes she reported', () => {
    const f = fixture();
    f.manager.open('p:deploy');
    f.tick(15 * MINUTE);
    f.manager.sweepIdle();
    expect(f.manager.sessions.has('p:deploy')).toBe(true);
  });

  it('is still open just short of an hour', () => {
    const f = fixture();
    f.manager.open('p:deploy');
    f.tick(60 * MINUTE - 1);
    f.manager.sweepIdle();
    expect(f.manager.sessions.has('p:deploy')).toBe(true);
  });

  it('is closed once an hour has passed with nobody looking', () => {
    const f = fixture();
    f.manager.open('p:deploy');
    f.tick(60 * MINUTE + 1);
    f.manager.sweepIdle();
    expect(f.manager.sessions.has('p:deploy')).toBe(false);
  });
});

describe('and when one is closed, its output comes back with the new shell', () => {
  it('shows the error the old shell printed, then says what happened', () => {
    const f = fixture();
    f.manager.open('p:deploy');
    f.made[0].say('$ npm run release\r\nError: notarisation failed (401)\r\n$ ');
    sawIt(f, 'p:deploy');
    f.tick(61 * MINUTE);
    f.manager.sweepIdle();
    const back = f.manager.open('p:deploy').data;
    expect(back).toContain('Error: notarisation failed (401)');
    expect(back).toContain('closed after an hour idle');
    // The old output comes first, then the line saying it is a new shell.
    expect(back.indexOf('notarisation failed')).toBeLessThan(back.indexOf('closed after an hour idle'));
  });

  it('keeps the output when the cap took the shell, too', () => {
    const f = fixture();
    f.manager.open('p:0');
    f.made[0].say('the last thing p:0 said\r\n');
    sawIt(f, 'p:0');
    for (let i = 1; i < 20; i++) { f.tick(MINUTE); f.manager.open('p:' + i); }
    f.manager.open('p:new');
    const back = f.manager.open('p:0').data;
    expect(back).toContain('the last thing p:0 said');
    expect(back).toContain('to make room for a newer terminal');
  });

  it('shows it once, not again on the reopen after that', () => {
    const f = fixture();
    f.manager.open('p:deploy');
    f.made[0].say('Error: once\r\n');
    sawIt(f, 'p:deploy');
    f.tick(61 * MINUTE);
    f.manager.sweepIdle();
    f.manager.open('p:deploy');
    f.manager.close('p:deploy');
    expect(f.manager.open('p:deploy').data).toBe('');
  });

  it('does not bring output back when she ended the shell herself', () => {
    const f = fixture();
    f.manager.open('p:deploy');
    f.made[0].say('something she chose to throw away\r\n');
    f.manager.close('p:deploy');
    expect(f.manager.open('p:deploy').data).toBe('');
  });

  it('does not carry one terminal\'s output into another', () => {
    const f = fixture();
    f.manager.open('p:a');
    f.made[0].say('only in a\r\n');
    sawIt(f, 'p:a');
    f.tick(61 * MINUTE);
    f.manager.sweepIdle();
    expect(f.manager.open('p:b').data).not.toContain('only in a');
  });

  it('keeps the end of a long screen, where the error is, and starts on a whole line', () => {
    const f = fixture();
    f.manager.open('p:deploy');
    const line = 'x'.repeat(99) + '\n';
    f.made[0].say(line.repeat(2000) + 'Error: at the very end\r\n');
    sawIt(f, 'p:deploy');
    f.tick(61 * MINUTE);
    f.manager.sweepIdle();
    const back = f.manager.open('p:deploy').data;
    expect(back).toContain('Error: at the very end');
    expect(back.length).toBeLessThanOrEqual(64 * 1024 + 400);
    // The kept part begins at the start of a line, not halfway through one.
    expect(back.startsWith('x'.repeat(99) + '\n')).toBe(true);
  });
});
