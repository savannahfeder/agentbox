import { useLayoutEffect } from 'react';
import { paintSky, type SkyArt } from './sky';
import { followTheCard } from './sky-follows-the-card';
import { useSidebarShrinks } from '../sidebar-shrinks';

/**
 * The sky, laid over the main card (`.workspace-layout::before`) and under
 * everything on it. It goes in as the window's first child so the page's own
 * positioned layers paint over it in document order.
 *
 * `from` is where the dots begin, in px from the card's top.
 */
export function SkyBackdrop({ art, from = 0, span = 220 }: { art: SkyArt; from?: number; span?: number }) {
  const folds = useSidebarShrinks();
  useLayoutEffect(() => {
    const host = document.querySelector<HTMLElement>('.app.workspace-layout');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.className = 'home-sky';
    wrap.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    host.insertBefore(wrap, host.firstChild);
    const stop = followTheCard(host, wrap, canvas, {
      card: () => {
        const b = getComputedStyle(host, '::before');
        const L = parseFloat(b.left) || 0, T = parseFloat(b.top) || 0, R = parseFloat(b.right) || 0, B = parseFloat(b.bottom) || 0;
        // Laid-out size: the first-run setup draws the whole app scaled down.
        const w = host.offsetWidth - L - R, h = host.offsetHeight - T - B;
        return w > 0 && h > 0 ? { left: L, top: T, width: w, height: h } : null;
      },
      paint: () => ({ key: '', draw: () => paintSky(canvas, art, { from, span, dpr: Math.min(2, window.devicePixelRatio || 1) }) }),
    }, { folds });
    return () => { stop(); wrap.remove(); };
  }, [art, from, span, folds]);
  return null;
}
