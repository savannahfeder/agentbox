// THE FREEZE WATCHER KEPT AN IDLE APP AWAKE.
//
// main/freeze-recorder.mts watched the main thread from a thread of its own
// that looked every 50 ms, while V8 sampled the main thread every 10 ms. In an
// otherwise idle Node process, measured over 120 s on Linux: the recorder cost
// 0.57% of a core and 134 wake-ups a second on the threads that lived through
// the window, plus the profiler's own thread at about 100 a second; the 50 ms
// look alone was 0.17% of that. An idle Agentbox woke about 400 times a second.
//
// The beat already sees a hold end, because the first beat after one comes
// late, so it tells the watcher, and the watcher no longer looks. Sampling is
// every 25 ms: a half-second hold still gets 20 samples. Holds are still
// written, and a sleeping Mac still is not (the two freeze tests beside this).

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

describe('the freeze recorder in an idle app', () => {
  // Wake-ups are read from /proc, so this runs where there is one (the Linux CI job).
  it.runIf(process.platform === 'linux')('lets its watcher sleep and samples at most 40 times a second', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-idle-'));
    const script = path.join(dir, 'idle.mjs');
    fs.writeFileSync(script, `
      import fs from 'node:fs';
      import { startFreezeRecorder } from ${JSON.stringify(path.join(ROOT, 'main', 'freeze-recorder.mts'))};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const threads = () => Object.fromEntries(fs.readdirSync('/proc/self/task').map((t) => {
        const status = fs.readFileSync('/proc/self/task/' + t + '/status', 'utf8');
        const woke = [...status.matchAll(/ctxt_switches:\\s+(\\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);
        return [t, { name: fs.readFileSync('/proc/self/task/' + t + '/comm', 'utf8').trim(), woke }];
      }));
      const before = threads();
      const keep = setInterval(() => {}, 60_000);
      const rec = startFreezeRecorder({ dir: ${JSON.stringify(path.join(dir, 'log'))}, appDir: ${JSON.stringify(dir)} });
      await wait(1500);
      const a = threads();
      const t0 = Date.now();
      await wait(3000);
      const b = threads();
      const secs = (Date.now() - t0) / 1000;
      const rate = (t) => (b[t].woke - a[t].woke) / secs;
      const ours = Object.keys(b).filter((t) => !before[t] && a[t]);
      const watcher = ours.filter((t) => b[t].name !== 'v8:ProfEvntProc').map(rate);
      const sampler = ours.filter((t) => b[t].name === 'v8:ProfEvntProc').map(rate);
      console.log(JSON.stringify({ watcher, sampler }));
      clearInterval(keep);
      rec.stop();
      process.exit(0);
    `);
    const { stdout } = await promisify(execFile)(process.execPath, [...stripTypesFlags(), script], { timeout: 30_000 });
    const { watcher, sampler } = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(watcher.length).toBeGreaterThan(0);
    for (const r of watcher) expect(r).toBeLessThan(3);
    expect(sampler.length).toBe(1);
    expect(sampler[0]).toBeLessThan(60);
  }, 40_000);
});
