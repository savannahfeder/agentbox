import { useCallback, useEffect, useRef, useState } from 'react';
import type { View } from './types';

/** A place on the inbox page the arrows can take you back to. */
export type Stop =
  /** The list, in the tab it was on. */
  | { at: 'list'; view: View }
  | { at: 'thread'; product: string; id: string }
  /** A chat opened from Needs you, which is drawn in the inbox like a thread. */
  | { at: 'group'; id: string }
  /** A teammate's thread, which is a card from their Mac rather than one of your rows. */
  | { at: 'card'; person: string; thread: string };

/** `at` is the place on screen, or the last one counted while a new one settles. */
export type Trail = { stops: Stop[]; at: number };

export const EMPTY_TRAIL: Trail = { stops: [], at: -1 };
export const TRAIL_LIMIT = 50;

export function sameStop(a: Stop, b: Stop): boolean {
  if (a.at === 'list' && b.at === 'list') return a.view === b.view;
  if (a.at === 'thread' && b.at === 'thread') return a.product === b.product && a.id === b.id;
  if (a.at === 'group' && b.at === 'group') return a.id === b.id;
  if (a.at === 'card' && b.at === 'card') return a.person === b.person && a.thread === b.thread;
  return false;
}

/** The list is one place whichever tab it is on. */
export const samePlace = (a: Stop, b: Stop): boolean => (a.at === 'list' && b.at === 'list') || sameStop(a, b);

/** What is on screen, as far as the arrows care. */
export type Screen = {
  /** One of your threads, opened on the inbox. */
  thread: { product: string; id: string } | null;
  /** A teammate's thread, opened from your inbox. */
  card: { person: string; thread: string } | null;
  /** A chat opened from Needs you. */
  group: string | null;
  /** The tab of the list, while nothing is open over it. */
  list: View | null;
};

/** The arrows walk the inbox page, so they are drawn only there. */
export const onInboxPage = (s: Screen): boolean => !!s.thread || !!s.card || !!s.group || !!s.list;

export function stopOnScreen(s: Screen): Stop | null {
  if (s.thread) return { at: 'thread', product: s.thread.product, id: s.thread.id };
  if (s.card) return { at: 'card', person: s.card.person, thread: s.card.thread };
  if (s.group) return { at: 'group', id: s.group };
  if (s.list) return { at: 'list', view: s.list };
  return null;
}

/**
 * A place you went to. A thread is kept once, where you were in it last, so
 * two threads opened in turn are two steps back rather than a back and forth
 * for ever. A tab picked on the list is where you are on it, not a step.
 */
export function arrive(trail: Trail, stop: Stop): Trail {
  const here = trail.stops[trail.at];
  if (here && sameStop(here, stop)) return trail;
  if (here?.at === 'list' && stop.at === 'list') return land(trail, stop);
  // The place ahead, opened again by hand, keeps the way forward.
  const ahead = trail.stops[trail.at + 1];
  if (ahead && samePlace(ahead, stop)) return land({ stops: trail.stops, at: trail.at + 1 }, stop);
  const kept = trail.stops.slice(0, trail.at + 1).filter((s) => s.at === 'list' || !sameStop(s, stop));
  // A thread taken out from between two lists leaves one visit to the list.
  const joined = kept.filter((s, i) => !(s.at === 'list' && kept[i + 1]?.at === 'list'));
  const stops = [...joined, stop].slice(-TRAIL_LIMIT);
  return { stops, at: stops.length - 1 };
}

/** A step showed `stop` rather than the place it was going to, so that is the place it is on. */
export function land(trail: Trail, stop: Stop): Trail {
  const here = trail.stops[trail.at];
  if (!here || sameStop(here, stop)) return trail;
  const stops = trail.stops.slice();
  stops[trail.at] = stop;
  return { stops, at: trail.at };
}

/** The trail once `s` has stayed on screen. `step` is a back or forward on its
 *  way to `to`, and `reached` says whether its place was shown. */
export function settle(trail: Trail, s: Stop, step: { to: Stop; reached: boolean } | null): Trail {
  if (!step) return arrive(trail, s);
  if (!step.reached) return land(trail, s);
  return sameStop(step.to, s) ? trail : arrive(trail, s);
}

function step(trail: Trail, by: 1 | -1, here: Stop | null, exists: (s: Stop) => boolean): { trail: Trail; stop: Stop } | null {
  const standing = !!here && trail.at >= 0 && samePlace(trail.stops[trail.at], here);
  // A place not counted yet drops what is ahead once it is.
  if (by > 0 && here && !standing) return null;
  // From a place not counted yet, back goes first to where you were.
  for (let i = by < 0 && !standing ? trail.at : trail.at + by; i >= 0 && i < trail.stops.length; i += by) {
    const s = trail.stops[i];
    if (exists(s) && !(here && samePlace(s, here))) return { trail: { stops: trail.stops, at: i }, stop: s };
  }
  return null;
}

/** `here` is the place on screen. */
export const stepBack = (trail: Trail, here: Stop | null, exists: (s: Stop) => boolean = () => true) => step(trail, -1, here, exists);
export const stepForward = (trail: Trail, here: Stop | null, exists: (s: Stop) => boolean = () => true) => step(trail, 1, here, exists);

export type ThreadRef = { product: string; id: string };

/** The last thread of yours you stood on, once you have stood on `stop`. Kept
 *  apart from the trail, whose place can be a teammate's thread, which has no
 *  row in your list to wash. */
export function lastThreadAfter(last: ThreadRef | null, stop: Stop): ThreadRef | null {
  return stop.at === 'thread' ? { product: stop.product, id: stop.id } : last;
}

const stopKey = (s: Stop | null) => (s ? JSON.stringify(s) : '');

/** How long a place has to stay on screen before it counts as a visit. */
export const SETTLE_MS = 300;

/**
 * Hands on each place once it has stayed `wait` ms, so one that flashed past
 * on the way to the next (the list, as E closes threads one after another) is
 * not somewhere you were.
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
 * Records each place `here` names on the inbox page and walks back and
 * forward through them with ⌘[ and ⌘] (Ctrl off a Mac) and a mouse's side
 * buttons. `go` opens a stop; `exists` says whether one can still be opened.
 */
export function useBackAndForward({ on, inbox, here, go, exists }: {
  /** On a computer. */
  on: boolean;
  /** On the inbox page, the one place the arrows walk. */
  inbox: boolean;
  here: Stop | null;
  go: (stop: Stop) => void;
  exists: (stop: Stop) => boolean;
}) {
  const walking = on && inbox;
  const [trail, setTrail] = useState<Trail>(EMPTY_TRAIL);
  const [lastThread, setLastThread] = useState<ThreadRef | null>(null);
  const trailRef = useRef(trail);
  trailRef.current = trail;
  // The place a step is on its way to, so arriving there is not recorded as a
  // new visit, which would drop everything ahead of it.
  const stepping = useRef<{ to: Stop; reached: boolean } | null>(null);
  const live = useRef({ go, exists, here, walking });
  live.current = { go, exists, here, walking };

  const recorder = useRef<ReturnType<typeof settledPlaces> | null>(null);
  if (!recorder.current) {
    recorder.current = settledPlaces((s) => {
      setLastThread((was) => lastThreadAfter(was, s));
      const step = stepping.current;
      stepping.current = null;
      setTrail((t) => settle(t, s, step));
    });
  }
  useEffect(() => () => recorder.current?.stop(), []);

  const key = stopKey(here);
  useEffect(() => {
    if (!walking || !here) { recorder.current?.stop(); stepping.current = null; return; }
    const step = stepping.current;
    if (step && !step.reached && sameStop(step.to, here)) step.reached = true;
    recorder.current?.see(here);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, key]);

  const travel = useCallback((by: 1 | -1) => {
    const { walking, here, exists, go } = live.current;
    if (!walking) return;
    const next = by < 0 ? stepBack(trailRef.current, here, exists) : stepForward(trailRef.current, here, exists);
    if (!next) return;
    stepping.current = { to: next.stop, reached: false };
    setTrail(next.trail);
    go(next.stop);
  }, []);
  const back = useCallback(() => travel(-1), [travel]);
  const forward = useCallback(() => travel(1), [travel]);

  // Held on every page, since in a browser ⌘[ and the side buttons are the
  // tab's own Back, which leaves the app.
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
    backTo: walking ? stepBack(trail, here, exists)?.stop ?? null : null,
    forwardTo: walking ? stepForward(trail, here, exists)?.stop ?? null : null,
    lastThread: walking ? lastThread : null,
  };
}
