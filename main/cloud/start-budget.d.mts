import type { Pressure } from '../memory-gate.mts';

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

export declare class StartBudget {
  constructor(options?: StartBudgetOptions);
  value: number;
  floor: number;
  ceiling: number;
  stallLimitMs: number;
  coolMs: number;
  clock: () => number;
  cutAt: number;
  now(): number;
  started(reading?: StartReading): void;
  failed(): void;
}
