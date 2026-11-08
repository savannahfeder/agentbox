// THE APP WRITES DOWN HOW MUCH MEMORY IT USES, AND CAN BE ASKED FOR A SNAPSHOT.
//
// What broke (w-b9ffc220aa, 2026-11-06): measured on the owner's Mac, the
// app's main process held 690 MB an hour after a start and 1.15 GB after 20
// hours, the window 540 MB and then 880 MB, with no agent's memory counted.
// Nothing in the app recorded that, and a copy on a cloned store held 27 MB, so
// the cause could only be found inside the real app after real use, and the
// app had no way to give up a heap snapshot without a debugger attached.
//
// Now a line goes to memory-log/memory-<day>.jsonl every 15 minutes with the
// main heap and every process's size, and a file named take-heap-snapshot in
// that folder makes the app write a snapshot of its main process and its
// window on the next minute, keeping only the newest two.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMemoryRecorder, SNAPSHOT_ASK } from '../main/memory-recorder.mts';

const dirs = [];
const stops = [];
const tempDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-')); dirs.push(d); return d; };
afterEach(() => {
  while (stops.length) stops.pop()();
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});
const until = async (check, ms = 5000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('waited and it never happened');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const lines = (dir) => fs.readdirSync(dir).filter((f) => /^memory-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
  .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const start = (opts) => { const r = startMemoryRecorder(opts); stops.push(() => r.stop()); return r; };

describe('the memory recorder', () => {
  it('writes the main heap and every process the app runs, on its clock', async () => {
    const dir = tempDir();
    start({ dir, everyMs: 30, askMs: 10_000, processes: () => [{ type: 'Browser', mb: 700 }, { type: 'Tab', mb: 540 }, { type: 'GPU', mb: 370 }] });
    await until(() => lines(dir).length >= 2);
    const [first] = lines(dir);
    expect(first.heapMb).toBeGreaterThan(0);
    expect(first.processes).toEqual([{ type: 'Browser', mb: 700 }, { type: 'Tab', mb: 540 }, { type: 'GPU', mb: 370 }]);
    expect(typeof first.at).toBe('string');
    expect(first.upMin).toBeGreaterThanOrEqual(0);
  });

  it('writes no snapshot unless it is asked for one', async () => {
    const dir = tempDir();
    let asked = 0;
    start({ dir, everyMs: 10_000, askMs: 20, windowSnapshot: async () => { asked++; } });
    await new Promise((r) => setTimeout(r, 200));
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.heapsnapshot'))).toEqual([]);
    expect(asked).toBe(0);
  });

  it('writes the main and window snapshots once when the ask file appears, and takes the ask away', async () => {
    const dir = tempDir();
    const windowFiles = [];
    start({ dir, everyMs: 10_000, askMs: 20, windowSnapshot: async (file) => { windowFiles.push(file); fs.writeFileSync(file, '{}'); } });
    fs.writeFileSync(path.join(dir, SNAPSHOT_ASK), '');
    await until(() => windowFiles.length === 1 && fs.readdirSync(dir).some((f) => /^main-.*\.heapsnapshot$/.test(f)), 20_000);
    expect(fs.existsSync(path.join(dir, SNAPSHOT_ASK))).toBe(false);
    expect(path.basename(windowFiles[0])).toMatch(/^window-.*\.heapsnapshot$/);
    await new Promise((r) => setTimeout(r, 150));
    expect(windowFiles.length).toBe(1);
    expect(lines(dir).some((l) => Array.isArray(l.snapshots) && l.snapshots.length === 2)).toBe(true);
  }, 30_000);

  it('keeps only the newest two snapshots of each kind', async () => {
    const dir = tempDir();
    for (const stamp of ['2026-11-01T00-00-00', '2026-11-02T00-00-00', '2026-11-03T00-00-00']) {
      fs.writeFileSync(path.join(dir, `main-${stamp}.heapsnapshot`), '{}');
      fs.writeFileSync(path.join(dir, `window-${stamp}.heapsnapshot`), '{}');
    }
    start({ dir, everyMs: 10_000, askMs: 20, windowSnapshot: async (file) => fs.writeFileSync(file, '{}') });
    fs.writeFileSync(path.join(dir, SNAPSHOT_ASK), '');
    await until(() => !fs.existsSync(path.join(dir, SNAPSHOT_ASK)) && fs.readdirSync(dir).filter((f) => f.startsWith('window-')).length === 2
      && !fs.existsSync(path.join(dir, 'window-2026-11-02T00-00-00.heapsnapshot')), 20_000);
    const kept = fs.readdirSync(dir).filter((f) => f.endsWith('.heapsnapshot')).sort();
    expect(kept.filter((f) => f.startsWith('main-'))).toHaveLength(2);
    expect(kept.filter((f) => f.startsWith('window-'))).toHaveLength(2);
    expect(kept).toContain('main-2026-11-03T00-00-00.heapsnapshot');
    expect(kept).not.toContain('main-2026-11-02T00-00-00.heapsnapshot');
  }, 30_000);

  it('keeps recording when the window cannot give a snapshot', async () => {
    const dir = tempDir();
    start({ dir, everyMs: 30, askMs: 20, windowSnapshot: async () => { throw new Error('no window'); } });
    fs.writeFileSync(path.join(dir, SNAPSHOT_ASK), '');
    await until(() => !fs.existsSync(path.join(dir, SNAPSHOT_ASK)) && fs.readdirSync(dir).some((f) => f.startsWith('main-')), 20_000);
    const before = lines(dir).length;
    await until(() => lines(dir).length > before + 1);
  }, 30_000);
});
