// A SNAPSHOT ASK CAN WAIT UNTIL THE APP HAS RUN LONG.
//
// What broke (2026-11-21): main's footprint climbs about 110 MB an hour
// (0.65 to 3.1 GB over 22 hours on 2026-11-20, from the minute log) while its
// JS heap stays flat, so the cause is only visible by comparing an early and a
// late snapshot. The app is restarted around noon, just when the daily memory
// check runs, so a plain ask only ever caught a main a few minutes old.
//
// Now the ask file can hold {"afterUpMin": N}: it waits, across restarts, for a
// launch that has been up N minutes. An empty or unreadable ask is taken at once.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMemoryRecorder, SNAPSHOT_ASK } from '../main/memory-recorder.mts';

const dirs: string[] = [];
const stops: (() => void)[] = [];
const tempDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-ask-')); dirs.push(d); return d; };
afterEach(() => {
  while (stops.length) stops.pop()!();
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});
const until = async (ok: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mainSnapshots = (dir: string) => fs.readdirSync(dir).filter((f) => /^main-.*\.heapsnapshot$/.test(f));

function recorder(ask: string) {
  const dir = tempDir();
  let at = 1_000_000;
  const r = startMemoryRecorder({ dir, everyMs: 60_000, askMs: 20, now: () => at, windowSnapshot: async (file) => fs.writeFileSync(file, '{}') });
  stops.push(() => r.stop());
  fs.writeFileSync(path.join(dir, SNAPSHOT_ASK), ask);
  return { dir, upFor: (min: number) => { at = 1_000_000 + min * 60_000; } };
}

describe('a snapshot ask that names how long the app must have run', () => {
  it('is left waiting while the app has run less than that', async () => {
    const { dir, upFor } = recorder('{"afterUpMin": 600}');
    upFor(599);
    await sleep(200);
    expect(mainSnapshots(dir)).toEqual([]);
    expect(fs.existsSync(path.join(dir, SNAPSHOT_ASK))).toBe(true);
  });

  it('is taken once the app has run that long, and taken away', async () => {
    const { dir, upFor } = recorder('{"afterUpMin": 600}');
    await sleep(100);
    expect(mainSnapshots(dir)).toEqual([]);
    upFor(600);
    await until(() => mainSnapshots(dir).length === 1 && !fs.existsSync(path.join(dir, SNAPSHOT_ASK)), 20_000);
  });

  it('is taken at once when the ask is empty or cannot be read', async () => {
    for (const ask of ['', 'not json', '{"afterUpMin": "soon"}']) {
      const { dir } = recorder(ask);
      await until(() => mainSnapshots(dir).length === 1 && !fs.existsSync(path.join(dir, SNAPSHOT_ASK)), 20_000);
    }
  });
});
