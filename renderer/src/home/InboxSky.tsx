import { useLayoutEffect } from 'react';
import { drawSky, emptyInboxSky, type SkyArt } from './sky';

/**
 * The Inbox's sky, approved 2026-11-08 (design 86): at full strength behind
 * the header and nowhere else, so the list keeps every line. The streak is
 * drawn at the card's foot and turned over (home.css .inbox-sky-head).
 *
 * `zero` is the empty Inbox's (approved 2026-11-13): it has no rows to keep
 * clear, so it covers the whole card with the streak under the writing box.
 */
export function InboxSky({ art, band = 190, shape = 'head' }: { art: SkyArt; band?: number; shape?: 'head' | 'zero' }) {
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
    const head = make(shape === 'zero' ? 'inbox-sky-zero' : 'inbox-sky-head');
    const box = shape === 'zero' ? document.querySelector('.th-start .th-clear-compose') : null;
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
      const boxRect = box?.getBoundingClientRect();
      const boxFoot = boxRect?.height ? Math.round(boxRect.bottom - hr.top - T) : 0;
      const key = [L, T, w, h, boxFoot].join(',');
      if (key === last) return;
      last = key;
      Object.assign(head.style, { left: `${L}px`, top: `${T}px`, width: `${w}px`, height: `${h}px` });
      const canvas = head.querySelector('canvas')!;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (shape === 'zero') { drawSky(canvas, art, { ...emptyInboxSky(boxFoot, h), dpr }); return; }
      const start = Math.round(h - band);
      drawSky(canvas, art, { from: start, span: 120, curveTop: start - 60, dpr });
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    const ro = new ResizeObserver(later);
    ro.observe(host);
    // The writing box lands in its slot after the sky is first drawn.
    if (box) ro.observe(box);
    // The card moves when the sidebar opens or folds, which changes the window's classes, not its size.
    const moved = new MutationObserver(later);
    moved.observe(host, { attributes: true, attributeFilter: ['class'] });
    return () => {
      ro.disconnect(); moved.disconnect(); if (frame) cancelAnimationFrame(frame); head.remove();
      // The list's sky and the empty page's can be up together.
      if (!host.querySelector(':scope > .inbox-sky')) host.style.removeProperty('--sky-under');
    };
  }, [art, band, shape]);
  return null;
}
