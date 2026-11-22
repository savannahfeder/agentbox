// THE STALL WATCH WOKE THE IDLE APP FIFTY TIMES A SECOND.
//
// main/stall-watch.mts measured the main thread's event-loop delay with
// `monitorEventLoopDelay({ resolution: 20 })`, which is a timer on the main
// thread every 20 ms, for as long as the app is open. Its reading is a
// minute's longest stall: written into the memory log's minute line and,
// through `longestNow`, compared with a 500 ms limit before another cloud
// start goes out. Measured on Linux in an idle Node process: the main thread
// woke 50 times a second for it. At 100 ms it wakes 10 times, and a hold of
// 600 ms still reads as at least 500.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { stripTypesFlags } from '../main/strip-types.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let dir: string;
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

async function run(body: string) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-grain-'));
  const script = path.join(dir, 'run.mjs');
  fs.writeFileSync(script, `
    import fs from 'node:fs';
    import { stallWatch } from ${JSON.stringify(path.join(ROOT, 'main', 'stall-watch.mts'))};
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    ${body}
  `);
  const { stdout } = await promisify(execFile)(process.execPath, [...stripTypesFlags(), script], { timeout: 30_000 });
  return JSON.parse(stdout.trim().split('\n').pop()!);
}

describe('the stall watch', () => {
  it('still reads a 600 ms hold as a stall past the 500 ms limit', async () => {
    const got = await run(`
      const watch = stallWatch();
      await wait(300);
      const end = Date.now() + 600; let x = 0; while (Date.now() < end) x = (x + 1) | 0;
      await wait(300);
      console.log(JSON.stringify({ longest: watch.longestNow(), taken: watch.take().longestStallMs }));
      process.exit(0);
    `);
    expect(got.longest).toBeGreaterThanOrEqual(500);
    expect(got.taken).toBeGreaterThanOrEqual(500);
  }, 40_000);

  // Wake-ups are read from /proc, so this runs where there is one (the Linux CI job).
  it.runIf(process.platform === 'linux')('wakes an idle main thread at most a dozen times a second', async () => {
    const got = await run(`
      const woke = () => [...fs.readFileSync('/proc/self/task/' + process.pid + '/status', 'utf8').matchAll(/ctxt_switches:\\s+(\\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);
      const keep = setInterval(() => {}, 60_000);
      stallWatch();
      await wait(500);
      const a = woke(); const t0 = Date.now();
      await wait(3000);
      const rate = (woke() - a) / ((Date.now() - t0) / 1000);
      clearInterval(keep);
      console.log(JSON.stringify({ rate }));
      process.exit(0);
    `);
    expect(got.rate).toBeLessThan(12);
  }, 40_000);
});
