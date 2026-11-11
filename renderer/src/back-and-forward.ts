import { useCallback, useEffect, useRef, useState } from 'react';
import type { View } from './types';

/** A place the arrows can take you back to. Pages the trail does not know
 *  (Team, Rooms, search) are not recorded rather than recorded wrongly. */
export type Stop =
  | { at: 'home' }
  | { at: 'list'; view: View }
  | { at: 'thread'; product: string; id: string }
  | { at: 'files'; project: string | null }
  | { at: 'connections' }
  | { at: 'settings'; pane: string | null };

export type Trail = { stops: Stop[]; at: number };

export const EMPTY_TRAIL: Trail = { stops: [], at: -1 };
export const TRAIL_LIMIT = 50;

export function sameStop(a: Stop, b: Stop): boolean {
  if (a.at !== b.at) return false;
  if (a.at === 'list' && b.at === 'list') return a.view === b.view;
  if (a.at === 'thread' && b.at === 'thread') return a.product === b.product && a.id === b.id;
  if (a.at === 'files' && b.at === 'files') return a.project === b.project;
  // Settings is one place: its pages are where you are inside it.
  return true;
}

export function arrive(trail: Trail, stop: Stop): Trail {
  const here = trail.stops[trail.at];
  if (here && sameStop(here, stop)) {
    if (stop.at !== 'settings' || (here.at === 'settings' && here.pane === stop.pane)) return trail;
    const stops = trail.stops.slice();
    stops[trail.at] = stop;
    return { stops, at: trail.at };
  }
  const stops = [...trail.stops.slice(0, trail.at + 1), stop].slice(-TRAIL_LIMIT);
  return { stops, at: stops.length - 1 };
}

function step(trail: Trail, by: 1 | -1, exists: (s: Stop) => boolean): { trail: Trail; stop: Stop } | null {
  for (let i = trail.at + by; i >= 0 && i < trail.stops.length; i += by) {
    if (exists(trail.stops[i])) return { trail: { stops: trail.stops, at: i }, stop: trail.stops[i] };
  }
  return null;
}

export const stepBack = (trail: Trail, exists: (s: Stop) => boolean = () => true) => step(trail, -1, exists);
export const stepForward = (trail: Trail, exists: (s: Stop) => boolean = () => true) => step(trail, 1, exists);

export type ThreadRef = { product: string; id: string };

/** The last thread you stood on, once you have stood on `stop`. Kept apart
 *  from the trail: back moves the trail's place to before the thread you
 *  just left, and that thread is still the last one you were in. */
export function lastThreadAfter(last: ThreadRef | null, stop: Stop): ThreadRef | null {
  return stop.at === 'thread' ? { product: stop.product, id: stop.id } : last;
}

const stopKey = (s: Stop | null) => (s ? JSON.stringify(s) : '');

/** How long a place has to stay on screen before it counts as a visit. */
export const SETTLE_MS = 300;

/**
 * Hands on each place once it has stayed `wait` ms. Closing a thread passes
 * through the list on its way to the next one, and that is not somewhere you
 * were.
 */
export function settledPlaces(onSettle: (s: Stop) => void, wait = SETTLE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => { if (timer) clearTimeout(timer); timer = null; };
  return {
    see(s: Stop) { stop(); timer = setTimeout(() => { timer = null; onSettle(s); }, wait); },
    stop,
  };
}

/**
 * Records each place `here` names and walks back and forward through them
 * with ⌘[ and ⌘] (Ctrl off a Mac) and a mouse's side buttons. `go` opens a
 * stop; `exists` says whether one can still be opened.
 */
export function useBackAndForward({ on, here, go, exists }: {
  on: boolean;
  here: Stop | null;
  go: (stop: Stop) => void;
  exists: (stop: Stop) => boolean;
}) {
  const [trail, setTrail] = useState<Trail>(EMPTY_TRAIL);
  const [lastThread, setLastThread] = useState<ThreadRef | null>(null);
  const trailRef = useRef(trail);
  trailRef.current = trail;
  // The place a step is on its way to, so arriving there is not recorded as a
  // new visit (which would drop everything ahead of it).
  const travelling = useRef<Stop | null>(null);
  const live = useRef({ go, exists });
  live.current = { go, exists };

  const recorder = useRef<ReturnType<typeof settledPlaces> | null>(null);
  if (!recorder.current) {
    recorder.current = settledPlaces((s) => {
      setLastThread((was) => lastThreadAfter(was, s));
      const going = travelling.current;
      travelling.current = null;
      if (going && sameStop(going, s)) return;
      setTrail((t) => arrive(t, s));
    });
  }
  useEffect(() => () => recorder.current?.stop(), []);

  const key = stopKey(here);
  useEffect(() => {
    if (!on || !here) { recorder.current?.stop(); return; }
    recorder.current?.see(here);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key]);

  const travel = useCallback((by: 1 | -1) => {
    const exists = live.current.exists;
    const next = by < 0 ? stepBack(trailRef.current, exists) : stepForward(trailRef.current, exists);
    if (!next) return;
    travelling.current = next.stop;
    setTrail(next.trail);
    live.current.go(next.stop);
  }, []);
  const back = useCallback(() => travel(-1), [travel]);
  const forward = useCallback(() => travel(1), [travel]);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
      if (e.key !== '[' && e.key !== ']') return;
      // A code editor indents and outdents with these.
      if (e.target instanceof Element && e.target.closest('.cm-editor')) return;
      e.preventDefault();
      if (e.key === '[') back(); else forward();
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (e.button === 3) back(); else forward();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouse); };
  }, [on, back, forward]);

  return {
    back,
    forward,
    backTo: on ? stepBack(trail, exists)?.stop ?? null : null,
    forwardTo: on ? stepForward(trail, exists)?.stop ?? null : null,
    lastThread: on ? lastThread : null,
  };
}
