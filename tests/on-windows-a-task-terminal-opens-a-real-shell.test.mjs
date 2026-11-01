// ON WINDOWS A TASK TERMINAL OPENS A REAL SHELL, AND CLOSING IT ENDS THAT SHELL.
//
// Measured on Windows 11 through node-pty 1.1.0 in plain Node, with the
// environment a Start menu launch has (Path, ComSpec, SystemRoot, no SHELL):
//
//   loginShell() answered "/bin/sh", and pty.spawn("/bin/sh", ["-l"]) threw
//   "File not found", so the terminal never opened.
//   powershell.exe with ["-l"] exited with code 1 in 2.6 seconds on
//   CommandNotFoundException. With no arguments it echoed a command back.
//   pty.kill("SIGKILL") threw "Signals not supported on windows." and the shell
//   stayed alive. pty.kill() ended the shell and the ping it was running.
//
// So on Windows the terminal runs pwsh.exe when it is on Path, else Windows
// PowerShell, else ComSpec, with no arguments, and is ended with a bare kill().
// Only drive-rooted paths count, since a bare name resolves in the cwd first.
// A Mac and Linux keep the login shell, -l and SIGKILL.

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { terminalShell } from '../main/shell-path.mjs';
import { TaskTerminals, disposeTerminalProcess } from '../main/task-terminals.mjs';

const w = path.win32;
const ROOT = 'C:\\Windows';
const POWERSHELL = w.join(ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const PWSH_DIR = 'C:\\Program Files\\PowerShell\\7';
const CMD = w.join(ROOT, 'system32', 'cmd.exe');
const startMenu = { Path: `${w.join(ROOT, 'system32')};${ROOT}`, SystemRoot: ROOT, ComSpec: CMD };
const having = (...files) => (p) => files.includes(p);

describe('on Windows the terminal picks a shell Windows has', () => {
  it('runs Windows PowerShell with no arguments', () => {
    expect(terminalShell(startMenu, having(POWERSHELL), 'win32')).toEqual({ file: POWERSHELL, args: [] });
  });

  it('prefers pwsh.exe when it is on Path, read whatever the key is called', () => {
    const pwsh = w.join(PWSH_DIR, 'pwsh.exe');
    const env = { ...startMenu, Path: `${startMenu.Path};${PWSH_DIR}` };
    expect(terminalShell(env, having(POWERSHELL, pwsh), 'win32')).toEqual({ file: pwsh, args: [] });
    const upper = { PATH: env.Path, SYSTEMROOT: ROOT, COMSPEC: CMD };
    expect(terminalShell(upper, having(POWERSHELL, pwsh), 'win32')).toEqual({ file: pwsh, args: [] });
  });

  it('finds pwsh.exe in a quoted Path entry with spaces', () => {
    const pwsh = w.join(PWSH_DIR, 'pwsh.exe');
    const env = { ...startMenu, Path: `"${PWSH_DIR}";${startMenu.Path}` };
    expect(terminalShell(env, having(POWERSHELL, pwsh), 'win32').file).toBe(pwsh);
  });

  it('never takes a shell from a relative Path entry, which would resolve in the terminal folder', () => {
    const env = { ...startMenu, Path: `.;tools;${startMenu.Path}` };
    const planted = having(POWERSHELL, w.join('.', 'pwsh.exe'), w.join('tools', 'pwsh.exe'));
    expect(terminalShell(env, planted, 'win32').file).toBe(POWERSHELL);
  });

  it('falls back to ComSpec when there is no PowerShell', () => {
    expect(terminalShell(startMenu, having(), 'win32')).toEqual({ file: CMD, args: [] });
  });

  it('falls back to System32 cmd.exe when ComSpec is missing or relative', () => {
    const system = w.join(ROOT, 'System32', 'cmd.exe');
    expect(terminalShell({ ...startMenu, ComSpec: 'cmd.exe' }, having(), 'win32').file).toBe(system);
    expect(terminalShell({ SystemRoot: ROOT }, having(), 'win32').file).toBe(system);
  });

  it('never hands back a POSIX path or -l, even with SHELL set', () => {
    const env = { ...startMenu, SHELL: '/bin/bash' };
    const { file, args } = terminalShell(env, having(POWERSHELL, '/bin/bash'), 'win32');
    expect(file).toBe(POWERSHELL);
    expect(args).not.toContain('-l');
  });
});

describe('a Mac and Linux keep the login shell', () => {
  it('uses SHELL with -l on a Mac', () => {
    expect(terminalShell({ SHELL: '/bin/zsh' }, having('/bin/zsh'), 'darwin')).toEqual({ file: '/bin/zsh', args: ['-l'] });
  });

  it('uses the first shell there is with -l on Linux', () => {
    expect(terminalShell({}, having('/bin/bash', '/bin/sh'), 'linux')).toEqual({ file: '/bin/bash', args: ['-l'] });
  });
});

describe('a terminal spawns the shell it was given', () => {
  const opened = (shell) => {
    const calls = [];
    const pty = { pid: 1, onData() {}, onExit() {}, kill() {} };
    const t = new TaskTerminals({ spawn: (...a) => { calls.push(a); return pty; }, resolve: () => 'C:\\work', shell, sweepMs: 0 });
    t.open('k');
    t.dispose();
    return calls[0];
  };

  it('with no -l on Windows', () => {
    const [file, args] = opened({ file: POWERSHELL, args: [] });
    expect(file).toBe(POWERSHELL);
    expect(args).toEqual([]);
  });

  it('with -l on a Mac', () => {
    const [file, args] = opened({ file: '/bin/zsh', args: ['-l'] });
    expect(file).toBe('/bin/zsh');
    expect(args).toEqual(['-l']);
  });
});

describe('closing a terminal ends its shell', () => {
  // node-pty's Windows kill throws on any signal and leaves the shell running.
  const windowsPty = () => {
    const pty = { pid: 999999, killed: false, kill(signal) { if (signal) throw new Error('Signals not supported on windows.'); pty.killed = true; } };
    return pty;
  };

  it('on Windows, with a kill that names no signal', () => {
    const pty = windowsPty();
    disposeTerminalProcess(pty, 'win32');
    expect(pty.killed).toBe(true);
  });

  it('on a Mac, still with SIGKILL', () => {
    const signals = [];
    disposeTerminalProcess({ pid: 999999, kill: (s) => signals.push(s) }, 'darwin');
    expect(signals).toEqual(['SIGKILL']);
  });
});
