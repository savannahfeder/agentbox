// THE TRAY'S MARK: the nine-dot lattice from the Agent Tray launch film
// (w-3133d503b1 v15, her pick: "I really like what we did with the nine dots.
// I actually think it looks way better than our current design").
//
// It is the app's own lattice (components/LiveMark.tsx: eight dots orbiting a
// centre, 1488ms in 186ms steps) with two things changed for the corner.
//
// THE CENTRE DOT IS ALWAYS FILLED, lit or resting. LiveMark leaves it a faint
// hole; in a 10px mark on a tag that read as a gap, and she called it wonky.
//
// AND IT DOES NOT TURN THE WHOLE TIME. The film turns it for as long as agents
// work, which is right for a film and wrong for a corner somebody is trying to
// work next to: "while agents are working, the eye should NOT be drawn to it".
// So it turns twice, 1856ms a turn, WHEN SOMETHING CHANGES, and settles still.
// Motion in this corner always means news; the rest of the time there is none.
// Her pick of three, 2026-10-13: "I agree with: 1. It turns, then it settles."
//
// AND IT IS ONE DRAWING ON A WHOLE-DEVICE-PIXEL PITCH. It was nine boxes in a
// grid, each snapped on its own, and twice the fix was whole POINTS for the dot
// and the gap. A point on a Mac in a scaled mode is 1.5 device pixels, so that
// never held there: the gaps rounded apart and the mark came out crooked, six
// times. Now it is one svg whose pitch is a whole number of DEVICE pixels, so
// every dot stands the same distance from a pixel boundary as every other and
// all nine are rasterised the same, wherever the mark's own corner lands.
import React, { useEffect, useState } from 'react';
import { latticeGrid } from '../../../shared/corner-tag.mjs';

// Which step of the orbit each dot takes, in reading order; null is the
// centre, which never joins in because it is never dim.
const ORBIT = [0, 1, 2, 7, null, 3, 6, 5, 4];

/** One turn of the orbit. The app's 1488ms, a quarter slower, because the
 *  corner is read out of the side of an eye rather than looked at. */
export const TURN_MS = 1856;
/** How many turns one piece of news is worth. */
export const TURNS = 2;

export type Says = { kind: string; count: number };
export type Move = 'pop' | 'stir' | 'none';

/**
 * What the mark does when the tag's words change. `before` is null the first
 * time, which is the tray appearing: it greets you rather than sitting dead.
 *
 * A count that goes UP is news you have not seen, so it pops. A count that
 * goes DOWN is news you have just dealt with, so it does nothing: answering
 * three threads should not flash at you three times.
 */
export function markMoves(before: Says | null, after: Says): Move {
  const ready = after.kind === 'ready';
  if (!before) return ready ? 'pop' : 'stir';
  if (ready && (before.kind !== 'ready' || after.count > before.count)) return 'pop';
  if (ready) return 'none';
  return before.kind !== after.kind || before.count !== after.count ? 'stir' : 'none';
}

/**
 * The mark. `lit` is the waiting state, where all nine dots are full and still.
 * `beat` changes with every move so the element is replaced and its animation
 * starts again from the top; nothing here runs a timer.
 */
export function Lattice({ box, lit, move, beat }: { box: number; lit: boolean; move: Move; beat: number }) {
  const how = `${lit ? ' is-waiting' : ''}${move === 'stir' && !lit ? ' is-turning' : ''}${move === 'pop' ? ' is-popping' : ''}`;
  const grid = latticeGrid(box, useScreenPixels());
  const dots = grid.dots;
  return (
    <svg
      key={beat}
      className={`ct-lat${how}`}
      viewBox={`0 0 ${grid.side} ${grid.side}`}
      style={{ width: `${grid.size}px`, height: `${grid.size}px` }}
      aria-hidden="true"
    >
      {ORBIT.map((step, i) => (
        <circle
          key={i}
          cx={dots[i].cx}
          cy={dots[i].cy}
          r={grid.dot / 2}
          className={step === null ? 'ct-heart' : undefined}
          style={step === null ? undefined : ({ '--p': step, '--r': i } as React.CSSProperties)}
        />
      ))}
    </svg>
  );
}

/**
 * How many device pixels this screen draws to the point, now. It changes when
 * the tag is dragged onto another monitor, and the mark has to be built again
 * from the new number, so the pitch stays whole there too.
 */
function useScreenPixels() {
  const [dpr, setDpr] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));
  useEffect(() => {
    let stop = () => {};
    const watch = () => {
      const now = window.devicePixelRatio || 1;
      setDpr(now);
      const m = window.matchMedia(`(resolution: ${now}dppx)`);
      const again = () => { stop(); watch(); };
      m.addEventListener('change', again);
      stop = () => m.removeEventListener('change', again);
    };
    watch();
    return () => stop();
  }, []);
  return dpr;
}
