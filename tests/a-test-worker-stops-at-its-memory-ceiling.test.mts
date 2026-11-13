// A TEST WORKER STOPS AT ITS MEMORY CEILING, NOT AT 4 GB.
//
// What broke: on 2026-11-13 a 16 GB Mac had to be restarted twice. Activity
// Monitor showed five vitest workers at 3.6, 3.9, 4.1, 4.2 and 4.3 GB, with
// 15.9 GB of swap in use. Each sat at V8's default heap limit, which on a
// 16 GB Mac is about 4 GB: a worker that keeps allocating is not stopped
// until then, and near the limit it spends its time in garbage collection
// rather than dying. Measured here: under a 200 MB ceiling a test that
// allocates forever ends with "JavaScript heap out of memory" in 3 seconds.
//
// The biggest real test files peaked at 770 to 1,100 MB on that Mac
// (2026-11-04) and at 700 MB on a cloud machine (2026-11-13), so the ceiling
// sits above them.
import { describe, expect, it } from 'vitest';
import v8 from 'node:v8';
import { Worker } from 'node:worker_threads';
import config, { WORKER_HEAP_MB, workersFor } from '../vitest.config.mjs';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

describe('a test worker\'s memory ceiling', () => {
  it('is what this very worker runs under', () => {
    // V8 adds its young generation, tens of MB, on top of the old-space size.
    expect(v8.getHeapStatistics().heap_size_limit).toBeLessThanOrEqual((WORKER_HEAP_MB + 128) * MB);
  });

  it('is set in the config every run reads, the push hook\'s included', () => {
    expect(config.test?.env?.NODE_OPTIONS).toContain(`--max-old-space-size=${WORKER_HEAP_MB}`);
  });

  // Set as a start flag instead, it reached process.execArgv, and every worker
  // thread the app starts with those flags was refused; the app then did that
  // work on the main thread, and two tests about exactly that went red.
  it('leaves the app\'s worker threads able to start', async () => {
    const thread = new Worker('require("node:worker_threads").parentPort.postMessage("up")', { eval: true, execArgv: [...process.execArgv] });
    const said = await new Promise((resolve, reject) => { thread.once('message', resolve); thread.once('error', reject); });
    await thread.terminate();
    expect(said).toBe('up');
  });

  it('leaves a 16 GB Mac at least half its memory with every worker full', () => {
    expect(workersFor({ memBytes: 16 * GB, cpus: 10 }) * WORKER_HEAP_MB * MB).toBeLessThanOrEqual(8 * GB);
  });

  it('is well above the biggest test file measured, so no real test is cut off', () => {
    expect(WORKER_HEAP_MB).toBeGreaterThanOrEqual(1400);
  });
});
