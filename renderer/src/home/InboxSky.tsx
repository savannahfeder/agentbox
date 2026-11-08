import { useLayoutEffect } from 'react';
import { drawSky, type SkyArt } from './sky';

/**
 * The Inbox's sky, approved 2026-11-08: the sky behind the header and a
 * faint one behind the foot of the list. Both lie under the rows, so the list
 * keeps every line. The header band is the foot band turned over, so the two
 * read as one sky (home.css .inbox-sky).
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
    const foot = make('inbox-sky-foot');
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
      for (const wrap of [foot, head]) Object.assign(wrap.style, { left: `${L}px`, top: `${T}px`, width: `${w}px`, height: `${h}px` });
      const start = Math.round(h - band);
      const c = foot.querySelector('canvas')!;
      drawSky(c, art, { from: start, span: 120, curveTop: start - 60, dpr: Math.min(2, window.devicePixelRatio || 1) });
      const c2 = head.querySelector('canvas')!;
      c2.width = c.width; c2.height = c.height;
      c2.getContext('2d')?.drawImage(c, 0, 0);
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    const ro = new ResizeObserver(later);
    ro.observe(host);
    // The card moves when the sidebar opens or folds, which changes the window's classes, not its size.
    const moved = new MutationObserver(later);
    moved.observe(host, { attributes: true, attributeFilter: ['class'] });
    return () => { ro.disconnect(); moved.disconnect(); if (frame) cancelAnimationFrame(frame); foot.remove(); head.remove(); };
  }, [art, band]);
  return null;
}
