// HOW SHORT OF MEMORY THIS MAC IS: ONE READING, SHARED BY EVERY PART OF THE APP THAT ASKS.
//
// The kernel's pressure level and free share, plus how fast the Mac is reading
// swapped memory back off its disk. The last is a rate, so it needs two looks
// at a counter; every caller in this process feeds the same meter, which is
// why the reading lives here and not in each of them.

import { execFile } from 'node:child_process';
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

function sysctl(): Promise<string> {
  // A name this Mac lacks makes sysctl exit non-zero after printing the rest,
  // so its output is kept whatever the exit.
  return new Promise((resolve) => {
    execFile('/usr/sbin/sysctl', NAMES, { timeout: 5_000 }, (_err, stdout) => resolve(String(stdout ?? '')));
  });
}

/** This Mac's pressure now. Nulls for whatever it cannot read; never throws. */
export async function readMacPressure(): Promise<PressureReading> {
  const r = readingFromSysctl(await sysctl());
  const rate = r.swapInBytes === null ? null : meter.add(r.swapInBytes, Date.now());
  return {
    level: r.level,
    freePct: r.freePct,
    swapInMbps: rate === null ? null : Math.round(rate * 10) / 10,
    swapMb: r.swapMb,
  };
}
