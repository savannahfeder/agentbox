import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { fitPicture, PictureMissing } from '../fit-picture';
import { pictureUrl, wholePicturePath } from '../picture';
import { isImagePath } from '../../../shared/referenced-files.mts';

let inlineWidth = 760;

/** The pictures `text` draws by their full paths, in order, once each. */
export function picturesNamedIn(text: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const m of String(text ?? '').matchAll(/!\[[^\]]*\]\(<?([^)>\s]+)>?\)/g)) {
    let whole: string | null = null;
    try { whole = wholePicturePath(m[1]); } catch { continue; }
    if (whole && /^(\/|[A-Za-z]:[\\/])/.test(whole) && isImagePath(whole)) out.add(whole);
  }
  return [...out];
}

/** Makes the copies a thread will draw these pictures from, before it is opened. */
export function warmPictures(paths: string[], signal: AbortSignal) {
  for (const path of paths) {
    fitPicture(pictureUrl(path), { width: inlineWidth }, undefined, signal, () => false).then((r) => URL.revokeObjectURL(r.url), () => {});
  }
}

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
  const onScreen = useRef(false);
  const [drawn, setDrawn] = useState<{ for: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // The open button around it holds the column's width while it waits (styles.css);
  // before the room is measured below, so the measure is of that width.
  const waiting = failed !== src && drawn?.for !== src;
  useLayoutEffect(() => {
    const door = waiting ? place.current?.parentElement : null;
    if (!door?.classList.contains('inline-image-open')) return;
    door.setAttribute('data-picture-arriving', '');
    return () => door.removeAttribute('data-picture-arriving');
  }, [waiting]);
  useLayoutEffect(() => {
    if (room) return;
    const el = place.current;
    const measured = el?.clientWidth ?? 0;
    const width = Math.max(measured, minWidth, 1);
    const grown = measured > 0 ? width / measured : 1;
    setRoom({ width, height: cover ? Math.max((el?.clientHeight ?? 0) * grown, 1) : maxHeight });
    if (!cover && maxHeight === undefined && measured > 0 && /\binline-image\b/.test(img.className ?? '')) inlineWidth = width;
  });
  // Made while it is within a screen of view, so a thread opened at its end
  // costs nothing yet for the pictures far above. One scrolled out of reach
  // before it is drawn gives up its place in line (../fit-picture.ts).
  const isDrawn = drawn?.for === src;
  useEffect(() => {
    const el = place.current;
    if (isDrawn) return;
    if (!el || typeof IntersectionObserver === 'undefined') { onScreen.current = true; setNear(true); return; }
    const root = scrollerOf(el);
    const last = (seen: IntersectionObserverEntry[]) => seen[seen.length - 1].isIntersecting;
    const nearBy = new IntersectionObserver((seen) => setNear(last(seen)), { root, rootMargin: '100% 0px' });
    const inView = new IntersectionObserver((seen) => { onScreen.current = last(seen); }, { root });
    nearBy.observe(el);
    inView.observe(el);
    return () => { nearBy.disconnect(); inView.disconnect(); };
  }, [isDrawn]);
  // The copy is let go when the picture goes or draws another file, never as
  // it scrolls away: one drawn the moment it left reach would draw as broken.
  const copy = useRef<string | null>(null);
  useEffect(() => () => { if (copy.current) URL.revokeObjectURL(copy.current); copy.current = null; }, [src]);
  useEffect(() => {
    if (!room || !near || isDrawn) return;
    let live = true;
    const leaving = new AbortController();
    fitPicture(src, { ...room, cover }, undefined, leaving.signal, () => onScreen.current)
      .then((r) => {
        if (!live) { URL.revokeObjectURL(r.url); return; }
        copy.current = r.url;
        setDrawn({ for: src, url: r.url });
      })
      .catch((err) => {
        if (!live) return;
        // Nothing there: the caller's next place is tried now, not after a second load fails.
        if (err instanceof PictureMissing && img.onError) img.onError(undefined as never);
        else setFailed(src);
      });
    return () => { live = false; leaving.abort(); };
  }, [src, room, near, cover, isDrawn]);
  if (failed === src) return <img {...img} src={src} />;
  if (drawn?.for !== src) {
    // An empty picture holding the place: what draws it, and the viewer, read `data-full`.
    // `data-far` keeps it still until it is on its way (styles.css).
    const { onError: _e, onLoad: _l, alt: _a, ...still } = img;
    return <img {...still} ref={place} className={`${img.className ?? ''} arriving`} alt="" aria-hidden="true" data-full={src} data-far={near ? undefined : ''} />;
  }
  return <img {...img} src={drawn.url} data-full={src} />;
}
