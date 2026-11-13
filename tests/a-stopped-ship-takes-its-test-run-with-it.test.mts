// A STOPPED SHIP TAKES ITS TEST RUN WITH IT.
//
// What broke: on 2026-11-13 the Mac had to be restarted twice in one night.
// Activity Monitor showed five `node` processes at 3.6 to 4.3 GB each, with
// 15.9 GB of swap in use, and they stayed after Agentbox was closed. The
// memory log had them as untagged "node (vitest N)" workers: the push hook's
// test run under a ship. A ship past its deadline was stopped with a SIGTERM to
// `node scripts/ship.mjs` alone, so `git push`, the hook, vitest and its
// workers carried on as orphans. The queue then counted the ship as over and
// started the next one, a second test run on top of the first. Quitting the app
// stopped neither.
//
// Measured here with a stand-in ship that starts a long-lived program the way
// the hook starts vitest, then checking whether that program is still alive.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runScript, stopShips } from '../main/ship-queue.mts';
import { waitFor } from './waiting.mts';

let tmp: string;
const outside: ChildProcess[] = [];

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stopped-ship-')); });
afterEach(() => {
  for (const p of outside.splice(0)) p.kill('SIGKILL');
  for (const pid of startedBy()) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
  fs.rmSync(tmp, { recursive: true, force: true });
});

// A zombie is dead; it only waits for an init that reaps (a container's may not).
const alive = (pid: number) => {
  try { return !execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim().startsWith('Z'); } catch { return false; }
};
const pidFile = () => path.join(tmp, 'pids');
const startedBy = () => fs.existsSync(pidFile()) ? fs.readFileSync(pidFile(), 'utf8').split('\n').filter(Boolean).map(Number) : [];

/** A ship script that starts a program which outlives it unless something stops it. */
function shipThat({ then, stubborn = false }: { then: 'hangs' | 'exits'; stubborn?: boolean }) {
  const testRun = path.join(tmp, 'test-run.mjs');
  fs.writeFileSync(testRun, [
    `import fs from 'node:fs';`,
    stubborn ? `process.on('SIGTERM', () => {});` : '',
    `fs.appendFileSync(${JSON.stringify(pidFile())}, process.pid + '\\n');`,
    `setInterval(() => {}, 1000);`,
  ].join('\n'));
  const ship = path.join(tmp, 'ship.mjs');
  fs.writeFileSync(ship, [
    `import { spawn } from 'node:child_process';`,
    // stdio inherited, as the hook's vitest inherits git's: it holds the ship's pipes.
    `spawn(process.execPath, [${JSON.stringify(testRun)}], { stdio: 'inherit' });`,
    `console.log('ship: pushing');`,
    then === 'hangs' ? `setInterval(() => {}, 1000);` : `setTimeout(() => process.exit(0), 300);`,
  ].join('\n'));
  return ship;
}

const started = () => waitFor('the stand-in test run to start', () => startedBy().length > 0);

describe.skipIf(process.platform === 'win32')('a ship and the programs under it', () => {
  it('past its deadline, every program the ship started is stopped too', async () => {
    const ran = runScript(shipThat({ then: 'hangs' }), tmp, { timeout: 1500 });
    await started();
    const { code, out } = await ran;
    expect(code).not.toBe(0);
    expect(out).toMatch(/ship: stopped after 1 minute\.$/);
    await waitFor('the test run to be stopped', () => startedBy().every((pid) => !alive(pid)));
  });

  it('when the app quits, a ship still running is stopped with everything under it', async () => {
    const ran = runScript(shipThat({ then: 'hangs' }), tmp, { timeout: 60_000 });
    await started();
    stopShips();
    const { code } = await ran;
    expect(code).not.toBe(0);
    await waitFor('the test run to be stopped', () => startedBy().every((pid) => !alive(pid)));
  });

  it('a ship that finished leaves nothing running, and does not wait on what it left', async () => {
    const began = Date.now();
    const { code } = await runScript(shipThat({ then: 'exits' }), tmp, { timeout: 60_000 });
    expect(code).toBe(0);
    expect(Date.now() - began).toBeLessThan(20_000);
    await waitFor('the leftover to be stopped', () => startedBy().every((pid) => !alive(pid)));
  });

  it('a program that ignores the polite stop is stopped anyway', async () => {
    const { code } = await runScript(shipThat({ then: 'hangs', stubborn: true }), tmp, { timeout: 1500, graceMs: 500 });
    expect(code).not.toBe(0);
    await waitFor('the stubborn test run to be stopped', () => startedBy().length > 0 && startedBy().every((pid) => !alive(pid)));
  });

  it('a program the ship did not start is left alone', async () => {
    const other = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    outside.push(other);
    const ran = runScript(shipThat({ then: 'hangs' }), tmp, { timeout: 60_000 });
    await started();
    stopShips();
    await ran;
    await waitFor('the test run to be stopped', () => startedBy().every((pid) => !alive(pid)));
    expect(alive(other.pid!)).toBe(true);
  });
});
