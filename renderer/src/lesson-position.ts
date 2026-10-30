import { useLayoutEffect, useRef, useState, type DependencyList } from 'react';

type Position = { left: number; top: number };

export function lessonPosition(previous: Position | null, next: Position | null): Position | null {
  return previous?.left === next?.left && previous?.top === next?.top ? previous : next;
}

/**
 * Where the ↵ Open task plate sits, or null to hide it. It sets state only when
 * the place moved: React can still schedule a render for a set that changes
 * nothing, and when a loop elsewhere is running, that render is the one React
 * throws its update-depth error from, inside the commit, which empties the
 * whole window.
 */
export function useLessonPlace(measure: () => Position | null, deps: DependencyList): Position | null {
  const [at, setAt] = useState<Position | null>(null);
  const drawn = useRef(at);
  drawn.current = at;
  useLayoutEffect(() => {
    const next = lessonPosition(drawn.current, measure());
    if (next === drawn.current) return;
    drawn.current = next;
    setAt(next);
  }, deps);
  return at;
}
