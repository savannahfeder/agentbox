// THE FIRST PAGE'S SKY: the sky the setup goes on to wear, its band running up
// the right of the window, with now and then a dot flaring as an agent finishes.

import { useEffect, useRef } from 'react';
import { drawSky, skyTheme } from '../home/sky';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function WelcomeSky({ dark }: { dark: boolean }) {
  const sky = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  const theme = skyTheme(dark ? 'ember' : 'sage');

  useEffect(() => {
    const c = sky.current;
    if (!c || !theme) return;
    // From the bottom left up through the right, so the words on the left stand clear.
    const art = { ...theme.art, y0: 1.08, y1: 0.02, bend: 0.14 };
    const paint = () => drawSky(c, art, { from: 0, span: 1 });
    paint();
    addEventListener('resize', paint);
    return () => removeEventListener('resize', paint);
  }, [theme]);

  useEffect(() => {
    const c = sparks.current;
    if (!c || reduced()) return;
    const g = c.getContext('2d');
    if (!g) return;
    let frame = 0;
    const colour = dark ? '255,190,150' : '30,140,105';
    const draw = (now: number) => {
      const W = c.clientWidth, H = c.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const t = now / 1000;
      for (let i = 0; i < 14; i++) {
        // Each spark lives on the band for a few seconds, at a place that moves on every cycle.
        const cycle = 3.2 + (i % 5) * 0.7, k = Math.floor((t + i * 1.9) / cycle), p = ((t + i * 1.9) % cycle) / cycle;
        const u = 0.5 + ((Math.sin(k * 12.9898 + i * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.5;
        const y = (1.08 + (0.02 - 1.08) * u + 0.14 * u * (1 - u)) * H + Math.sin(k * 3.1 + i) * 14;
        const a = Math.max(0, Math.sin(p * Math.PI)) ** 3;
        if (a < 0.02) continue;
        g.fillStyle = `rgba(${colour},${a})`;
        const s = 1.6 + a * 1.4;
        g.fillRect(u * W - s, y - s, s * 2, s * 2);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [dark]);

  if (!theme) return null;
  return (
    <div className="ob-sky" aria-hidden="true">
      <canvas ref={sky} className="ob-sky-art" />
      <canvas ref={sparks} className="ob-sky-sparks" />
      <div className="ob-sky-veil" />
    </div>
  );
}
