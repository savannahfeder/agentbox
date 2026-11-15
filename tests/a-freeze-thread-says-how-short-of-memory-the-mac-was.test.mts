// A FREEZE THREAD SAYS HOW SHORT OF MEMORY THE MAC WAS.
//
// What broke (w-8918e86ce0, 2026-11-08): the thread filed for a day the app
// froze listed only the functions that held its main thread. On 2026-11-07
// those were spread over dozens of ordinary store reads, 0.5 to 1.5 s each
// almost every second, because the Mac had swap at 20 GB and was paging the
// app back in; the thread pointed its agent at code that was not the cause.
// The minute log now records the swap rate, so the thread says, from that
// day's log, how hard the Mac was swapping and what held memory at the worst
// minute, and says to start there when it was swapping hard.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freezeRow, memoryOn, memoryWords } from '../main/freeze-watch.mts';
import { SWAP_CRITICAL_MBPS } from '../main/memory-gate.mts';

const DAY = '2026-11-07';
const hold = (ms, where = 'listItems main/store.mts:409') => ({ at: `${DAY}T23:00:00.000Z`, ms, where, stacks: [] });
const minute = (hhmm, extra) => ({ at: `${DAY}T${hhmm}:00.000Z`, pressure: 'tight', level: 2, freePct: 30, app: { mb: 900, procs: 30 }, tasks: [], others: [], running: 5, ...extra });

describe('the words', () => {
  it('a day the Mac swapped hard says so, with its worst minute and who held memory then', () => {
    const lines = [
      minute('10:00', { swapInMbps: 2, swapMb: 2000 }),
      minute('10:01', { swapInMbps: SWAP_CRITICAL_MBPS, swapMb: 9000, pressure: 'critical' }),
      minute('10:02', { swapInMbps: 42.5, swapMb: 20400, pressure: 'critical', app: { mb: 2900 },
        tasks: [{ item: 'w-aaaaaaaaaa', mb: 1500 }, { item: 'w-bbbbbbbbbb', mb: 700 }],
        others: [{ name: 'bztransmit', mb: 3600 }, { name: 'Google Chrome', mb: 400 }] }),
      minute('10:03', { swapInMbps: 0.4, swapMb: 18000, pressure: 'normal' }),
    ];
    const words = memoryWords(lines).join('\n');
    expect(words).toContain('up to 42.5 MB/s');
    expect(words).toContain(`2 minutes at ${SWAP_CRITICAL_MBPS} MB/s or more`);
    expect(words).toContain('Swap peaked at 19.9 GB');
    expect(words).toContain('critical 2, tight 1 of 4 minutes logged');
    expect(words).toMatch(/hardest at \d\d:02/);
    expect(words).toContain('the app 2900 MB');
    expect(words).toContain('w-aaaaaaaaaa 1500 MB');
    expect(words).toContain('bztransmit 3600 MB');
    expect(words).toMatch(/start with what held memory/i);
  });

  it('a calm day says how calm, without the advice', () => {
    const words = memoryWords([minute('10:00', { swapInMbps: 0.5, swapMb: 1000, pressure: 'normal' })]).join('\n');
    expect(words).toContain('up to 0.5 MB/s');
    expect(words).toContain('0 minutes at');
    expect(words).not.toMatch(/start with what held memory/i);
  });

  it('a log from before the swap rate was kept still gives the pressure, and nothing is made up', () => {
    const words = memoryWords([minute('10:00', {}), minute('10:01', { pressure: 'critical' })]).join('\n');
    expect(words).toContain('critical 1, tight 1 of 2 minutes logged');
    expect(words).not.toContain('MB/s');
  });

  it('no memory log, no words', () => {
    expect(memoryWords([])).toEqual([]);
  });
});

describe('the thread', () => {
  it('carries the words under the holds, and is unchanged without a log', () => {
    const lines = [hold(1500)];
    const memory = [minute('10:00', { swapInMbps: 30, swapMb: 15000, pressure: 'critical' })];
    const withMemory = freezeRow(lines, { day: DAY, memory }).body;
    expect(withMemory).toContain('How short of memory the Mac was');
    expect(withMemory.indexOf('Where the time went')).toBeLessThan(withMemory.indexOf('How short of memory'));
    expect(freezeRow(lines, { day: DAY }).body).not.toContain('How short of memory');
  });

  it('reads the minute lines of that day\'s log, and leaves the recorder\'s heap lines out', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-memory-'));
    fs.writeFileSync(path.join(dir, `memory-${DAY}.jsonl`), [
      JSON.stringify(minute('10:00', { swapInMbps: 3 })),
      JSON.stringify({ at: `${DAY}T10:00:30.000Z`, upMin: 5, heapMb: 300, processes: [] }),
      'a line cut short by a qu',
    ].join('\n'));
    expect(memoryOn(dir, DAY)).toHaveLength(1);
    expect(memoryOn(dir, '2026-11-06')).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
