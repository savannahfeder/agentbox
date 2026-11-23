// HOW SHORT OF MEMORY THIS MAC IS: ONE READING, SHARED BY EVERY PART OF THE APP THAT ASKS.
//
// The kernel's pressure level and free share, plus how fast the Mac is reading
// swapped memory back off its disk. The last is a rate, so it needs two looks
// at a counter; every caller in this process feeds the same meter, which is
// why the reading lives here and not in each of them.

import { execFile, spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import type { PressureReading } from './memory-gate.mts';

const NAMES = [
  'kern.memorystatus_vm_pressure_level',
  'kern.memorystatus_level',
  'vm.compressor.swapper.swapins_total',
  'hw.pagesize',
  'vm.swapusage',
];

export interface SysctlReading { level: number | null; freePct: number | null; swapInBytes: number | null; swapMb: number | null }

/** `sysctl` output with names (`name: value` per line) as numbers, each null when missing. Pure. */
export function readingFromSysctl(out: string): SysctlReading {
  const values = new Map<string, string>();
  for (const line of String(out ?? '').split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) values.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  const num = (name: string) => {
    const v = values.has(name) ? Number(values.get(name)) : NaN;
    return Number.isFinite(v) ? v : null;
  };
  const pages = num('vm.compressor.swapper.swapins_total');
  const pageSize = num('hw.pagesize');
  const used = /used\s*=\s*([\d.]+)M/.exec(values.get('vm.swapusage') ?? '');
  return {
    level: num('kern.memorystatus_vm_pressure_level'),
    freePct: num('kern.memorystatus_level'),
    swapInBytes: pages !== null && pageSize !== null ? pages * pageSize : null,
    swapMb: used ? Math.round(Number(used[1])) : null,
  };
}

/**
 * MB a second swapped in, from a running total. Measured from the newest
 * sample at or before `windowMs` ago, so one burst is averaged over the
 * minute, and a caller that asks once a minute still gets a rate. Pure.
 */
export class SwapMeter {
  declare windowMs: number;
  declare minSpanMs: number;
  declare maxSpanMs: number;
  declare samples: { at: number; bytes: number }[];

  constructor({ windowMs = 60_000, minSpanMs = 20_000, maxSpanMs = 3 * 60_000 } = {}) {
    Object.assign(this, { windowMs, minSpanMs, maxSpanMs });
    this.samples = [];
  }

  add(bytes: number, at: number): number | null {
    if (!Number.isFinite(bytes) || !Number.isFinite(at)) return null;
    const last = this.samples[this.samples.length - 1];
    // A counter that went backwards was reset (a restart, a wrap): no rate across it.
    if (last && (bytes < last.bytes || at < last.at)) this.samples = [];
    this.samples.push({ at, bytes });
    while (this.samples.length > 1 && this.samples[1].at <= at - this.windowMs) this.samples.shift();
    const first = this.samples[0];
    const span = at - first.at;
    if (span > this.maxSpanMs) { this.samples = [{ at, bytes }]; return null; }
    if (span < this.minSpanMs) return null;
    return (bytes - first.bytes) / (1024 * 1024) / (span / 1000);
  }
}

const meter = new SwapMeter();

const ASK_MS = 5_000;

// A name this Mac lacks makes sysctl exit non-zero after printing the rest,
// so its output is kept whatever the exit.
function sysctlOnce(): Promise<string> {
  return new Promise((resolve) => {
    execFile('/usr/sbin/sysctl', NAMES, { timeout: ASK_MS, windowsHide: true }, (_err, stdout) => resolve(String(stdout ?? '')));
  });
}

// ONE SMALL SHELL RUNS SYSCTL, SO THE APP'S OWN THREAD STARTS NOTHING. Starting
// a program holds the thread that starts it, longer the bigger the process,
// and this is asked every two seconds while agents run commands. The shell
// runs sysctl once per line it is sent, and ends when the app's end of the
// pipe closes, however the app ends.
const END = '--read--';
const LOOP = `while IFS= read -r _; do /usr/sbin/sysctl ${NAMES.join(' ')} 2>/dev/null; echo ${END}; done`;
// A helper that failed this many times running is not started again; each
// reading then starts sysctl itself.
const HELPER_TRIES = 3;
type Helper = ChildProcessByStdio<Writable, Readable, null>;
let helper: Helper | null = null;
let failed = 0;
let asking: Promise<string> | null = null;

function letGoOf(child: Helper) {
  if (helper === child) helper = null;
  try { child.stdin.end(); } catch { /* already closed */ }
}

/** The helper, started if there is none; null when it will not start. */
function theHelper(): Helper | null {
  if (helper) return helper;
  let child: Helper;
  try {
    child = spawn('/bin/sh', ['-c', LOOP], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  } catch {
    return null;
  }
  helper = child;
  child.stdout.setEncoding('utf8');
  // A write to a helper that has gone is answered by its exit.
  child.stdin.on('error', () => {});
  child.once('exit', () => letGoOf(child));
  child.once('error', () => letGoOf(child));
  // Nothing here keeps the app open.
  child.unref();
  for (const pipe of [child.stdin, child.stdout] as { unref?: () => void }[]) pipe.unref?.();
  return child;
}

/** One reading from the helper, or null when it could not give one. */
function fromHelper(): Promise<string | null> {
  return new Promise((resolve) => {
    const asked = theHelper();
    if (!asked) {
      resolve(null);
      return;
    }
    let out = '';
    const done = (text: string | null) => {
      clearTimeout(late);
      asked.stdout.off('data', onData);
      asked.off('exit', onGone);
      asked.off('error', onGone);
      resolve(text);
    };
    const onData = (chunk: string) => {
      out += chunk;
      const at = out.indexOf(END);
      if (at !== -1) done(out.slice(0, at));
    };
    const onGone = () => { letGoOf(asked); done(null); };
    const late = setTimeout(() => { asked.kill(); onGone(); }, ASK_MS);
    late.unref?.();
    asked.stdout.on('data', onData);
    asked.once('exit', onGone);
    asked.once('error', onGone);
    asked.stdin.write('\n');
  });
}

function sysctl(platform: NodeJS.Platform): Promise<string> {
  // Only macOS has these names; elsewhere sysctl answers none of them.
  if (platform !== 'darwin') return Promise.resolve('');
  asking ??= (async () => {
    if (failed < HELPER_TRIES) {
      const text = await fromHelper();
      if (text !== null) {
        failed = 0;
        return text;
      }
      failed += 1;
    }
    return sysctlOnce();
  })().finally(() => { asking = null; });
  return asking;
}

/** Ends the helper; the next reading starts another. */
export function stopReadingMacPressure(): void {
  if (helper) letGoOf(helper);
  failed = 0;
}

/** This Mac's pressure now. Nulls for whatever it cannot read; never throws. */
export async function readMacPressure(platform: NodeJS.Platform = process.platform): Promise<PressureReading> {
  const r = readingFromSysctl(await sysctl(platform));
  const rate = r.swapInBytes === null ? null : meter.add(r.swapInBytes, Date.now());
  return {
    level: r.level,
    freePct: r.freePct,
    swapInMbps: rate === null ? null : Math.round(rate * 10) / 10,
    swapMb: r.swapMb,
  };
}
