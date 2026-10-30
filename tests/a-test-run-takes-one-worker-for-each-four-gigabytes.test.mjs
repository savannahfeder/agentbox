// A TEST RUN TAKES ONE WORKER FOR EACH FOUR GIGABYTES, NOT ONE PER CORE.
//
// On 2026-10-30 a 16 GB Mac swapping 14 GB showed three vitest workers at 604,
// 522 and 496 MB beside the Agentbox window, from a ship's push. Vitest starts
// one worker per core but one, so the ten-core Mac every ship runs its tests on
// started nine: about 5 GB at those sizes, on top of the agents and the app.
// The count now follows the machine's memory as well as its cores, and a
// minimum of one keeps vitest from refusing a cap under its own default
// minimum (the pre-push hook's note on maxForks=1).
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import config, { testWorkers } from '../vitest.config.mjs';

const GB = 1024 ** 3;

describe('how many test workers a machine gets', () => {
  it('a 16 GB Mac with ten cores gets four, not nine', () => {
    expect(testWorkers({ cores: 10, bytes: 16 * GB })).toBe(4);
  });

  it('either side of the line: just under 8 GB gets one, 8 GB gets two', () => {
    expect(testWorkers({ cores: 10, bytes: 8 * GB - 1 })).toBe(1);
    expect(testWorkers({ cores: 10, bytes: 8 * GB })).toBe(2);
  });

  it('a big machine is still capped by its cores, one held back', () => {
    expect(testWorkers({ cores: 10, bytes: 64 * GB })).toBe(9);
    expect(testWorkers({ cores: 4, bytes: 16 * GB })).toBe(3);
  });

  it('a small one still runs its tests', () => {
    expect(testWorkers({ cores: 2, bytes: 8 * GB })).toBe(1);
    expect(testWorkers({ cores: 1, bytes: 2 * GB })).toBe(1);
  });

  it('the suite uses that count on this machine, with a minimum that cannot exceed it', () => {
    expect(config.test.maxWorkers).toBe(testWorkers({ cores: os.availableParallelism(), bytes: os.totalmem() }));
    expect(config.test.minWorkers).toBe(1);
  });
});
