// A COMPUTER THAT IS NOT A MAC STARTED SYSCTL FOR NOTHING.
//
// The memory reading asks `/usr/sbin/sysctl` for the kernel's
// `kern.memorystatus_*` and `vm.compressor.*` names, which only macOS has. On
// Linux sysctl exists, prints nothing for them and exits non-zero, so every
// reading came back empty, and the app still started it: traced for ten idle
// minutes on Linux, 357 sysctl processes for readings that were all nulls.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const started: string[] = [];

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  const execFile = (file: string, _args: string[], _opts: unknown, cb?: (e: Error | null, out?: string) => void) => {
    started.push(file);
    cb?.(null, 'kern.memorystatus_vm_pressure_level: 1\nkern.memorystatus_level: 42\n');
  };
  const execFileSync = (file: string) => { started.push(file); return '1\n42\n'; };
  // The shell that reads for a Mac (main/mac-pressure.mts) cannot start here,
  // so a Mac's reading falls back to sysctl itself.
  const spawn = (file: string) => { started.push(file); throw new Error('no shell in this test'); };
  return { ...real, default: { ...real, execFile, execFileSync, spawn }, execFile, execFileSync, spawn };
});

beforeEach(() => { started.length = 0; });

describe('the memory reading off a Mac', () => {
  it('starts nothing and reads nothing on Linux or Windows', async () => {
    const { readMacPressure } = await import('../main/mac-pressure.mts');
    const { readMacPressureNow } = await import('../main/start-hold.mts');
    for (const platform of ['linux', 'win32'] as const) {
      expect(await readMacPressure(platform)).toEqual({ level: null, freePct: null, swapInMbps: null, swapMb: null });
      expect(readMacPressureNow(platform)).toMatchObject({ level: null, freePct: null });
    }
    expect(started).toEqual([]);
  });

  it('still asks sysctl on a Mac', async () => {
    const { readMacPressure } = await import('../main/mac-pressure.mts');
    const { readMacPressureNow } = await import('../main/start-hold.mts');
    expect(await readMacPressure('darwin')).toMatchObject({ level: 1, freePct: 42 });
    expect(readMacPressureNow('darwin')).toMatchObject({ level: 1, freePct: 42 });
    expect(started).toEqual(['/bin/sh', '/usr/sbin/sysctl', '/usr/sbin/sysctl']);
  });
});
