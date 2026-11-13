// THE FIRST PAGE'S SKY, drawn as in the approved design (first-page/3-sky): one
// band from the bottom left up through the right, a dot now and then flaring as
// an agent finishes. Dark orange on a Mac in dark mode, light green in light.

import { useEffect, useRef } from 'react';

type RGB = [number, number, number];
const DARK = { core: [250, 92, 28] as RGB, halo: [30, 92, 175] as RGB, hot: [140, 150, 90] as RGB, flare: '255,190,150' };
const LIGHT = { core: [40, 160, 125] as RGB, halo: [70, 135, 190] as RGB, hot: [170, 215, 120] as RGB, flare: '30,140,105' };
const STEP = 9;
/** About fifteen frames a second: the twinkle is slow, and a full-rate loop starved slow machines. */
const FRAME_MS = 66;

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The same random dots on every draw, so the band does not shimmer when the window resizes. */
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export interface BandDot { x: number; y: number; n: number; ph: number; i: number; core: number }

/** The grid's dots that fall in the band, with how bright and how near its core each is. */
export function skyBand(W: number, H: number): BandDot[] {
  const R = seeded(5);
  const out: BandDot[] = [];
  for (let y = 4; y < H; y += STEP) for (let x = 4; x < W; x += STEP) {
    const n = R(), ph = R() * 6.28;
    const u = x / W, v = y / H;
    const dist = v - (1.05 - u * 0.95 + Math.sin(u * 3.1) * 0.07);
    const core = Math.exp(-((dist / 0.035) ** 2)), halo = Math.exp(-((dist / 0.22) ** 2));
    // Clear of the words on the left.
    const i = (core * 0.95 + halo * 0.35) * Math.min(1, Math.max(0, (u - 0.38) / 0.3));
    if (i >= 0.03) out.push({ x, y, n, ph, i, core });
  }
  return out;
}

export function WelcomeSky({ dark }: { dark: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    // Off the GPU: a headless browser with none hung waiting on every frame.
    const g = c?.getContext('2d', { willReadFrequently: true });
    if (!c || !g) return;
    const ink = dark ? DARK : LIGHT;
    let W = 0, H = 0;
    let dots: (BandDot & { col: string })[] = [];
    const size = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = c.clientWidth; H = c.clientHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = skyBand(W, H).map((d) => {
        const mix = Math.min(1, d.core * 1.4);
        const col = [0, 1, 2].map((k) => Math.round(ink.halo[k] * (1 - mix) + ink.core[k] * mix * 0.85 + ink.hot[k] * mix * 0.15));
        return { ...d, col: col.join(',') };
      });
    };
    const draw = (t: number) => {
      g.clearRect(0, 0, W, H);
      for (const d of dots) {
        const tw = 0.55 + 0.45 * Math.sin(t * (1.2 + d.n * 2.4) + d.ph);
        const flare = d.n > 0.995 ? Math.max(0, Math.sin(t * 0.9 + d.ph * 3)) ** 12 : 0;
        const a = Math.min(1, d.i * tw + flare);
        g.fillStyle = flare > 0.2 ? `rgba(${ink.flare},${a})` : `rgba(${d.col},${a})`;
        const s = 1.1 + d.core * 1.3 + flare * 2;
        g.fillRect(d.x - s, d.y - s, s * 2, s * 2);
      }
    };
    size();
    draw(0);
    const still = reduced();
    let timer = 0;
    const tick = () => {
      if (!document.hidden) draw(performance.now() / 1000);
      timer = window.setTimeout(tick, FRAME_MS);
    };
    if (!still) timer = window.setTimeout(tick, FRAME_MS);
    const resized = () => { size(); draw(still ? 0 : performance.now() / 1000); };
    addEventListener('resize', resized);
    return () => { clearTimeout(timer); removeEventListener('resize', resized); };
  }, [dark]);

  return <div className="ob-sky" aria-hidden="true"><canvas ref={canvas} /></div>;
}
