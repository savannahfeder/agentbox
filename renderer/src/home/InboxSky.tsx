import { useLayoutEffect } from 'react';
import { drawSky, type SkyArt } from './sky';

/** How much of the card the sky takes. `head` is the list's: behind the
 *  header and nowhere else. The rest are for the empty Inbox, which has no
 *  rows to keep clear. */
export type SkyShape = 'head' | 'tall' | 'full' | 'dim' | 'frame' | 'foot';

/**
 * The Inbox's sky, approved 2026-11-08 (design 86): at full strength behind
 * the header and nowhere else, so the list keeps every line. The streak is
 * drawn at the card's foot and turned over (home.css .inbox-sky-head).
 */
export function InboxSky({ art, band = 190, shape = 'head', below = false, low = false }: { art: SkyArt; band?: number; shape?: SkyShape; below?: boolean; low?: boolean }) {
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
    const head = make(shape === 'head' ? 'inbox-sky-head' : `inbox-sky-zero inbox-sky-${shape}`);
    host.style.setProperty('--sky-under', art.bg);
    let frame = 0;
    let last = '';
    const paint = () => {
      frame = 0;
      const b = getComputedStyle(host, '::before');
      const hr = host.getBoundingClientRect();
      const L = parseFloat(b.left) || 0, T = parseFloat(b.top) || 0, R = parseFloat(b.right) || 0, B = parseFloat(b.bottom) || 0;
      const w = hr.width - L - R, h = hr.height - T - B;
      if (w <= 0 || h <= 0) return;
      const box = low ? document.querySelector('.th-start .th-clear-compose') : null;
      const boxFoot = box ? Math.round(box.getBoundingClientRect().bottom - hr.top - T) : 0;
      const key = [L, T, w, h, boxFoot].join(',');
      if (key === last) return;
      last = key;
      Object.assign(head.style, { left: `${L}px`, top: `${T}px`, width: `${w}px`, height: `${h}px` });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const canvas = head.querySelector('canvas')!;
      if (low && boxFoot > 0) { drawSky(canvas, art, { from: 40, span: 300, curveTop: boxFoot + 24, dpr }); return; }
      if (shape === 'full' || shape === 'dim') {
        const h2 = below ? document.querySelector('.th-start h2') : null;
        const under = h2 ? Math.round(h2.getBoundingClientRect().bottom - hr.top - T) : 0;
        if (under > 0) drawSky(canvas, art, { from: under + 8, span: 160, curveTop: under - 40, dpr });
        else drawSky(canvas, art, { from: 40, span: 300, dpr });
        return;
      }
      const tall = Math.round(h * 0.42);
      const reach = shape === 'head' ? band : tall;
      const start = Math.round(h - reach);
      drawSky(canvas, art, { from: start, span: shape === 'head' ? 120 : 260, curveTop: start - (shape === 'head' ? 60 : 120), dpr });
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    const settle = below ? setTimeout(() => { last = ''; later(); }, 400) : 0;
    const ro = new ResizeObserver(later);
    ro.observe(host);
    // The box lands in the page after the sky is first drawn.
    const page = low ? document.querySelector('.th-start .th-clear-compose') : null;
    if (page) ro.observe(page);
    // The card moves when the sidebar opens or folds, which changes the window's classes, not its size.
    const moved = new MutationObserver(later);
    moved.observe(host, { attributes: true, attributeFilter: ['class'] });
    return () => { clearTimeout(settle); ro.disconnect(); moved.disconnect(); if (frame) cancelAnimationFrame(frame); head.remove();
      // The list's sky and the empty page's can be up together.
      if (!host.querySelector(':scope > .inbox-sky')) host.style.removeProperty('--sky-under'); };
  }, [art, band, shape, below, low]);
  return null;
}
