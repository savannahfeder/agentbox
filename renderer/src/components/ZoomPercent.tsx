// The zoom percentage, in the corner, briefly.
//
// So this draws ONE thing: the number. The drawing she turned down was a
// centred pill reading "91% ⌘0 for 100%"; the hint text and the middle of the
// screen are both out. Nothing here is clickable and nothing has to be
// dismissed, which is the point of a readout that leaves on its own.

import { useEffect, useState } from 'react';

// How long it stays. A browser holds its own for a beat and goes; long enough
// to read one number, short enough that a second press never queues behind it.
const HOLD_MS = 1300;

export function ZoomPercent() {
  // The stamp is what makes a repeat press restart the clock rather than let
  // the first press's timer hide a number she has just changed again.
  const [shown, setShown] = useState<{ percent: number; stamp: number } | null>(null);
  const [up, setUp] = useState(false);

  useEffect(() => {
    let stamp = 0;
    const off = (window.zero as any)?.onZoomPercent?.((payload: { percent?: number }) => {
      const percent = Number(payload?.percent);
      if (!Number.isFinite(percent)) return;
      setShown({ percent, stamp: ++stamp });
    }) ?? (() => {});
    return off;
  }, []);

  useEffect(() => {
    if (!shown) return;
    setUp(true);
    const t = setTimeout(() => setUp(false), HOLD_MS);
    return () => clearTimeout(t);
  }, [shown]);

  // Stays mounted once it has spoken, so the fade out has something to fade.
  if (!shown) return null;
  return <div className={`zoom-readout${up ? ' up' : ''}`}>{shown.percent}%</div>;
}
