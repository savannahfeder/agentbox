import { useLayoutEffect } from 'react';
import { paintSky, type SkyArt } from './sky';
import { followTheCard } from './sky-follows-the-card';
import { useSidebarShrinks } from '../sidebar-shrinks';
import { boxIn, flyBirds } from './birds';
import { frost } from './frost';

/** Home's words, kept clear of birds: the greeting down to the writing box, across the column. */
function homeWords(wrap: HTMLElement) {
  const col = boxIn(document.querySelector('.hm-col'), wrap, 24);
  const top = boxIn(document.querySelector('.hm-hello'), wrap, 24);
  const end = boxIn(document.querySelector('.hm-start'), wrap, 24);
  return col && top && end ? { x: col.x, y: top.y, w: col.w, h: end.y + end.h - top.y } : null;
}

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
    const soft = art.mountains ? frost(wrap, canvas) : null;
    const stop = followTheCard(host, wrap, canvas, {
      card: () => {
        const b = getComputedStyle(host, '::before');
        const L = parseFloat(b.left) || 0, T = parseFloat(b.top) || 0, R = parseFloat(b.right) || 0, B = parseFloat(b.bottom) || 0;
        // Laid-out size: the first-run setup draws the whole app scaled down.
        const w = host.offsetWidth - L - R, h = host.offsetHeight - T - B;
        return w > 0 && h > 0 ? { left: L, top: T, width: w, height: h } : null;
      },
      paint: () => ({ key: '', draw: () => {
        paintSky(canvas, art, { from, span, dpr: Math.min(2, window.devicePixelRatio || 1) });
        soft?.paint();
      } }),
    }, { folds });
    let land = () => {};
    if (art.birds) {
      const birds = document.createElement('div');
      birds.className = 'home-birds';
      wrap.appendChild(birds);
      // Under the first page, which covers Home and has birds of its own, they wait.
      land = flyBirds(birds, { ink: art.birds, sky: (_W, H) => {
        if (document.querySelector('.ob-welcome')) return null;
        soft?.fit();
        return { top: H * 0.06, bottom: H * 0.42, avoid: homeWords(wrap) };
      } });
    }
    return () => { land(); soft?.stop(); stop(); wrap.remove(); };
  }, [art, from, span, folds]);
  return null;
}
