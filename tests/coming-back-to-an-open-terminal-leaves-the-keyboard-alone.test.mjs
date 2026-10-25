// COMING BACK TO AN OPEN TERMINAL LEAVES THE KEYBOARD ALONE.
//
// Reported (w-555614d32a): "if i ever enter a thread that previously had the
// terminal open, it starts with the keyboard focused in the terminal ... and
// always have to click out of the terminal to actually use my shortcuts again."
// The thread page rebuilds the terminal it left open, and the build ended in
// terminal.focus() whoever had asked for it. xterm's input is a textarea, and
// the app's shortcuts stand aside for a textarea, so J, K, E and R all went to
// the shell.
//
// Measured by mounting the real TaskTerminal in Chromium under StrictMode with
// a stand-in shell: opening it put the keys in its textarea, as it should, and
// so did leaving the thread and coming back, two times out of two. With the
// fix the keys stay on the page on the way back in, and still go to the
// terminal when it is opened, shown again with Cmd+J, or opened for the
// Settings sign in.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { terminalKeys } from '../shared/terminal-focus.mjs';

describe('when a terminal is built, who gets the keyboard', () => {
  it('stays with the page on coming back to a thread whose terminal was open', () => {
    const keys = terminalKeys({ startOpen: false, wasOpen: true });
    expect(keys.takesKeys(0)).toBe(false);
    // StrictMode builds it twice; the second build is still the same visit.
    expect(keys.takesKeys(0)).toBe(false);
  });

  it('goes to the terminal once it is hidden and opened again', () => {
    const keys = terminalKeys({ startOpen: false, wasOpen: true });
    keys.hidden();
    expect(keys.takesKeys(0)).toBe(true);
  });

  it('goes to the terminal after Retry or New session, which are presses inside it', () => {
    const keys = terminalKeys({ startOpen: false, wasOpen: true });
    expect(keys.takesKeys(1)).toBe(true);
  });

  it('goes to the terminal when one that was shut is opened', () => {
    expect(terminalKeys({ startOpen: false, wasOpen: false }).takesKeys(0)).toBe(true);
    expect(terminalKeys({}).takesKeys(0)).toBe(true);
  });

  it('goes to the terminal for a page that is only a terminal, like the Settings sign in', () => {
    expect(terminalKeys({ startOpen: true, wasOpen: true }).takesKeys(0)).toBe(true);
    expect(terminalKeys({ startOpen: true, wasOpen: false }).takesKeys(0)).toBe(true);
  });
});

describe('the terminal pane asks before it takes the keyboard', () => {
  const source = fs.readFileSync(new URL('../renderer/src/components/TaskTerminal.tsx', import.meta.url), 'utf8');

  it('remembers whether it was open when the thread was entered', () => {
    expect(source).toMatch(/terminalKeys\(\{startOpen,wasOpen:saved\?\.open\}\)/);
  });

  it('focuses only through that answer, and forgets the visit once hidden', () => {
    expect(source.match(/\.focus\(\)/g)).toEqual(['.focus()']);
    expect(source).toMatch(/if\(takeKeys\)terminal\.focus\(\)/);
    expect(source).toMatch(/const takeKeys=keys\.takesKeys\(revision\)/);
    expect(source).toMatch(/if\(!open\)\{keys\.hidden\(\);return;\}/);
  });
});
