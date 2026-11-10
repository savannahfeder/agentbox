// ON WINDOWS A RUN STARTS DIRECTLY, WITHOUT A HOST.
//
// The app set `supervisor.hostRuns = true` on every computer, and the run host
// listens on a socket path in the temp folder. Measured on Windows 11 in plain
// Node, `serveRuns` on that path logged "listen EACCES: permission denied" and
// never served, and `main/run-host.mjs` started as a program exited with code
// 13 after 194 ms. So the first local run waited about 5 seconds while
// HostedRun tried to connect 50 times, ended with "the run host stopped
// answering for this run", and was started again as a transport fault. Runs then
// went direct for ten minutes, and the next run after that started a host again.
//
// So on Windows no host is tried and a run starts directly. A Mac and Linux
// still hold their runs in the host.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHostWorksOn, serveRuns } from '../main/run-host.mts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('whether runs are held by the run host', () => {
  it('is no on Windows', () => {
    expect(runHostWorksOn('win32')).toBe(false);
  });

  it('is yes on a Mac', () => {
    expect(runHostWorksOn('darwin')).toBe(true);
  });

  it('is yes on Linux', () => {
    expect(runHostWorksOn('linux')).toBe(true);
  });
});

describe('the app', () => {
  it('asks, rather than holding every run in the host', () => {
    const main = fs.readFileSync(path.join(REPO, 'main', 'main.mts'), 'utf8');
    expect(main).toMatch(/supervisor\.hostRuns = runHostWorksOn\(\);/);
    expect(main).not.toMatch(/supervisor\.hostRuns = true/);
  });
});

let dir = null;
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); dir = null; });

describe.runIf(process.platform === 'win32')('on this Windows computer', () => {
  it('the host cannot listen at its socket path', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-run-host-'));
    let said = null;
    const heard = new Promise((resolve) => {
      const host = serveRuns({ sockPath: path.join(dir, 'r.sock'), spoolDir: path.join(dir, 'spool'), log: (m) => { said = m; resolve(); } });
      host.started.then(resolve);
      setTimeout(resolve, 3_000).unref?.();
    });
    await heard;
    expect(said).toMatch(/EACCES/);
  });
});
