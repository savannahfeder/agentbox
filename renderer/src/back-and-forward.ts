import { useCallback, useEffect, useRef, useState } from 'react';

/** A thread the arrows can take you back to. Pages are not on the trail. */
export type Stop =
  | { at: 'thread'; product: string; id: string }
  /** A teammate's thread, which is a card from their Mac rather than one of your rows. */
  | { at: 'card'; person: string; thread: string };

/** `at` is the thread on screen, or the one you were in last while the list is. */
export type Trail = { stops: Stop[]; at: number };

export const EMPTY_TRAIL: Trail = { stops: [], at: -1 };
export const TRAIL_LIMIT = 50;

export function sameStop(a: Stop, b: Stop): boolean {
  if (a.at === 'thread' && b.at === 'thread') return a.product === b.product && a.id === b.id;
  if (a.at === 'card' && b.at === 'card') return a.person === b.person && a.thread === b.thread;
  return false;
}

/** What is on screen, as far as the arrows care. */
export type Screen = {
  /** One of your threads, opened on the inbox. */
  thread: { product: string; id: string } | null;
  /** A teammate's thread, opened from your inbox. */
  card: { person: string; thread: string } | null;
  /** The inbox with no thread open, in any of its tabs. */
  inbox: boolean;
};

/** The arrows walk threads, so they are drawn only where you go between them. */
export const onInboxPage = (s: Screen): boolean => !!s.thread || !!s.card || s.inbox;

export function stopOnScreen(s: Screen): Stop | null {
  if (s.thread) return { at: 'thread', product: s.thread.product, id: s.thread.id };
  if (s.card) return { at: 'card', person: s.card.person, thread: s.card.thread };
  return null;
}

/** A thread you opened. One you were in before moves up to here, so two
 *  threads visited in turn are two steps back, not a back and forth. */
export function arrive(trail: Trail, stop: Stop): Trail {
  const last = trail.stops[trail.at];
  if (last && sameStop(last, stop)) return trail;
  const before = trail.stops.slice(0, trail.at + 1).filter((s) => !sameStop(s, stop));
  const stops = [...before, stop].slice(-TRAIL_LIMIT);
  return { stops, at: stops.length - 1 };
}

function step(trail: Trail, by: 1 | -1, here: Stop | null, exists: (s: Stop) => boolean): { trail: Trail; stop: Stop } | null {
  const standing = !!here && trail.at >= 0 && sameStop(trail.stops[trail.at], here);
  // A thread not counted yet drops what is ahead once it is.
  if (by > 0 && here && !standing) return null;
  // From the list, back goes first to the thread you were in last.
  for (let i = by < 0 && !standing ? trail.at : trail.at + by; i >= 0 && i < trail.stops.length; i += by) {
    const s = trail.stops[i];
    if (exists(s) && !(here && sameStop(s, here))) return { trail: { stops: trail.stops, at: i }, stop: s };
  }
  return null;
}

/** `here` is the thread on screen, or null on the list. */
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

/** How long a thread has to stay on screen before it counts as a visit. */
export const SETTLE_MS = 300;

/**
 * Hands on each thread once it has stayed `wait` ms, so one that flashed past
 * on the way to the next (E closing threads one after another) is not
 * somewhere you were.
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
 * Records each thread `here` names on the inbox page and walks back and
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
  // The thread a step is on its way to, so arriving there is not recorded as a
  // new visit (which would drop everything ahead of it).
  const travelling = useRef<Stop | null>(null);
  const live = useRef({ go, exists, here, walking });
  live.current = { go, exists, here, walking };

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
    if (!walking || !here) { recorder.current?.stop(); return; }
    recorder.current?.see(here);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, key]);

  const travel = useCallback((by: 1 | -1) => {
    const { walking, here, exists, go } = live.current;
    if (!walking) return;
    const next = by < 0 ? stepBack(trailRef.current, here, exists) : stepForward(trailRef.current, here, exists);
    if (!next) return;
    travelling.current = next.stop;
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
