export const CARRIED: 'computer';
export const SLEPT_GAP_MS: number;
export const ASLEEP_SETTLE_MS: number;
export const CARRY_AHEAD_MS: number;
export const CARRY_FRESH_MS: number;

export function isCarried(command: unknown): boolean;
export function notBeforeOf(command: unknown): number;
export function macAsleep(options?: {
  now?: number;
  lastTickAt?: number;
  wokeAt?: number;
  idleMs?: number | null;
  gapMs?: number;
  settleMs?: number;
}): boolean;

export interface CarryItem {
  id?: string;
  product?: string;
  title?: unknown;
  body?: unknown;
  answer?: unknown;
  model?: string | null;
  effort?: string | null;
}

export type CarriedCommand = {
  project: string;
  item: string;
} & ({
  kind: 'reply';
  payload: { carried: typeof CARRIED; text: string; notBefore?: number };
} | {
  kind: 'run-now';
  payload: {
    carried: typeof CARRIED;
    title: string;
    body: string;
    engine?: string;
    model?: string;
    effort?: string;
    notBefore?: number;
    repeat?: { rule: string; key: string };
  };
});

export function carryCommand(options?: {
  item?: CarryItem | null;
  continuation?: boolean;
  engine?: string | null;
  notBefore?: number | null;
  repeat?: { rule: string; key: string } | null;
}): CarriedCommand | null;
