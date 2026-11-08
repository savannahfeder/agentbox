import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { fitPicture, PictureMissing } from '../fit-picture';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  /** Fill the place and crop, as a Files cover does, rather than fit its width. */
  cover?: boolean;
  /** The tallest the picture is ever drawn, in points, where a style caps it. */
  maxHeight?: number;
  /** The copy is never narrower than this, so a pane widened later still draws it sharp. */
  minWidth?: number;
};

// The pane the picture scrolls in: an observer on the page alone would count a
// picture clipped by the pane as out of view however close it is.
function scrollerOf(el: Element): Element | null {
  for (let at = el.parentElement; at; at = at.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(at).overflowY)) return at;
  }
  return null;
}

/**
 * An <img> drawn from a copy the size of its place (../fit-picture.ts). The
 * place is held by a placeholder carrying the picture's own classes, so every
 * layout's size rules apply to it and its measured width is the widest the
 * picture will be drawn. If no copy can be made, `src` itself is drawn, so a
 * missing file still reaches its own onError. `data-full` keeps the original
 * for the full-screen viewer.
 */
export function FittedImg({ src, cover = false, maxHeight, minWidth = 0, ...img }: Props) {
  const place = useRef<HTMLImageElement | null>(null);
  const [room, setRoom] = useState<{ width: number; height?: number } | null>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState<{ for: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (room) return;
    const el = place.current;
    const measured = el?.clientWidth ?? 0;
    const width = Math.max(measured, minWidth, 1);
    const grown = measured > 0 ? width / measured : 1;
    setRoom({ width, height: cover ? Math.max((el?.clientHeight ?? 0) * grown, 1) : maxHeight });
  });
  // Made when it comes within a screen of view, so a thread opened at its end
  // draws what is on screen first and the pictures far above cost nothing yet.
  useEffect(() => {
    const el = place.current;
    if (near || !el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const watch = new IntersectionObserver((seen) => { if (seen.some((s) => s.isIntersecting)) setNear(true); },
      { root: scrollerOf(el), rootMargin: '100% 0px' });
    watch.observe(el);
    return () => watch.disconnect();
  }, [near]);
  useEffect(() => {
    if (!room || !near) return;
    let live = true;
    let made: string | null = null;
    fitPicture(src, { ...room, cover })
      .then((r) => { made = r.url; if (live) setDrawn({ for: src, url: r.url }); else URL.revokeObjectURL(r.url); })
      .catch((err) => {
        if (!live) return;
        // Nothing there: the caller's next place is tried now, not after a second load fails.
        if (err instanceof PictureMissing && img.onError) img.onError(undefined as never);
        else setFailed(src);
      });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [src, room, near, cover]);
  if (failed === src) return <img {...img} src={src} />;
  if (drawn?.for !== src) {
    // An empty picture holding the place: what draws it, and the viewer, read `data-full`.
    const { onError: _e, onLoad: _l, alt: _a, ...still } = img;
    return <img {...still} ref={place} className={`${img.className ?? ''} arriving`} alt="" aria-hidden="true" data-full={src} />;
  }
  return <img {...img} src={drawn.url} data-full={src} />;
}
