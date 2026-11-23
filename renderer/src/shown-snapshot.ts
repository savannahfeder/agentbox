// A SNAPSHOT THAT CHANGED NOTHING IS NOT DRAWN AGAIN
// (tests/an-update-that-changes-nothing-does-not-redraw-the-window).
//
// The window is told "something changed" up to two and a half times a second
// while an agent writes, and drawing the app again works out the inbox over
// every thread. So each step from the answer to the screen hands back what it
// had when what it was given is what it had.

import { useRef } from 'react';

type Snap<T> = { items: T[] };

/** `view` over a snapshot's threads, the same object for the same snapshot and the same list for the same threads. */
export function shownSnapshots<T, S extends Snap<T>>(view: (items: T[]) => T[]): (s: S) => S {
  let from: S | null = null;
  let shown: S | null = null;
  return (s) => {
    if (s === from && shown) return shown;
    const items = from && shown && s.items === from.items ? shown.items : view(s.items);
    from = s;
    shown = { ...s, items };
    return shown;
  };
}

/** `next`, or `prev` when the two hold the same ids, so a list built from it is not worked out again. */
export function keptSet<T>(prev: ReadonlySet<T> | null, next: ReadonlySet<T>): ReadonlySet<T> {
  if (!prev || prev.size !== next.size) return next;
  for (const id of next) if (!prev.has(id)) return next;
  return prev;
}

/** A set worked out on every draw, the same object for as long as it holds the same ids. */
export function useKeptSet<T>(next: ReadonlySet<T>): ReadonlySet<T> {
  const kept = useRef<ReadonlySet<T> | null>(null);
  kept.current = keptSet(kept.current, next);
  return kept.current;
}

export interface Drawn<S, T> { from: S; items: T[]; shown: unknown }

/**
 * Whether the refresh has anything to draw: not when the answer and the list it
 * would draw are the ones it drew last, and the screen still shows what it drew.
 */
export function newToDraw<S, T>(drawn: Drawn<S, T> | null, next: S, items: T[], onScreen: unknown): boolean {
  return !(drawn && drawn.from === next && drawn.items === items && drawn.shown === onScreen);
}
