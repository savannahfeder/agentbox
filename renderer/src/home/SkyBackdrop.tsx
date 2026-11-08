import { useLayoutEffect } from 'react';
import { drawSky, type SkyArt } from './sky';

/**
 * The sky, laid over the main card (`.workspace-layout::before`) and under
 * everything on it. It goes in as the window's first child so the page's own
 * positioned layers paint over it in document order.
 *
 * `from` is where the dots begin, in px from the card's top; `below` instead
 * starts them `gap` px under the lowest element it matches, and follows the
 * page as rows come and go. However long the list, the last `band` px of the
 * card stay sky; the rows fade out above it (home.css).
 */
export function SkyBackdrop({ art, from, below, gap = 30, span = 220, band = 220 }: {
  art: SkyArt; from?: number; below?: string; gap?: number; span?: number; band?: number;
}) {
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
      const hr = host.getBoundingClientRect();
      const L = parseFloat(b.left) || 0, T = parseFloat(b.top) || 0, R = parseFloat(b.right) || 0, B = parseFloat(b.bottom) || 0;
      const w = hr.width - L - R, h = hr.height - T - B;
      if (w <= 0 || h <= 0) return;
      const lowest = below ? Math.max(0, ...[...host.querySelectorAll(below)].map((e) => e.getBoundingClientRect().bottom)) : 0;
      const start = below ? Math.min(Math.round((lowest || hr.top + T) - hr.top - T + gap), Math.round(h - band)) : (from ?? 0);
      const key = [L, T, w, h, start].join(',');
      if (key === last) return;
      last = key;
      Object.assign(wrap.style, { left: `${L}px`, top: `${T}px`, width: `${w}px`, height: `${h}px` });
      drawSky(canvas, art, { from: start, span, dpr: Math.min(2, window.devicePixelRatio || 1) });
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    const ro = new ResizeObserver(later);
    ro.observe(host);
    const pane = host.querySelector('.list-pane');
    const mo = below && pane ? new MutationObserver(later) : null;
    if (mo && pane) mo.observe(pane, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo?.disconnect(); if (frame) cancelAnimationFrame(frame); wrap.remove(); };
  }, [art, from, below, gap, span, band]);
  return null;
}
