// THE GATE LOG READING ADDS UP.
//
// WHY THIS IS TESTED AT ALL. scripts/read-memory-gate-log.mjs is the thing that
// answers two open questions on that row, and the answers are numbers somebody
// will change `autoSlots` on. A reporting script that quietly adds the wrong
// waits together would make the next decision worse than taste, because it
// would look like evidence.
//
// THE TWO MISTAKES IT MUST NOT MAKE:
//   - counting a wait that happened while the Mac's pressure was `tight` as
//     evidence about the slot count. Under `tight` nothing heavy starts
//     whatever the count is, so that waiting is about the Mac.
//   - counting a light command's wait at all. Light needs no slot; its waiting
//     is `lightLane` filling up, which is a different number.
//
// And for the other question, that a program record's `c` runs (light learned
// only inside a chain) are told apart from its `l` runs (measured on its own),
// since the whole point of writing `c` down is to count it.

import { describe, it, expect } from 'vitest';
import { summariseGrants, summariseProvenance, likelyUserDirs } from '../scripts/read-memory-gate-log.mjs';

const grant = (over) => ({ t: 1_000, cls: 'heavy', waitMs: 0, ranMs: 1_000, peakMb: 500, pressure: 'normal', cmd: 'npm run x', ...over });

describe('the gate log reading adds up', () => {
  it('counts only the waiting that the slot count could have caused', () => {
    const s = summariseGrants([
      grant({ waitMs: 60_000, pressure: 'normal' }),
      grant({ waitMs: 30_000, pressure: 'normal', cls: 'unknown' }),
      // Under tight, nothing heavy starts whatever the count is.
      grant({ waitMs: 600_000, pressure: 'tight' }),
      // A light command needs no slot: its wait belongs to the light lane.
      grant({ waitMs: 90_000, cls: 'light' }),
      // Waited for nothing at all; starts at once.
      grant({ waitMs: 0 }),
    ]);
    expect(s.slotPressedWaitMs).toBe(90_000);
    expect(s.waitedAtAllUnderNormal).toBe(2);
    expect(s.tightWaitMs).toBe(600_000);
    expect(s.waits.maxMs).toBe(60_000);
  });

  it('separates refusals by the pressure that earned them', () => {
    const s = summariseGrants([
      grant({ refused: true, waitMs: 1_200_000, pressure: 'normal', cmd: 'npm run test:changed' }),
      grant({ refused: true, waitMs: 1_200_000, pressure: 'tight' }),
      grant({ refused: true, waitMs: 1_200_000, pressure: 'critical' }),
    ]);
    expect(s.refusals.total).toBe(3);
    expect(s.refusals.underNormal).toBe(1);
    expect(s.refusals.underTight).toBe(2);
    expect(s.refusals.commands[0].cmd).toContain('test:changed');
  });

  it('never averages a shared reading in as one command\'s own', () => {
    // Two commands on one agent process are measured together, so `peakMb` is
    // null and `shared` is set. Counting those as 0 MB would drag the median
    // down and make the slots look emptier than they were.
    const s = summariseGrants([
      grant({ peakMb: 900 }),
      grant({ peakMb: 1_100 }),
      grant({ peakMb: null, shared: true }),
      grant({ peakMb: null }),
    ]);
    expect(s.peaks.heldSlotMedianMb).toBe(1_100);
    expect(s.peaks.sharedDropped).toBe(1);
    expect(s.peaks.neverMeasured).toBe(1);
  });

  it('survives a half-written line and an empty log', () => {
    expect(summariseGrants([]).lines).toBe(0);
    expect(summariseGrants([null, undefined, 'nonsense']).lines).toBe(3);
  });

  it('counts how much of a light verdict rests on chain-learned runs', () => {
    const s = summariseProvenance({
      v: 1,
      keys: [
        // Light today, and every run of it was measured on its own.
        ['grep needle', ['l', 'l', 'l']],
        // Light today, but only ever seen inside a chain.
        ['npm run', ['c', 'c', 'c', 'c']],
      ],
      programs: [
        // Lends light today and would keep doing so: five direct runs.
        ['grep', ['l', 'l', 'l', 'l', 'l']],
        // Lends light today purely on chain-learned runs. This is the case the
        // whole provenance change exists to count.
        ['npx', ['c', 'c', 'c', 'c', 'c', 'c']],
        // Too thin to lend anything either way.
        ['sed', ['l', 'l']],
      ],
    });
    expect(s.keys.lightToday).toBe(2);
    expect(s.keys.lightOnChainEvidenceOnly).toBe(1);
    expect(s.programs.lendsLightToday).toBe(2);
    expect(s.programs.wouldStopLending).toBe(1);
    expect(s.programs.names[0].name).toBe('npx');
    expect(s.letters.c).toBe(10);
    expect(s.letters.l).toBe(10);
    expect(s.carriesProvenance).toBe(true);
  });

  it('says plainly when a history carries no provenance yet', () => {
    // Every history written before this change, which is what it will meet the
    // first time it runs.
    const s = summariseProvenance({ v: 1, keys: [['npm run', ['l', 'l', 'l']]], programs: [['npm', ['l', 'l', 'l', 'l', 'l']]] });
    expect(s.carriesProvenance).toBe(false);
    expect(s.programs.wouldStopLending).toBe(0);
  });

  it('reads an unmeasured run as nothing at all, here too', () => {
    // w-b689e9fc0c. A `?` must not count towards light or against it, or this
    // script would report a cost that the gate would not actually pay.
    const s = summariseProvenance({ v: 1, keys: [['git branch', ['l', 'l', '?', 'l', 'l']]], programs: [] });
    expect(s.keys.lightToday).toBe(1);
    expect(s.letters['?']).toBe(1);
  });

  it('looks for the app files where the app actually keeps them', () => {
    const dirs = likelyUserDirs('/home/someone');
    expect(dirs.some((d) => d.includes('Application Support'))).toBe(true);
    expect(dirs.some((d) => d.includes('.local/share/agentbox') || d.includes('.config'))).toBe(true);
  });
});
