// THE LEFTOVERS SWEEP WAITS OUT A SLOW PS AND SAYS WHY IT FAILED.
//
// On the 2026-11-15 desktop test day (Mac load average 170 to 370, swap near
// 14 GB) both test copies logged "leftovers: could not list processes: Command
// failed: /bin/ps ..." about 200 times in three hours, more than half of their
// looks. The three listings were killed at 10 seconds and thrown away, and the
// next look a minute later started them again, so the sweep was blind through
// the hours memory was shortest, which is when it is meant to stop leftovers.
// The line also never said whether ps was cut off or exited with an error, so
// the cause could not be read from the log. The memory log shares this listing.
//
// Measured before the fix: a ps answering in 12 seconds was rejected, the
// message carried no reason, and a second look started while one was running.

import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Answer = { takesMs: number; stdout?: string } | { exits: number; stderr: string };
const queue: Answer[] = [];
const deadlines: number[] = [];

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  const execFile = (file: string, args: string[], opts: { timeout?: number }, cb: (e: Error | null, out?: string, err?: string) => void) => {
    if (file !== '/bin/ps') { cb(null, '', ''); return; }
    deadlines.push(opts.timeout ?? 0);
    const a = queue.shift() ?? { takesMs: 0 };
    const cmd = `${file} ${args.join(' ')}`;
    if ('exits' in a) { cb(Object.assign(new Error(`Command failed: ${cmd}\n${a.stderr}`), { code: a.exits, killed: false, signal: null }), '', a.stderr); return; }
    if (opts.timeout && a.takesMs > opts.timeout) { cb(Object.assign(new Error(`Command failed: ${cmd}\n`), { code: null, killed: true, signal: 'SIGTERM' }), '', ''); return; }
    cb(null, a.stdout ?? '', '');
  };
  return { ...real, default: { ...real, execFile }, execFile, [promisify.custom]: undefined };
});

const { listProcesses, LeftoverCleaner } = await import('../main/leftovers.mts');

beforeEach(() => { queue.length = 0; deadlines.length = 0; });

describe('listing processes on a Mac under load', () => {
  it('waits out a listing that takes 12 seconds', async () => {
    queue.push({ takesMs: 12_000 }, { takesMs: 12_000 }, { takesMs: 12_000 });
    await expect(listProcesses('darwin')).resolves.toEqual([]);
  });

  it('answers at once when ps is quick', async () => {
    queue.push({ takesMs: 100 }, { takesMs: 100 }, { takesMs: 100 });
    await expect(listProcesses('darwin')).resolves.toEqual([]);
  });

  it('still cuts off a listing that would take two minutes, and says it was cut off', async () => {
    queue.push({ takesMs: 120_000 }, { takesMs: 100 }, { takesMs: 100 });
    await expect(listProcesses('darwin')).rejects.toThrow(/ps -axo pid=,ppid=,rss=,time=,lstart=,comm= was cut off after \d+ s/);
    expect(Math.max(...deadlines)).toBeLessThan(60_000);
  });

  it('says what ps printed when it exits with an error', async () => {
    queue.push({ takesMs: 100 }, { exits: 1, stderr: 'ps: sysctl: Cannot allocate memory\n' }, { takesMs: 100 });
    await expect(listProcesses('darwin')).rejects.toThrow(/ps -ww -axo pid=,lstart=,command= exited 1: ps: sysctl: Cannot allocate memory$/);
  });
});

describe('a look at leftovers', () => {
  it('does not start a second listing while one is still running', async () => {
    let release: ((v: never[]) => void) | null = null;
    const list = vi.fn(() => (list.mock.calls.length === 1
      ? new Promise<never[]>((r) => { release = r; })
      : Promise.resolve([] as never[])));
    const cleaner = new LeftoverCleaner({ list, readPressure: async () => 'normal', log: () => {} });
    const first = cleaner.tick();
    const second = cleaner.tick();
    await vi.waitFor(() => expect(release).not.toBeNull());
    expect(list).toHaveBeenCalledTimes(1);
    release!([]);
    await Promise.all([first, second]);
    // A run gives the next look something to find (tests/an-idle-app-lists-every-process-once-every-ten-minutes).
    cleaner.starting('w-0a1b2c');
    await cleaner.tick();
    expect(list).toHaveBeenCalledTimes(2);
  });
});
