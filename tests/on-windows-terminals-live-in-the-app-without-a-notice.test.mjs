// ON WINDOWS TERMINALS LIVE IN THE APP, WITHOUT A NOTICE AND WITHOUT A WAIT.
//
// The host that keeps terminals through a restart listens on a socket path in
// the temp folder. Measured on Windows 11 in plain Node, it logged "listen
// EACCES" and exited with code 13. The app fell back to its own terminals after
// 232 ms, and every terminal opened with "This terminal ends when Agentbox
// quits, because the process that keeps terminals running through a restart
// would not start (it exited with code 13)." After five minutes the next open
// tried the host again and waited on it.
//
// So on Windows no host is tried and the terminal opens in the app as it is.
// A Mac and Linux still start the host, and still say so when it will not start.

import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { TerminalHosts } from '../main/terminal-hosts.mjs';

const hosts = (platform) => {
  const opened = [];
  const launched = [];
  const local = {
    sessions: new Map(),
    open: (key, place) => { opened.push([key, place]); return { key, notice: place?.notice }; },
    list: () => [],
  };
  const t = new TerminalHosts({
    local,
    platform,
    dir: os.tmpdir(),
    stamp: 'never-a-real-host',
    launch: (sockPath) => { launched.push(sockPath); throw new Error('could not start'); },
    connect: () => Promise.reject(new Error('no host')),
  });
  return { t, opened, launched };
};

describe('on Windows', () => {
  it('opens the terminal in the app, with no host started and no notice', async () => {
    const { t, opened, launched } = hosts('win32');
    const state = await t.open('k', { cwd: 'C:\\work' });
    expect(launched).toEqual([]);
    expect(opened).toEqual([['k', { cwd: 'C:\\work' }]]);
    expect(state.notice).toBeUndefined();
  });

  it('keeps the notice a task folder already had, and adds nothing to it', async () => {
    const { t, opened } = hosts('win32');
    await t.open('k', { cwd: 'C:\\work', notice: 'Opened in the project folder.' });
    expect(opened[0][1].notice).toBe('Opened in the project folder.');
  });

  it('reads, writes and closes that terminal in the app', async () => {
    const { t } = hosts('win32');
    const calls = [];
    Object.assign(t.local, {
      read: (...a) => calls.push(['read', ...a]),
      write: (...a) => calls.push(['write', ...a]),
      close: (...a) => calls.push(['close', ...a]),
    });
    await t.open('k', { cwd: 'C:\\work' });
    await t.read('k', 0, 0);
    await t.write('k', 'dir\r');
    await t.close('k');
    expect(calls.map((c) => c[0])).toEqual(['read', 'write', 'close']);
  });
});

describe('on a Mac', () => {
  it('still tries the host, and says so when it will not start', async () => {
    const { t, opened, launched } = hosts('darwin');
    await t.open('k', { cwd: '/work' });
    expect(launched).toHaveLength(1);
    expect(opened[0][1].notice).toMatch(/would not start \(could not start\)/);
  });
});
