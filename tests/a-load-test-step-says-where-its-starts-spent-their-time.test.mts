// On real AWS, 100 runs at once had a median start of 37 s and 200 had 9 s,
// and the step's tally could not say whether the time went on the Mac packing
// and sending or on the cloud's machine. Each step now splits a start in two:
// until the cloud took it, then until the command began. On the 200 step that
// was 7.9 s and 0.7 s (median), so the wait was on the sending side.
import { describe, it, expect } from 'vitest';
import { tallyStep } from '../scripts/cloud-load-test.mjs';

const run = (begunAt: number, sentAt: number | null, ranFrom: number | null) => ({
  begunAt, sentAt, ranFrom, ranTo: ranFrom == null ? null : ranFrom + 1000, endedAt: (ranFrom ?? begunAt) + 2000,
  code: ranFrom == null ? 1 : 0, starts: ranFrom == null ? 0 : 1, ends: ranFrom == null ? 0 : 1, startMs: ranFrom == null ? null : ranFrom - begunAt, attempts: 1,
});

describe('a load-test step says where its starts spent their time', () => {
  it('splits each start into until the cloud took it and until the command began', () => {
    const t = tallyStep(3, [run(0, 2000, 2500), run(0, 8000, 9000), run(0, 30_000, 35_000)]);
    expect(t.toSent).toEqual({ medianS: 8, slowestS: 30 });
    expect(t.sentToBegan).toEqual({ medianS: 1, slowestS: 5 });
  });

  it('leaves a run the cloud never took out of both halves', () => {
    const t = tallyStep(2, [run(0, 4000, 4500), run(0, null, null)]);
    expect(t.toSent).toEqual({ medianS: 4, slowestS: 4 });
    expect(t.sentToBegan).toEqual({ medianS: 0.5, slowestS: 0.5 });
  });

  it('says nothing for a half no run reached', () => {
    const t = tallyStep(1, [run(0, 3000, null)]);
    expect(t.toSent).toEqual({ medianS: 3, slowestS: 3 });
    expect(t.sentToBegan).toBeNull();
  });
});
