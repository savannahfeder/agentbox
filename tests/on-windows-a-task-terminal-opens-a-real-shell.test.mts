// ON WINDOWS A TASK TERMINAL OPENS A REAL SHELL, AND CLOSING IT ENDS THAT SHELL.
//
// Measured on Windows 11 through node-pty 1.1.0 in plain Node, with the
// environment a Start menu launch has (Path, ComSpec and SystemRoot, no SHELL).
//
//   loginShell() answered "/bin/sh", and pty.spawn("/bin/sh", ["-l"]) threw
//   "File not found", so the terminal never opened.
//   powershell.exe with ["-l"] exited with code 1 in 2.6 seconds on
//   CommandNotFoundException. With no arguments it echoed a command back.
//   pty.kill("SIGKILL") threw "Signals not supported on windows." and the shell
//   stayed alive. pty.kill() ended the shell and a ping it ran in the
//   foreground, but a ping started with Start-Process -WindowStyle Hidden
//   outlived it. taskkill /T /F on the shell's pid ended both in 292 ms.
//
// So on Windows the terminal runs pwsh.exe when it is on Path, else Windows
// PowerShell, else ComSpec, with no arguments, and closing it runs taskkill on
// its tree and then a bare kill(). taskkill runs without blocking, since the
// window's process closes terminals and could wait up to its five second
// deadline, and kill() waits for it. Only drive-rooted paths count, since a bare
// name resolves in the cwd first. A Mac and Linux keep the login shell, -l and
// SIGKILL.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { terminalShell } from '../main/shell-path.mts';
import { TaskTerminals, disposeTerminalProcess } from '../main/task-terminals.mts';

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

  it('reads windir when SystemRoot is missing', () => {
    const other = 'D:\\WINNT';
    expect(terminalShell({ windir: other }, having(), 'win32').file).toBe(w.join(other, 'System32', 'cmd.exe'));
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
    // The real close would end every process under pid 1 on a Mac or Linux.
    const t = new TaskTerminals({ spawn: (...a) => { calls.push(a); return pty; }, resolve: () => 'C:\\work', shell, sweepMs: 0, disposeProcess: () => {} });
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
  const windowsPty = (log) => ({ pid: 4321, kill(signal) { if (signal) throw new Error('Signals not supported on windows.'); log.push('kill'); } });

  it('on Windows, ends the tree with taskkill by full path without waiting on it, then kills the pty with no signal', () => {
    const log = [];
    let done;
    disposeTerminalProcess(windowsPty(log), 'win32', (file, args, opts, callback) => { log.push([file, args, opts.windowsHide]); done = callback; });
    expect(log).toHaveLength(1);
    const [[file, args, hidden]] = log;
    expect(w.isAbsolute(file)).toBe(true);
    expect(w.basename(file)).toBe('taskkill.exe');
    expect(w.basename(w.dirname(file))).toBe('System32');
    expect(args).toEqual(['/T', '/F', '/PID', '4321']);
    expect(hidden).toBe(true);
    done(null);
    expect(log.at(-1)).toBe('kill');
  });

  it('on Windows, still kills the pty when taskkill fails or cannot start', () => {
    const failed = [];
    disposeTerminalProcess(windowsPty(failed), 'win32', (file, args, opts, callback) => callback(new Error('exit 128')));
    expect(failed).toEqual(['kill']);
    const unstarted = [];
    disposeTerminalProcess(windowsPty(unstarted), 'win32', () => { throw new Error('not found'); });
    expect(unstarted).toEqual(['kill']);
  });

  it('on a Mac, still with SIGKILL and no taskkill', () => {
    const signals = [];
    // No process has -1 as its parent, so this ends no real process.
    disposeTerminalProcess({ pid: -1, kill: (s) => signals.push(s) }, 'darwin', () => { throw new Error('taskkill is not run on a Mac'); });
    expect(signals).toEqual(['SIGKILL']);
  });
});

describe('on this Windows machine, through the real node-pty', () => {
  it.runIf(process.platform === 'win32')('opens the chosen shell, echoes, and closing ends it', async () => {
    const pty = createRequire(import.meta.url)('node-pty');
    const { file, args } = terminalShell();
    const p = pty.spawn(file, args, { cwd: process.cwd(), env: process.env, cols: 80, rows: 24 });
    let out = '';
    let exited = false;
    p.onData((d) => { out += d; });
    p.onExit(() => { exited = true; });
    const until = async (ok, ms) => { for (const end = Date.now() + ms; !ok() && Date.now() < end;) await new Promise((r) => setTimeout(r, 100)); };
    try {
      p.write('echo agentbox-marker\r');
      await until(() => /agentbox-marker[\s\S]*agentbox-marker/.test(out), 15000);
      expect(out).toMatch(/agentbox-marker[\s\S]*agentbox-marker/);
    } finally {
      disposeTerminalProcess(p);
      await until(() => exited, 10000);
    }
    expect(exited).toBe(true);
  }, 30000);
});
