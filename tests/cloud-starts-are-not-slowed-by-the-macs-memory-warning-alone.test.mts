// CLOUD STARTS ARE NOT SLOWED BY THE MAC'S MEMORY WARNING ALONE.
//
// How many cloud runs may be packing at once (main/cloud/start-budget.mts) was
// halved on every "tight" reading, and tight includes macOS's warn level on its
// own. A 16 GB Mac reports warn in bursts all day at 30-50% free: in the hour
// around a 2026-11-10 screenshot of a dozen threads stuck at "Not started", the
// reading was tight or critical in about 35 of 60 minutes with 36-47% free, so
// the limit rarely climbed past one or two. Starts on the Mac already set the
// warn and light swapping aside (main/start-hold.mts); the cloud limit now does
// too, at any number of local agents, since a packed run leaves no agent here.
// Free memory under the line, heavy swapping and critical still cut it, and a
// reading too old to trust says nothing.
import { describe, it, expect } from 'vitest';
import { StartBudget, cloudStartPressure } from '../main/cloud/start-budget.mts';

const now = 1_000_000;
const at = now - 5_000;

describe('the memory reading a cloud start is judged by', () => {
  it('the kernel warning with plenty free is calm', () => {
    expect(cloudStartPressure({ level: 2, freePct: 40, swapInMbps: 0, at }, now)).toBe('normal');
  });

  it('light swapping, alone or with the warning, is calm', () => {
    expect(cloudStartPressure({ level: 1, freePct: 40, swapInMbps: 8, at }, now)).toBe('normal');
    expect(cloudStartPressure({ level: 2, freePct: 40, swapInMbps: 15.9, at }, now)).toBe('normal');
  });

  it('free memory under the line is still tight, warning or not', () => {
    expect(cloudStartPressure({ level: 1, freePct: 11, at }, now)).toBe('tight');
    expect(cloudStartPressure({ level: 2, freePct: 11, at }, now)).toBe('tight');
    expect(cloudStartPressure({ level: 2, freePct: 12, at }, now)).toBe('normal');
  });

  it('heavy swapping and the kernel critical are still critical', () => {
    expect(cloudStartPressure({ level: 1, freePct: 40, swapInMbps: 16, at }, now)).toBe('critical');
    expect(cloudStartPressure({ level: 4, freePct: 40, at }, now)).toBe('critical');
    expect(cloudStartPressure({ level: 2, freePct: 4, at }, now)).toBe('critical');
  });

  it('a reading older than a minute, undated, or missing says nothing', () => {
    expect(cloudStartPressure({ level: 4, freePct: 2, at: now - 60_001 }, now)).toBeUndefined();
    expect(cloudStartPressure({ level: 4, freePct: 2, at: now - 60_000 }, now)).toBe('critical');
    expect(cloudStartPressure({ level: 4, freePct: 2 } as never, now)).toBeUndefined();
    expect(cloudStartPressure(null, now)).toBeUndefined();
    expect(cloudStartPressure({ level: null, freePct: null, at }, now)).toBeUndefined();
  });

  it('starts under the warning alone climb to the ceiling', () => {
    let clock = 0;
    const b = new StartBudget({ clock: () => clock });
    for (let i = 0; i < 10; i++) {
      clock += 31_000;
      b.started({ pressure: cloudStartPressure({ level: 2, freePct: 38, swapInMbps: 6, at: clock }, clock) });
    }
    expect(b.now()).toBe(8);
  });
});
