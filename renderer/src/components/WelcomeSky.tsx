// THE FIRST PAGE'S SKY: the website's dithered mountains, drawn once per size,
// with its birds flying above them (design w-9687db6270, first-screen-5).
// Orange on white in the light, on the warm dark grey in the dark.

import { useEffect, useRef } from 'react';
import { drawMountains, type Mountains } from '../home/mountains';
import { boxIn, flyBirds } from '../home/birds';

const QUIET = { x: 0.5, y: 0.62, rx: 0.3, ry: 0.14 };
const LIGHT: Mountains = { inks: [[238, 96, 24], [240, 112, 46], [242, 128, 70], [244, 146, 96]], alpha: 0.5, lift: 0.9, at: 40, quiet: QUIET };
const DARK: Mountains = { inks: [[250, 92, 28], [214, 84, 34], [168, 78, 44], [118, 70, 52]], alpha: 0.62, lift: 0.9, at: 40, quiet: QUIET };
/** How long the window holds still before the mountains are drawn again at its new size. */
const STILL_MS = 150;

export function WelcomeSky({ dark }: { dark: boolean }) {
  const land = useRef<HTMLCanvasElement>(null);
  const air = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ground = land.current, sky = air.current;
    if (!ground || !sky) return;
    const draw = () => drawMountains(ground, dark ? DARK : LIGHT, { dpr: Math.min(2, devicePixelRatio || 1) });
    draw();
    let wait = 0;
    const resized = () => { clearTimeout(wait); wait = window.setTimeout(draw, STILL_MS); };
    addEventListener('resize', resized);
    const stop = flyBirds(sky, { ink: dark ? [250, 110, 50] : [238, 96, 24], sky: (_W, H) => ({ top: H * 0.08, bottom: H * 0.5, avoid: boxIn(document.querySelector('.ob-welcome .ob-hero'), sky, 24) }) });
    return () => { stop(); clearTimeout(wait); removeEventListener('resize', resized); };
  }, [dark]);

  return <div className="ob-sky" aria-hidden="true"><canvas ref={land} /><div ref={air} /></div>;
}
