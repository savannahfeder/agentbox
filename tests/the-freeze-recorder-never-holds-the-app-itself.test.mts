// THE FREEZE RECORDER WAS MOST OF THE FREEZES IT RECORDED.
//
// On 2026-11-22 the log had 2,691 holds, and 2,419 of them came in unbroken
// runs, up to 120 holds in a row, each 500-900 ms, each with 1 to 5 samples
// where a 25 ms profile takes 20 or more. The top cause it named was "emit"
// and "onStreamRead", the first function entered after native code, which is
// where an inspector interrupt lands. The watcher stopped and restarted its
// CPU profile after every hold, and Profiler.start walks the whole heap on
// the main thread: measured on Linux, 625 ms at a 900 MB heap and 240 ms at
// 50 MB with many functions. That restart was the next hold, which caused
// the next restart, for as long as the heap stayed big. With a 765 MB heap
// the recorder alone held the thread about 0.9 s out of every second.
//
// One profile now stays running and the next starts inside it, which costs
// nothing; this checks the thread is never held but by the hold we make.

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

describe('the freeze recorder on a big heap', () => {
  it('holds the thread only where the app did, and still names the hold', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-big-'));
    const script = path.join(dir, 'big.mjs');
    fs.writeFileSync(script, `
      import fs from 'node:fs';
      import { startFreezeRecorder } from ${JSON.stringify(path.join(ROOT, 'main', 'freeze-recorder.mts'))};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const keep = [];
      for (let i = 0; i < 800000; i += 1) keep.push({ id: 'w-' + i, t: 'x'.repeat(100), n: i, a: [i, i + 1] });
      function holdsTheThread(ms) { const end = Date.now() + ms; let x = 0; while (Date.now() < end) x = (x + 1) | 0; return x; }
      const rec = startFreezeRecorder({ dir: ${JSON.stringify(path.join(dir, 'log'))}, appDir: ${JSON.stringify(dir)}, thresholdMs: 300 });
      // The first profile's start walks the heap once; what comes after it is measured.
      await wait(3000);
      const late = [];
      let last = performance.now();
      const beat = setInterval(() => { const now = performance.now(); late.push(Math.round(now - last - 20)); last = now; }, 20);
      await wait(500);
      holdsTheThread(800);
      await wait(4000);
      holdsTheThread(800);
      await wait(4000);
      clearInterval(beat);
      rec.stop();
      console.log(JSON.stringify({ heapMb: Math.round(process.memoryUsage().heapUsed / 1048576), late: late.filter((ms) => ms > 150) }));
      process.exit(0);
    `);
    const { stdout } = await promisify(execFile)(process.execPath, [...stripTypesFlags(), script], { timeout: 60_000 });
    const { heapMb, late } = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(heapMb).toBeGreaterThan(200);
    // The two holds made here, and nothing else.
    expect(late.length).toBe(2);
    for (const ms of late) expect(ms).toBeLessThan(1000);
    const lines = fs.readdirSync(path.join(dir, 'log'))
      .flatMap((f) => fs.readFileSync(path.join(dir, 'log', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    expect(lines.map((l) => l.where)).toEqual(['holdsTheThread big.mjs:7', 'holdsTheThread big.mjs:7']);
    // GitHub's macOS runner, under the whole suite, sampled each 800 ms hold 6 to 10
    // times in seven runs out of seven: that counts the runner, not the recorder.
    if (process.platform === 'linux') for (const l of lines) expect(l.samples).toBeGreaterThan(15);
  }, 90_000);
});
