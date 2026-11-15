import { useLayoutEffect } from 'react';
import { drawSky, type SkyArt } from './sky';

/**
 * The sky, laid over the main card (`.workspace-layout::before`) and under
 * everything on it. It goes in as the window's first child so the page's own
 * positioned layers paint over it in document order.
 *
 * `from` is where the dots begin, in px from the card's top.
 */
export function SkyBackdrop({ art, from = 0, span = 220 }: { art: SkyArt; from?: number; span?: number }) {
  useLayoutEffect(() => {
    const host = document.querySelector<HTMLElement>('.app.workspace-layout');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.className = 'home-sky';
    wrap.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    host.insertBefore(wrap, host.firstChild);
    let frame = 0;
    let last = '';
    const paint = () => {
      frame = 0;
      const b = getComputedStyle(host, '::before');
      const L = parseFloat(b.left) || 0, T = parseFloat(b.top) || 0, R = parseFloat(b.right) || 0, B = parseFloat(b.bottom) || 0;
      // Laid-out size: the first-run setup draws the whole app scaled down.
      const w = host.offsetWidth - L - R, h = host.offsetHeight - T - B;
      if (w <= 0 || h <= 0) return;
      const key = [L, T, w, h].join(',');
      if (key === last) return;
      last = key;
      Object.assign(wrap.style, { left: `${L}px`, top: `${T}px`, width: `${w}px`, height: `${h}px` });
      drawSky(canvas, art, { from, span, dpr: Math.min(2, window.devicePixelRatio || 1) });
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    const ro = new ResizeObserver(later);
    ro.observe(host);
    // The card moves when the sidebar opens or folds, which changes the window's classes, not its size.
    const moved = new MutationObserver(later);
    moved.observe(host, { attributes: true, attributeFilter: ['class'] });
    return () => { ro.disconnect(); moved.disconnect(); if (frame) cancelAnimationFrame(frame); wrap.remove(); };
  }, [art, from, span]);
  return null;
}
