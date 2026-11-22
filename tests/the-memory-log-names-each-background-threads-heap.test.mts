// THE MEMORY LOG NAMES EACH BACKGROUND THREAD'S HEAP.
//
// What broke (2026-11-19): since the 2026-11-16 build the app's main process
// grew about 110 MB an hour while the Mac was awake, idle or not: 0.8 GB after
// the 01:06 UTC restart, 2.9 GB nineteen hours later. The log's heap line read
// flat (heapMb 350-460) because it is the main thread's heap alone. `vmmap`
// on the live process put the growth outside it: V8's pages went from 818 to
// 855 MB in ten minutes while the main heap stayed put, and the thread count
// stayed at 51. The rest of V8 is the app's worker threads (the Codex reader,
// the folder lanes, the git thread, the freeze watcher), and nothing wrote
// their heaps down, so the growing one could not be named.
//
// Now each worker the app starts is noted by name, and the 15-minute line
// carries `threads`: each one's heap in MB, plus the main thread's
// `arrayBuffersMb`.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { noteThread, threadHeaps } from '../main/thread-heaps.mts';
import { startMemoryRecorder } from '../main/memory-recorder.mts';

const MB = 1048576;
class FakeThread extends EventEmitter {
  usedMb: number;
  answer: 'yes' | 'never' | 'throw';
  constructor(usedMb: number, answer: 'yes' | 'never' | 'throw' = 'yes') { super(); this.usedMb = usedMb; this.answer = answer; }
  getHeapStatistics() {
    if (this.answer === 'throw') return Promise.reject(new Error('Worker is not running'));
    if (this.answer === 'never') return new Promise<never>(() => {});
    return Promise.resolve({ used_heap_size: this.usedMb * MB, total_heap_size: (this.usedMb + 8) * MB });
  }
}

const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });
const note = (name: string, t: FakeThread | object) => { const forget = noteThread(name, t as never); cleanups.push(forget); return forget; };

describe('the heaps of the app\'s background threads', () => {
  it('reads each noted thread\'s heap in MB, by its name', async () => {
    note('codex reader', new FakeThread(612));
    note('git', new FakeThread(40));
    const heaps = await threadHeaps();
    expect(heaps['codex reader']).toBe(612);
    expect(heaps.git).toBe(40);
  });

  it('drops a thread once it has exited', async () => {
    const t = new FakeThread(90);
    note('folders', t);
    t.emit('exit', 0);
    expect(await threadHeaps()).not.toHaveProperty('folders');
  });

  it('gives two threads of one name a number each, rather than one hiding the other', async () => {
    note('folders', new FakeThread(30));
    note('folders', new FakeThread(700));
    const heaps = await threadHeaps();
    expect(Object.values(heaps).sort((a, b) => a - b)).toEqual([30, 700]);
    expect(Object.keys(heaps).every((k) => k.startsWith('folders'))).toBe(true);
  });

  it('leaves out a thread that cannot answer, and does not wait on one that never does', async () => {
    note('stuck', new FakeThread(1, 'never'));
    note('gone', new FakeThread(1, 'throw'));
    note('old runtime', {});
    note('fine', new FakeThread(12));
    const t0 = Date.now();
    const heaps = await threadHeaps({ deadlineMs: 100 });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(heaps).toEqual({ fine: 12 });
  });

  it('writes the threads and the main thread\'s array buffers on the 15-minute line', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thread-heaps-'));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const r = startMemoryRecorder({ dir, everyMs: 10_000, askMs: 10_000, threads: async () => ({ 'codex reader': 612 }) });
    cleanups.push(() => r.stop());
    const end = Date.now() + 5000;
    let line: Record<string, unknown> | undefined;
    while (!line && Date.now() < end) {
      const f = fs.readdirSync(dir).find((n) => n.startsWith('memory-'));
      if (f) line = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').split('\n')[0]);
      else await new Promise((res) => setTimeout(res, 20));
    }
    expect(line?.threads).toEqual({ 'codex reader': 612 });
    expect(typeof line?.arrayBuffersMb).toBe('number');
    expect(typeof line?.heapMb).toBe('number');
  });
});
