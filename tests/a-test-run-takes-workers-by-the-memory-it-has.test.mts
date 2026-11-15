// A TEST RUN TAKES WORKERS BY THE MEMORY IT HAS, NOT BY ITS CORES (w-8c1e33ee94).
//
// What broke: on 2026-11-04 a 16 GB Mac was barely usable, with 15 GB of swap
// in use and four vitest workers at about 2 GB each. Vitest starts one worker
// per core less one, so on a ten-core Mac the push hook ran nine at once, and
// every test file that opens a test database peaked at 770-1,100 MB alone
// (measured on the whole suite, one file per worker, 2026-11-04; the median
// file peaked at 90 MB). Nine workers could ask for nine gigabytes.
//
// The config now gives a run one worker per 4 GB of memory, never more than
// the cores less one and never fewer than one, so every run is capped
// however it was started (the push hook, test:changed, a bare `npx vitest`).
import { describe, expect, it } from 'vitest';
import os from 'node:os';
import config, { workersFor } from '../vitest.config.mjs';

const GB = 1024 ** 3;

describe('how many workers a test run takes', () => {
  it('takes four on a 16 GB Mac with ten cores, not nine', () => {
    expect(workersFor({ memBytes: 16 * GB, cpus: 10 })).toBe(4);
  });

  it('takes one per 4 GB, rounding down', () => {
    expect(workersFor({ memBytes: 8 * GB, cpus: 10 })).toBe(2);
    expect(workersFor({ memBytes: 12 * GB, cpus: 10 })).toBe(3);
    expect(workersFor({ memBytes: 15.9 * GB, cpus: 10 })).toBe(3);
    expect(workersFor({ memBytes: 24 * GB, cpus: 10 })).toBe(6);
  });

  it('never takes more than the cores less one, however much memory there is', () => {
    expect(workersFor({ memBytes: 64 * GB, cpus: 10 })).toBe(9);
    expect(workersFor({ memBytes: 128 * GB, cpus: 4 })).toBe(3);
  });

  it('always takes at least one', () => {
    expect(workersFor({ memBytes: 2 * GB, cpus: 10 })).toBe(1);
    expect(workersFor({ memBytes: 16 * GB, cpus: 1 })).toBe(1);
    expect(workersFor({ memBytes: 0, cpus: 0 })).toBe(1);
  });

  it('is what the config gives the run on this machine', () => {
    const cpus = os.availableParallelism?.() ?? os.cpus().length;
    expect(config.test.maxWorkers).toBe(workersFor({ memBytes: os.totalmem(), cpus }));
    // A minimum above a lower maximum is an error in vitest, so the floor stays at one.
    expect(config.test.minWorkers).toBe(1);
  });
});
