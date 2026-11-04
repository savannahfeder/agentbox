// ROWS HOLD STILL UNDER THE POINTER (tests/rows-hold-still-under-the-pointer).
// While the pointer is working on the list, rows keep the places they had when
// it arrived. Nothing is hidden: a new row is drawn at the foot, and the order
// catches up when the pointer leaves.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

// A pointer left parked on the list must not hold it for ever.
export const HOLD_IDLE_MS = 60_000;

/** `rows` in the places `was` gave them, then whatever `was` did not hold. */
export function steadyOrder<T>(was: readonly string[], rows: readonly T[], keyOf: (r: T) => string): T[] {
  const place = new Map(was.map((k, i) => [k, i]));
  const kept = rows.filter((r) => place.has(keyOf(r))).sort((a, b) => place.get(keyOf(a))! - place.get(keyOf(b))!);
  return [...kept, ...rows.filter((r) => !place.has(keyOf(r)))];
}

type Timers = { setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (t: never) => void };

/** Whether to hold: on from a pointer moving on the list until it leaves, or goes still for HOLD_IDLE_MS. */
export function pointerHold(set: (on: boolean) => void, t: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) }) {
  let timer: unknown;
  return {
    move() {
      set(true);
      t.clearTimeout(timer as never);
      timer = t.setTimeout(() => set(false), HOLD_IDLE_MS);
    },
    leave() {
      t.clearTimeout(timer as never);
      set(false);
    },
  };
}

export function usePointerHold() {
  const [holding, setHolding] = useState(false);
  const hold = useRef(pointerHold(setHolding)).current;
  const pointer = useRef({ onPointerMove: hold.move, onPointerLeave: hold.leave }).current;
  return { holding, pointer, letRowsMove: hold.leave };
}

/** `late` counts the rows that arrived since the hold began, which are the last of `rows`. */
export function useHeldOrder<T>(rows: T[], holding: boolean, keyOf: (r: T) => string): { rows: T[]; late: number } {
  const was = useRef<string[]>([]);
  useLayoutEffect(() => { if (!holding) was.current = rows.map(keyOf); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (!holding) return { rows, late: 0 };
    const held = steadyOrder(was.current, rows, keyOf);
    return { rows: held, late: held.filter((r) => !was.current.includes(keyOf(r))).length };
  }, [rows, holding]);
}
