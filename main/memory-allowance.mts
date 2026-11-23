// HOW MUCH MEMORY AGENTBOX MAY HOLD ON THIS COMPUTER, AND WHETHER IT IS OVER.
//
// The kernel says a computer is short of memory once it already is. What it
// runs short BY can be read a minute earlier: the app and its agents' programs
// added to the biggest other programs (main/memory-log.mts lists all three).
// So Agentbox keeps to what is left after the others, and the doors that
// start work (main/start-hold.mts, main/memory-gate-server.mts) ask here as
// well as asking the kernel. The measurements are in
// tests/agentbox-keeps-its-agents-inside-a-memory-allowance.
//
// The shares come from one 16 GB Mac's week. They are shares so another size
// gets an answer, not because other sizes were measured.

import type { Pressure } from './memory-gate.mts';

/** Of the computer's memory: what Agentbox and the biggest other programs hold together before it runs short. */
export const CEILING_SHARE = 9 / 16;
/** What Agentbox keeps however much the other programs hold. */
export const FLOOR_SHARE = 2 / 16;
/**
 * Agents holding less than this have nothing to give back, so being over
 * holds nothing: a squeeze that is all other programs is theirs to end.
 */
export const AGENTS_SHARE = 1 / 16;

/** A standing older than this is not acted on. */
export const STALE_MS = 150_000;
/** How long the agents stay inside before the doors open again. */
export const SETTLE_MS = 3 * 60_000;

export interface Held { ramMb: number; appMb: number; tasksMb: number; othersMb: number }
export interface Standing { allowanceMb: number; agentboxMb: number; over: boolean }
export interface StampedStanding extends Standing { at: number }

export function allowanceMb(ramMb: number, othersMb: number): number {
  return Math.round(Math.max(ramMb * FLOOR_SHARE, ramMb * CEILING_SHARE - othersMb));
}

/** Where Agentbox stands on one listing, or null when a figure is missing. Pure. */
export function standing({ ramMb, appMb, tasksMb, othersMb }: Held): Standing | null {
  if (!(ramMb > 0) || ![appMb, tasksMb, othersMb].every((n) => Number.isFinite(n))) return null;
  const allowance = allowanceMb(ramMb, othersMb);
  const agentboxMb = Math.round(appMb + tasksMb);
  return { allowanceMb: allowance, agentboxMb, over: agentboxMb > allowance && tasksMb >= ramMb * AGENTS_SHARE };
}

/**
 * Whether the doors hold: the newest standing is fresh, and Agentbox was
 * over in any standing of the last `settleMs`. Memory given back in one
 * reading is as often the listing catching a program between two sizes. Pure.
 */
export function overAllowance(standings: readonly StampedStanding[] | null | undefined, now: number, { staleMs = STALE_MS, settleMs = SETTLE_MS } = {}): boolean {
  const list = standings ?? [];
  if (!list.length) return false;
  const newest = Math.max(...list.map((s) => s.at));
  if (!(now - newest <= staleMs)) return false;
  return list.some((s) => s.over && now - s.at <= settleMs);
}

/** What the command gate is told: over the allowance reads as tight, and never as more than the kernel said. */
export function gatePressure(pressure: Pressure, over: boolean): Pressure {
  return over && pressure === 'normal' ? 'tight' : pressure;
}

/**
 * The thread asked to give memory back (main/memory-give-back.mts): the one
 * holding the most while Agentbox is over, if it holds enough to give. Pure.
 */
export function heaviestOver(tasks: readonly { item: string; mb: number }[], stands: Standing | null | undefined, ramMb: number): { item: string; mb: number } | null {
  if (!stands?.over) return null;
  const most = tasks.reduce<{ item: string; mb: number } | null>((best, t) => (!best || t.mb > best.mb ? t : best), null);
  return most && most.mb >= ramMb * AGENTS_SHARE ? { item: most.item, mb: most.mb } : null;
}
