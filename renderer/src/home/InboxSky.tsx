import { useLayoutEffect } from 'react';
import { drawSky, type SkyArt } from './sky';

/**
 * The Inbox's sky, approved 2026-11-08 (design 86): at full strength behind
 * the header and nowhere else, so the list keeps every line. The streak is
 * drawn at the card's foot and turned over (home.css .inbox-sky-head).
 */
export function InboxSky({ art, band = 190 }: { art: SkyArt; band?: number }) {
  useLayoutEffect(() => {
    const host = document.querySelector<HTMLElement>('.app.workspace-layout');
    if (!host) return;
    const make = (cls: string) => {
      const wrap = document.createElement('div');
      wrap.className = `home-sky inbox-sky ${cls}`;
      wrap.setAttribute('aria-hidden', 'true');
      wrap.appendChild(document.createElement('canvas'));
      host.insertBefore(wrap, host.firstChild);
      return wrap;
    };
    const head = make('inbox-sky-head');
    let frame = 0;
    let last = '';
    const paint = () => {
      frame = 0;
      const b = getComputedStyle(host, '::before');
      const hr = host.getBoundingClientRect();
      const L = parseFloat(b.left) || 0, T = parseFloat(b.top) || 0, R = parseFloat(b.right) || 0, B = parseFloat(b.bottom) || 0;
      const w = hr.width - L - R, h = hr.height - T - B;
      if (w <= 0 || h <= 0) return;
      const key = [L, T, w, h].join(',');
      if (key === last) return;
      last = key;
      Object.assign(head.style, { left: `${L}px`, top: `${T}px`, width: `${w}px`, height: `${h}px` });
      const start = Math.round(h - band);
      drawSky(head.querySelector('canvas')!, art, { from: start, span: 120, curveTop: start - 60, dpr: Math.min(2, window.devicePixelRatio || 1) });
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    const ro = new ResizeObserver(later);
    ro.observe(host);
    // The card moves when the sidebar opens or folds, which changes the window's classes, not its size.
    const moved = new MutationObserver(later);
    moved.observe(host, { attributes: true, attributeFilter: ['class'] });
    return () => { ro.disconnect(); moved.disconnect(); if (frame) cancelAnimationFrame(frame); head.remove(); };
  }, [art, band]);
  return null;
}
