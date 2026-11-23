// The Mac's memory is read without starting a program each time.
//
// 2026-11-22: the app's main thread froze for 980 s in one afternoon. 51 s of
// that was spent starting child programs, and 37 s of the 51 was this one
// read: `sysctl`, started afresh every 2 seconds while agents ran commands. A
// 10-second sample of the live 1.8 GB process put 2.2% of its main thread's
// time inside posix_spawn. Now one small shell is started once and runs
// sysctl each time it is asked, so the app's own thread starts nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type * as ChildProcess from 'node:child_process';

const BLOCK = [
  'kern.memorystatus_vm_pressure_level: 1',
  'kern.memorystatus_level: 42',
  'vm.compressor.swapper.swapins_total: 1000',
  'hw.pagesize: 16384',
  'vm.swapusage: total = 2048.00M  used = 512.00M  free = 1536.00M  (encrypted)',
].join('\n');

type Mode = 'answers' | 'dies' | 'silent';
const fake = {
  mode: 'answers' as Mode,
  real: false,
  started: [] as string[],
  asks: 0,
  killed: 0,
  children: [] as ChildProcess.ChildProcess[],
};
let realSpawn: typeof ChildProcess.spawn;

function fakeChild(script: string) {
  const child = new EventEmitter() as EventEmitter & { stdin: unknown; stdout: unknown; kill: () => void; unref: () => void };
  const stdout = Object.assign(new EventEmitter(), { setEncoding() {}, unref() {} });
  const end = /echo (\S+); done/.exec(script)?.[1] ?? '';
  const mode = fake.mode;
  child.stdout = stdout;
  child.stdin = Object.assign(new EventEmitter(), {
    unref() {},
    end() {},
    write(_chunk: string, cb?: (err?: Error | null) => void) {
      fake.asks += 1;
      cb?.(null);
      if (mode === 'answers') queueMicrotask(() => stdout.emit('data', `${BLOCK}\n${end}\n`));
      if (mode === 'dies') queueMicrotask(() => child.emit('exit', 1, null));
      return true;
    },
  });
  child.kill = () => { fake.killed += 1; };
  child.unref = () => {};
  return child;
}

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof ChildProcess>();
  realSpawn = real.spawn;
  const spawn = (file: string, args: string[], opts: object) => {
    fake.started.push(file);
    if (fake.real) {
      const child = real.spawn(file, args, opts);
      fake.children.push(child);
      return child;
    }
    return fakeChild(args.join(' '));
  };
  const execFile = (file: string, _args: string[], _opts: unknown, cb?: (e: Error | null, out?: string) => void) => {
    fake.started.push(file);
    cb?.(null, `${BLOCK}\n`);
  };
  return { ...real, default: { ...real, spawn, execFile }, spawn, execFile };
});

const load = async () => import('../main/mac-pressure.mts');

beforeEach(() => {
  vi.resetModules();
  Object.assign(fake, { mode: 'answers', real: false, started: [], asks: 0, killed: 0, children: [] });
});
afterEach(() => { vi.useRealTimers(); });

describe('reading the Mac\'s memory', () => {
  it('starts one program for twenty readings, and reads the same numbers', async () => {
    const { readMacPressure } = await load();
    for (let n = 0; n < 20; n++) {
      expect(await readMacPressure('darwin')).toMatchObject({ level: 1, freePct: 42, swapMb: 512 });
    }
    expect(fake.started).toEqual(['/bin/sh']);
    expect(fake.asks).toBe(20);
  });

  it('gives two asks at once the one answer', async () => {
    const { readMacPressure } = await load();
    const [a, b] = await Promise.all([readMacPressure('darwin'), readMacPressure('darwin')]);
    expect(a).toMatchObject({ level: 1, freePct: 42 });
    expect(b).toMatchObject({ level: 1, freePct: 42 });
    expect(fake.asks).toBe(1);
  });

  it('still reads when its helper dies, and starts another for the next reading', async () => {
    const { readMacPressure } = await load();
    fake.mode = 'dies';
    // The reading it died under comes from sysctl started the old way.
    expect(await readMacPressure('darwin')).toMatchObject({ level: 1, freePct: 42 });
    expect(fake.started).toEqual(['/bin/sh', '/usr/sbin/sysctl']);
    fake.mode = 'answers';
    expect(await readMacPressure('darwin')).toMatchObject({ level: 1, freePct: 42 });
    expect(await readMacPressure('darwin')).toMatchObject({ level: 1, freePct: 42 });
    expect(fake.started).toEqual(['/bin/sh', '/usr/sbin/sysctl', '/bin/sh']);
  });

  it('gives up on a helper that never answers, and stops it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { readMacPressure } = await load();
    fake.mode = 'silent';
    const reading = readMacPressure('darwin');
    await vi.advanceTimersByTimeAsync(4_900);
    expect(fake.started).toEqual(['/bin/sh']);
    await vi.advanceTimersByTimeAsync(200);
    expect(await reading).toMatchObject({ level: 1, freePct: 42 });
    expect(fake.killed).toBe(1);
    expect(fake.started).toEqual(['/bin/sh', '/usr/sbin/sysctl']);
  });

  it('does not start a failing helper for ever', async () => {
    const { readMacPressure } = await load();
    fake.mode = 'dies';
    for (let n = 0; n < 10; n++) expect(await readMacPressure('darwin')).toMatchObject({ level: 1, freePct: 42 });
    expect(fake.started.filter((f) => f === '/bin/sh')).toHaveLength(3);
    expect(fake.started.filter((f) => f === '/usr/sbin/sysctl')).toHaveLength(10);
  });

  it('starts nothing off a Mac', async () => {
    const { readMacPressure } = await load();
    for (const platform of ['linux', 'win32'] as const) {
      expect(await readMacPressure(platform)).toEqual({ level: null, freePct: null, swapInMbps: null, swapMb: null });
    }
    expect(fake.started).toEqual([]);
  });

  // The real shell and the real sysctl, which only a Mac has.
  it.runIf(process.platform === 'darwin')('on a Mac, one real shell answers every ask and ends when it is let go', async () => {
    fake.real = true;
    const { readMacPressure, stopReadingMacPressure } = await load();
    for (let n = 0; n < 5; n++) {
      const r = await readMacPressure('darwin');
      expect(Number.isFinite(r.level)).toBe(true);
      expect(Number.isFinite(r.freePct)).toBe(true);
      expect(Number.isFinite(r.swapMb)).toBe(true);
    }
    expect(fake.started).toEqual(['/bin/sh']);
    const [child] = fake.children;
    const gone = new Promise((resolve) => child.once('exit', resolve));
    stopReadingMacPressure();
    await gone;
    expect(child.exitCode).toBe(0);
    expect(realSpawn).toBeTypeOf('function');
  });
});
