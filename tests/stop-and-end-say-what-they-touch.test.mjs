// The problem: both buttons sat on the terminal toolbar at all times, in the
// same weight, and neither named what it acted on.
//
// Two changes answer it. The words now name their object, a COMMAND against a
// SHELL. And the first of them is only on screen when there is a command to
// stop, so most of the time the toolbar shows only one button
// there and no comparison to make.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { commandRunning } from '../shared/terminal-state.mjs';

describe('whether there is a command to stop', () => {
  it('is no at an idle prompt, however the shell reports its name', () => {
    // NODE-PTY SAYS THE SAME SHELL THREE WAYS AND ALL THREE HAVE TO READ AS
    // IDLE. Measured against real ttys on 2026-09-21
    //: one idle zsh answered `zsh` and
    // another answered `/bin/zsh`, and the app spawns `$SHELL -l` so a login
    // shell is `-zsh`. The first version of this matched the whole string, so
    // `/bin/zsh` read as BUSY: Stop command sat on an idle prompt and the sweep
    // never ended the terminal it was meant to end.
    for (const idle of ['zsh', '-zsh', '/bin/zsh', '-/bin/zsh', 'bash', '-bash',
      '/usr/local/bin/fish', 'sh', 'fish', 'Shell']) {
      expect(commandRunning(idle, false), idle).toBe(false);
    }
  });

  it('is yes while a command holds the foreground, path or no path', () => {
    for (const busy of ['npm', 'vim', 'node', 'git', 'ssh', 'claude',
      '/usr/bin/vim', '/opt/homebrew/bin/node', 'sleep']) {
      expect(commandRunning(busy, false), busy).toBe(true);
    }
  });

  it('is no once the shell has exited, whatever was running when it went', () => {
    expect(commandRunning('npm', true)).toBe(false);
    expect(commandRunning('Exited', true)).toBe(false);
  });

  it('is no on nothing at all, which is what the first poll carries', () => {
    expect(commandRunning('', false)).toBe(false);
    expect(commandRunning('   ', false)).toBe(false);
  });
});

// The comments in TaskTerminal.tsx QUOTE the old labels, so they contain the
// very words being checked for absence. Everything below reads the code with the
// comments taken out, which is the only honest way to ask "does this still
// render that sentence".
const withoutComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the words on the toolbar', () => {
  const source = withoutComments(fs.readFileSync(
    new URL('../renderer/src/components/TaskTerminal.tsx', import.meta.url), 'utf8'));

  it('name a command and a shell, not two kinds of stopping', () => {
    expect(source).toContain('Stop command');
    expect(source).toContain('End shell');
    expect(source).not.toContain('End session');
  });

  it('only offers to stop a command while one is running', () => {
    expect(source).toContain('{running&&<button');
    expect(source).toContain('const running=commandRunning(processName,exited);');
  });

  it('says on each what it leaves alone', () => {
    // The three tooltips are the three different things, and each one says what
    // SURVIVES it, because that is the part that could not be told apart.
    expect(source).toContain('The shell stays open.');
    expect(source).toContain('End this shell and everything it started. The terminal closes.');
    expect(source).toContain('Hide the terminal. The shell keeps running.');
  });
});

describe('what the terminal no longer says at the bottom', () => {
  it('has no footer and no rule for one', () => {
    const source = withoutComments(fs.readFileSync(
      new URL('../renderer/src/components/TaskTerminal.tsx', import.meta.url), 'utf8'));
    const css = withoutComments(fs.readFileSync(
      new URL('../renderer/src/components/task-terminal.css', import.meta.url), 'utf8'));
    expect(source).not.toContain('Local shell');
    expect(source).not.toContain('<footer>');
    expect(css).not.toContain('.task-terminal footer');
  });
});
