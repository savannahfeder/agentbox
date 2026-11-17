// A MAC ASLEEP IS NOT A FREEZE.
//
// What broke (2026-11-17): on battery with the lid shut, the freeze log wrote
// nine "freezes" of 97 s to 1,018 s, 66 minutes in all, each starting seconds
// after the Mac went to sleep and ending to the second when it woke (11:13:58
// + 966.5 s = the 11:30:04 wake, by `pmset -g log`). They had 12 to 24 samples
// each, where a real freeze at the recorder's 10 ms rate has about one per
// 10 ms. The day's top "cause" was main/artifact-path.mts, which did nothing
// wrong, and the freeze watch would have filed a thread to fix it. 11-14 and
// 11-15 had the same 16-minute holds. Thin sampling cannot be the test: the
// Mac starved on the night of 11-12 sampled just as thinly. So the recorder
// is told when the Mac sleeps and wakes, and a hold that spans a sleep is not
// written.
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

describe('the freeze recorder and a Mac that sleeps', () => {
  it('writes the holds while awake and none that span a sleep, whichever comes first on waking', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asleep-'));
    const script = path.join(dir, 'asleep.mjs');
    // A busy loop stands in for the suspended thread: it is what the recorder
    // would write if it did not know the Mac was asleep.
    fs.writeFileSync(script, `
      import { startFreezeRecorder } from ${JSON.stringify(path.join(ROOT, 'main', 'freeze-recorder.mts'))};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      function holdsBeforeSleep() { const end = Date.now() + 900; let x = 0; while (Date.now() < end) { for (let i = 0; i < 1e5; i += 1) x = (x + i) | 0; } return x; }
      function sleepsAndTheWakeComesFirst() { const end = Date.now() + 900; let x = 0; while (Date.now() < end) { for (let i = 0; i < 1e5; i += 1) x = (x + i) | 0; } return x; }
      function sleepsAndTheBeatComesFirst() { const end = Date.now() + 900; let x = 0; while (Date.now() < end) { for (let i = 0; i < 1e5; i += 1) x = (x + i) | 0; } return x; }
      function holdsAfterWaking() { const end = Date.now() + 900; let x = 0; while (Date.now() < end) { for (let i = 0; i < 1e5; i += 1) x = (x + i) | 0; } return x; }
      const rec = startFreezeRecorder({ dir: ${JSON.stringify(path.join(dir, 'log'))}, appDir: ${JSON.stringify(dir)} });
      await wait(800);
      holdsBeforeSleep();
      await wait(700);
      rec.asleep();
      sleepsAndTheWakeComesFirst();
      rec.awake();
      await wait(700);
      rec.asleep();
      sleepsAndTheBeatComesFirst();
      await wait(400);
      rec.awake();
      await wait(700);
      holdsAfterWaking();
      await wait(1500);
      rec.stop();
    `);
    await promisify(execFile)(process.execPath, [...stripTypesFlags(), script], { timeout: 30_000 });
    const logDir = path.join(dir, 'log');
    const lines = fs.readdirSync(logDir)
      .flatMap((f) => fs.readFileSync(path.join(logDir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    expect(lines.map((l) => l.where)).toEqual([
      'holdsBeforeSleep asleep.mjs:4',
      'holdsAfterWaking asleep.mjs:7',
    ]);
  }, 40_000);
});
