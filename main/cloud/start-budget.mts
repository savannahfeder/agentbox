// HOW MANY CLOUD RUNS MAY BE STARTING AT ONCE, earned rather than fixed
// (tests/cloud-starts-speed-up-while-they-go-well-and-back-off-when-they-do-not).
//
// A start is packing and sending on whatever machine holds the store, so what it
// may cost depends on that machine and this moment. Each start that went well on
// a calm machine earns one more. A failure, memory short, or the app stalling
// halves it; one bad moment counts once. The ceiling is low until real packing
// has been measured at this rate: a stand-in with tiny files proved nothing about
// a 278 MB transcript.

import { pressureFrom } from '../memory-gate.mts';
import type { Pressure } from '../memory-gate.mts';
import { STALE_MS, withoutWarnOrLightSwap } from '../start-hold.mts';
import type { PressureSample } from '../start-hold.mts';

const STALL_LIMIT_MS = 500;
const COOL_MS = 30_000;

/**
 * The Mac's memory as a cloud start is judged by it. The kernel's warn and
 * light swapping are set aside at any agent count: a 16 GB Mac reports them
 * most of the day at 30-50% free, and a packed run leaves no agent here. A
 * reading that is missing, undated or stale says nothing.
 */
export function cloudStartPressure(reading: PressureSample | null | undefined, now: number): Pressure | undefined {
  if (!reading || !(Math.abs(now - Number(reading.at)) <= STALE_MS)) return undefined;
  if (!Number.isFinite(reading.level) && !Number.isFinite(reading.freePct) && !Number.isFinite(reading.swapInMbps)) return undefined;
  return pressureFrom(withoutWarnOrLightSwap(reading));
}

export interface StartBudgetOptions {
  start?: number;
  floor?: number;
  ceiling?: number;
  stallLimitMs?: number;
  coolMs?: number;
  clock?: () => number;
}

export interface StartReading {
  pressure?: Pressure;
  stallMs?: number;
}

export class StartBudget {
  declare value: number;
  declare floor: number;
  declare ceiling: number;
  declare stallLimitMs: number;
  declare coolMs: number;
  declare clock: () => number;
  declare cutAt: number;

  constructor({ start = 2, floor = 1, ceiling = 8, stallLimitMs = STALL_LIMIT_MS, coolMs = COOL_MS, clock = Date.now }: StartBudgetOptions = {}) {
    Object.assign(this, { value: start, floor, ceiling, stallLimitMs, coolMs, clock });
    this.cutAt = -Infinity;
  }

  now(): number { return this.value; }

  started({ pressure, stallMs }: StartReading = {}): void {
    if (pressure === 'critical') { this.value = this.floor; this.cutAt = this.clock(); return; }
    if (pressure === 'tight' || (stallMs ?? 0) >= this.stallLimitMs) { this._cut(); return; }
    if (this.clock() - this.cutAt >= this.coolMs) this.value = Math.min(this.ceiling, this.value + 1);
  }

  failed(): void { this._cut(); }

  _cut(): void {
    const at = this.clock();
    if (at - this.cutAt < this.coolMs) return;
    this.cutAt = at;
    this.value = Math.max(this.floor, Math.floor(this.value / 2));
  }
}
