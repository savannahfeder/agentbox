import { useLayoutEffect } from 'react';
import { paintSky, type Box, type SkyArt } from './sky';
import { followTheCard } from './sky-follows-the-card';
import { useSidebarShrinks } from '../sidebar-shrinks';

/**
 * The Inbox's sky, approved 2026-11-08 (design 86): at full strength behind
 * the header and nowhere else, so the list keeps every line. The streak is
 * drawn at the card's foot and turned over (home.css .inbox-sky-head).
 *
 * `zero` is the empty Inbox's (2026-11-13): it has no rows to keep clear, so
 * it is Home's sky, drawn where Home draws it, over the whole card, its line
 * turned down behind the heading and the writing box.
 */
export function InboxSky({ art, band = 190, shape = 'head' }: { art: SkyArt; band?: number; shape?: 'head' | 'zero' }) {
  const folds = useSidebarShrinks();
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
    const page = shape === 'zero' ? document.querySelector('.th-start') : null;
    const box = page?.querySelector('.th-clear-compose') ?? null;
    host.style.setProperty('--sky-under', art.bg);
    const canvas = head.querySelector('canvas')!;
    // The writing box lands in its slot after the sky is first drawn.
    const watch = box ? [box] : [];
    const stop = followTheCard(host, head, canvas, {
      card: () => {
        const b = getComputedStyle(host, '::before');
        const hr = host.getBoundingClientRect();
        const L = parseFloat(b.left) || 0, T = parseFloat(b.top) || 0, R = parseFloat(b.right) || 0, B = parseFloat(b.bottom) || 0;
        const w = hr.width - L - R, h = hr.height - T - B;
        return w > 0 && h > 0 ? { left: L, top: T, width: w, height: h } : null;
      },
      paint: (card, reach) => {
        const hr = host.getBoundingClientRect();
        // The heading and the writing box, in the drawing's own pixels.
        const words = (): Box | null => {
          const parts = [page?.querySelector('h2'), box].map((e) => e?.getBoundingClientRect()).filter((r): r is DOMRect => !!r && r.height > 0);
          if (!parts.length) return null;
          const x = Math.min(...parts.map((r) => r.left)), y = Math.min(...parts.map((r) => r.top));
          const x2 = Math.max(...parts.map((r) => r.right)), y2 = Math.max(...parts.map((r) => r.bottom));
          return { x: Math.round(x - hr.left - card.left + reach), y: Math.round(y - hr.top - card.top), w: Math.round(x2 - x), h: Math.round(y2 - y) };
        };
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        return {
          key: JSON.stringify(words()),
          draw: () => {
            if (shape === 'zero') { paintSky(canvas, art, { from: 40, span: 300, dpr, quiet: words() }); return; }
            const start = Math.round(card.height - band);
            paintSky(canvas, art, { from: start, span: 120, curveTop: start - 60, dpr });
          },
        };
      },
    }, { watch, folds });
    return () => {
      stop(); head.remove();
      // The list's sky and the empty page's can be up together.
      if (!host.querySelector(':scope > .inbox-sky')) host.style.removeProperty('--sky-under');
    };
  }, [art, band, shape, folds]);
  return null;
}
