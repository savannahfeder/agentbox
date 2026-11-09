// A MAC THAT IS SWAPPING IS SHORT OF MEMORY, WHATEVER ITS "FREE" GAUGE SAYS.
//
// What broke (w-8918e86ce0, 2026-11-07): a 16 GB Mac froze until Agentbox was
// force quit, the dozen-and-somethingth time. Every memory rule in the app read
// the kernel's free share (`kern.memorystatus_level`) and its warn level, and
// the minute log showed 25 to 44% free and "tight" for the whole evening
// before the freeze, never "critical". The kernel's own counters told the
// truth: swap had peaked at 20 GB (`vm.compressor.swapper.allocated_bytes_hwm`)
// and 1.4 TB had been swapped back in over three days. Measured after the
// restart: swap grew from 2.0 to 5.7 GB in twelve minutes at 28 to 40% "free",
// swapping in at 3 to 34 MB/s.
//
// So the reading now carries the swap-in rate over the last minute, and a Mac
// swapping in at SWAP_TIGHT_MBPS reads tight and at SWAP_CRITICAL_MBPS
// critical. The command gate takes only heavy swapping, and only as tight,
// because holding an agent's `ls` frees nothing; a review against the Mac's
// logs measured 1.6 to 3.5 MB/s, with 14 MB/s bursts, on an ordinary evening.
// Swapping never closes a terminal.
import { describe, it, expect } from 'vitest';
import { pressureFrom, SWAP_TIGHT_MBPS, SWAP_CRITICAL_MBPS, GATE_LINES, TERMINAL_LINES } from '../main/memory-gate.mts';
import { SwapMeter, readingFromSysctl } from '../main/mac-pressure.mts';
import { startDecision } from '../main/start-hold.mts';
import { summarizeMemory } from '../main/memory-log.mts';

const MB = 1024 * 1024;

describe('the pressure word', () => {
  it('reads tight from the swap rate alone, at the line and not below it', () => {
    expect(pressureFrom({ level: 1, freePct: 40, swapInMbps: SWAP_TIGHT_MBPS - 0.1 })).toBe('normal');
    expect(pressureFrom({ level: 1, freePct: 40, swapInMbps: SWAP_TIGHT_MBPS })).toBe('tight');
  });

  it('reads critical while the gauge still says 40% free', () => {
    expect(pressureFrom({ level: 2, freePct: 40, swapInMbps: SWAP_CRITICAL_MBPS - 0.1 })).toBe('tight');
    expect(pressureFrom({ level: 2, freePct: 40, swapInMbps: SWAP_CRITICAL_MBPS })).toBe('critical');
  });

  it('without a swap rate reads exactly as before', () => {
    expect(pressureFrom({ level: 1, freePct: 40, swapInMbps: null })).toBe('normal');
    expect(pressureFrom({ level: 1, freePct: 40 })).toBe('normal');
    expect(pressureFrom({ level: 1, freePct: 4 })).toBe('critical');
  });

  it('the command gate holds tests only on heavy swapping, and never stops light commands for it', () => {
    expect(pressureFrom({ level: 1, freePct: 40, swapInMbps: SWAP_CRITICAL_MBPS - 0.1 }, GATE_LINES)).toBe('normal');
    expect(pressureFrom({ level: 1, freePct: 40, swapInMbps: SWAP_CRITICAL_MBPS }, GATE_LINES)).toBe('tight');
    expect(pressureFrom({ level: 1, freePct: 40, swapInMbps: 500 }, GATE_LINES)).toBe('tight');
  });

  it('swapping never closes a terminal', () => {
    expect(pressureFrom({ level: 1, freePct: 40, swapInMbps: 500 }, TERMINAL_LINES)).toBe('normal');
    expect(pressureFrom({ level: 4, freePct: 40, swapInMbps: 500 }, TERMINAL_LINES)).toBe('critical');
  });

  it('a caller can cap what swapping alone means', () => {
    expect(pressureFrom({ level: 1, freePct: 40, swapInMbps: 500 }, { criticalSwap: Infinity })).toBe('tight');
    // The cap is on swapping only: the kernel's own critical still stops everything.
    expect(pressureFrom({ level: 4, freePct: 40, swapInMbps: 500 }, { criticalSwap: Infinity })).toBe('critical');
  });
});

describe('the swap meter', () => {
  it('says nothing until it has twenty seconds to go on', () => {
    const m = new SwapMeter();
    expect(m.add(0, 0)).toBeNull();
    expect(m.add(10 * MB, 10_000)).toBeNull();
    expect(m.add(20 * MB, 20_000)).toBe(1);
  });

  it('averages over the last minute, so one burst does not decide', () => {
    const m = new SwapMeter();
    m.add(0, 0);
    m.add(0, 30_000);
    m.add(0, 60_000);
    // 300 MB in one ten second burst, measured from the last sample at or
    // before the minute began.
    expect(m.add(300 * MB, 70_000)).toBeCloseTo(300 / 70, 5);
  });

  it('keeps reading when it is asked only once a minute', () => {
    const m = new SwapMeter();
    m.add(0, 0);
    expect(m.add(60 * MB, 60_000)).toBe(1);
    expect(m.add(180 * MB, 120_000)).toBe(2);
  });

  it('starts over when the counter goes backwards or the last sample is too old', () => {
    const m = new SwapMeter();
    m.add(100 * MB, 0);
    expect(m.add(50 * MB, 30_000)).toBeNull();
    expect(m.add(80 * MB, 60_000)).toBe(1);
    expect(m.add(1000 * MB, 60_000 + 10 * 60_000)).toBeNull();
  });
});

describe('reading the kernel', () => {
  const out = [
    'kern.memorystatus_vm_pressure_level: 2',
    'kern.memorystatus_level: 31',
    'vm.compressor.swapper.swapins_total: 1000',
    'hw.pagesize: 16384',
    'vm.swapusage: total = 4096.00M  used = 3719.50M  free = 376.50M  (encrypted)',
  ].join('\n');

  it('takes the level, the free share, swap in so far and swap used', () => {
    expect(readingFromSysctl(out)).toEqual({ level: 2, freePct: 31, swapInBytes: 1000 * 16384, swapMb: 3720 });
  });

  it('a Mac without the swap counters still gives the rest', () => {
    expect(readingFromSysctl('kern.memorystatus_vm_pressure_level: 1\nkern.memorystatus_level: 50\n'))
      .toEqual({ level: 1, freePct: 50, swapInBytes: null, swapMb: null });
    expect(readingFromSysctl('')).toEqual({ level: null, freePct: null, swapInBytes: null, swapMb: null });
  });
});

describe('starting another agent', () => {
  const NOW = 1_800_000_000_000;
  const base = { on: true, now: NOW, lastStartAt: NOW - 60_000, heldSince: null, roomy: 4 };
  const swapping = (swapInMbps) => ({ level: 1, freePct: 40, swapInMbps, at: NOW });

  it('heavy swapping holds a new agent however few are running', () => {
    expect(startDecision({ ...base, running: 1, reading: swapping(SWAP_CRITICAL_MBPS) })).toEqual({ start: false, why: 'critical' });
  });

  it('light swapping holds only from the Mac\'s own number up, like the kernel\'s warn', () => {
    expect(startDecision({ ...base, running: 3, reading: swapping(SWAP_TIGHT_MBPS) }).start).toBe(true);
    expect(startDecision({ ...base, running: 4, reading: swapping(SWAP_TIGHT_MBPS) })).toEqual({ start: false, why: 'tight' });
  });

  it('heavy swapping a minute ago still holds, as any short reading does', () => {
    expect(startDecision({ ...base, running: 1, reading: swapping(0), recent: [{ ...swapping(SWAP_CRITICAL_MBPS), at: NOW - 60_000 }] }))
      .toEqual({ start: false, why: 'critical' });
  });

  it('still lets one start when nothing is running, and after ten minutes held', () => {
    expect(startDecision({ ...base, running: 0, reading: swapping(500) }).start).toBe(true);
    expect(startDecision({ ...base, running: 3, reading: swapping(500), heldSince: NOW - 10 * 60_000, lastStartAt: NOW - 11 * 60_000 }).start).toBe(true);
  });
});

describe('the minute log', () => {
  it('writes down the swap rate and swap used, and reads pressure from them', () => {
    const line = summarizeMemory([], { appPid: 1, at: 0, reading: { level: 1, freePct: 40, swapInMbps: SWAP_CRITICAL_MBPS, swapMb: 5700 } });
    expect(line).toMatchObject({ pressure: 'critical', freePct: 40, swapInMbps: SWAP_CRITICAL_MBPS, swapMb: 5700 });
  });
});
