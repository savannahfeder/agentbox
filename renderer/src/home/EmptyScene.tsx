import { useLayoutEffect } from 'react';
import { releaseCanvas, type SkyArt } from './sky';
import { drawMountains } from './mountains';
import { followTheCard } from './sky-follows-the-card';
import { useSidebarShrinks } from '../sidebar-shrinks';
import { boxIn, flyBirds } from './birds';
import { EMPTY_INBOX_BIRDS, EMPTY_INBOX_SKY, emptyInboxHills } from './empty-inbox-scene';

/** The heading down to the writing box, in `wrap`'s px. */
function words(wrap: HTMLElement) {
  const page = document.querySelector('.th-start');
  const a = boxIn(page?.querySelector('h2') ?? null, wrap, 24), b = boxIn(page?.querySelector('.th-clear-compose') ?? null, wrap, 24);
  if (!a || !b) return null;
  const x = Math.min(a.x, b.x);
  return { x, y: a.y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: b.y + b.h - a.y };
}

/**
 * The empty Inbox under a sky with mountains: Home's ranges and birds over the
 * whole card, clear of the heading and the writing box. The `inbox-sky-zero`
 * class draws the words over it in full ink (home.css).
 */
export function EmptyScene({ art }: { art: SkyArt }) {
  const folds = useSidebarShrinks();
  useLayoutEffect(() => {
    const host = document.querySelector<HTMLElement>('.app.workspace-layout');
    const base = art.mountains;
    if (!host || !base) return;
    const wrap = document.createElement('div');
    wrap.className = 'home-sky inbox-sky-zero';
    wrap.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    host.insertBefore(wrap, host.firstChild);
    const box = document.querySelector('.th-clear-compose');
    const stop = followTheCard(host, wrap, canvas, {
      card: () => {
        const b = getComputedStyle(host, '::before');
        const L = parseFloat(b.left) || 0, T = parseFloat(b.top) || 0, R = parseFloat(b.right) || 0, B = parseFloat(b.bottom) || 0;
        const w = host.offsetWidth - L - R, h = host.offsetHeight - T - B;
        return w > 0 && h > 0 ? { left: L, top: T, width: w, height: h } : null;
      },
      paint: (_card, reach) => {
        const seen = words(wrap);
        // The drawing reaches `reach` px left of the card when the sidebar can fold.
        const at = seen && { ...seen, x: seen.x + reach };
        return {
          key: JSON.stringify(at && [at.x, at.y, at.w, at.h].map(Math.round)),
          draw: () => {
            const W = canvas.clientWidth, H = canvas.clientHeight;
            if (W && H) drawMountains(canvas, emptyInboxHills(base, at, W, H), { dpr: Math.min(2, window.devicePixelRatio || 1), ground: art.bg, foot: art.foot });
          },
        };
      },
    }, { folds, watch: box ? [box] : [] });
    let land = () => {};
    if (art.birds) {
      const birds = document.createElement('div');
      birds.className = 'home-birds';
      wrap.appendChild(birds);
      land = flyBirds(birds, { ink: art.birds, n: EMPTY_INBOX_BIRDS, sky: (_W, H) => ({ top: H * EMPTY_INBOX_SKY.top, bottom: H * EMPTY_INBOX_SKY.bottom, avoid: words(wrap) }) });
    }
    return () => { land(); stop(); wrap.remove(); releaseCanvas(canvas); };
  }, [art, folds]);
  return null;
}
