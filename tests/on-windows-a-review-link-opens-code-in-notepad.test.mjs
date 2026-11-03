// ON WINDOWS A REVIEW LINK OPENS CODE IN NOTEPAD.
//
// A review names a source file and the link opened it with /usr/bin/open -t,
// macOS's way of asking for the text editor. Windows has no /usr/bin/open, and
// the call failed with ENOENT, so on Windows the link did nothing.
//
// A source file should be shown as text, so on Windows it opens as text in
// Notepad, by its full path. Windows starts notepad.exe from System32 with the
// file as its one argument and no shell, and does not wait, since Notepad
// stays open until the person closes it. Only a drive-rooted path is opened, so
// nothing resolves against the app's own folder and nothing reads as a
// Notepad switch.

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { openSourceFile } from '../main/open-source-file.mts';

const env = { SystemRoot: 'C:\\Windows' };
const NOTEPAD = 'C:\\Windows\\System32\\notepad.exe';

// A child that starts and never ends, the way Notepad behaves.
function fakeSpawn({ fails = null } = {}) {
  const calls = [];
  const spawn = (file, args, options) => {
    const child = new EventEmitter();
    child.unref = vi.fn();
    calls.push({ file, args, options, child });
    setImmediate(() => (fails ? child.emit('error', fails) : child.emit('spawn')));
    return child;
  };
  return { spawn, calls };
}

describe('on Windows', () => {
  it('opens the file in Notepad by its full path, with no shell, and does not wait for it to close', async () => {
    const run = vi.fn();
    const { spawn, calls } = fakeSpawn();
    await openSourceFile('C:\\repo\\a $(touch nope).py', run, { platform: 'win32', env, spawn });
    expect(run).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe(NOTEPAD);
    expect(calls[0].args).toEqual(['C:\\repo\\a $(touch nope).py']);
    expect(calls[0].options.shell).toBeFalsy();
    expect(calls[0].options.detached).toBe(true);
    expect(calls[0].options.stdio).toBe('ignore');
    expect(calls[0].child.unref).toHaveBeenCalled();
  });

  it('opens a script as text too', async () => {
    const { spawn, calls } = fakeSpawn();
    await openSourceFile('D:\\work\\build.js', vi.fn(), { platform: 'win32', env, spawn });
    expect(calls[0].file).toBe(NOTEPAD);
    expect(calls[0].args).toEqual(['D:\\work\\build.js']);
  });

  it('finds Notepad under the Windows folder this computer names', async () => {
    const { spawn, calls } = fakeSpawn();
    await openSourceFile('C:\\repo\\a.py', vi.fn(), { platform: 'win32', env: { SystemRoot: 'E:\\WinNT' }, spawn });
    expect(calls[0].file).toBe('E:\\WinNT\\System32\\notepad.exe');
  });

  it('writes a path with forward slashes the Windows way', async () => {
    const { spawn, calls } = fakeSpawn();
    await openSourceFile('C:/repo/src/a.py', vi.fn(), { platform: 'win32', env, spawn });
    expect(calls[0].args).toEqual(['C:\\repo\\src\\a.py']);
  });

  it('refuses a path that is not drive-rooted', async () => {
    for (const file of ['repo\\a.py', '/repo/a.py', '\\repo\\a.py', '/P C:\\repo\\a.py', '-a Terminal']) {
      const { spawn, calls } = fakeSpawn();
      await expect(openSourceFile(file, vi.fn(), { platform: 'win32', env, spawn })).rejects.toThrow();
      expect(calls).toHaveLength(0);
    }
  });

  it('says plainly that a file on a network share is not opened', async () => {
    for (const file of ['\\\\server\\share\\a.py', '//server/share/a.py']) {
      const { spawn, calls } = fakeSpawn();
      await expect(openSourceFile(file, vi.fn(), { platform: 'win32', env, spawn })).rejects.toThrow('network');
      expect(calls).toHaveLength(0);
    }
  });

  it('refuses a device path without calling it a network share', async () => {
    for (const file of ['\\\\?\\C:\\repo\\a.py', '\\\\.\\C:\\repo\\a.py']) {
      const { spawn, calls } = fakeSpawn();
      await expect(openSourceFile(file, vi.fn(), { platform: 'win32', env, spawn })).rejects.toThrow('Resolve the source file');
      expect(calls).toHaveLength(0);
    }
  });

  it('reports Notepad failing to start', async () => {
    const { spawn } = fakeSpawn({ fails: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) });
    await expect(openSourceFile('C:\\repo\\a.py', vi.fn(), { platform: 'win32', env, spawn })).rejects.toThrow('ENOENT');
  });
});

describe('on a Mac nothing changes', () => {
  it('still asks open for the text editor and starts nothing itself', async () => {
    const run = vi.fn(async () => {});
    const { spawn, calls } = fakeSpawn();
    await openSourceFile('/repo/a.py', run, { platform: 'darwin', env, spawn });
    expect(run).toHaveBeenCalledWith('/usr/bin/open', ['-t', '/repo/a.py'], { timeout: 10000 });
    expect(calls).toHaveLength(0);
  });

  it('still refuses a relative path', async () => {
    const run = vi.fn();
    await expect(openSourceFile('repo/a.py', run, { platform: 'darwin' })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
});
