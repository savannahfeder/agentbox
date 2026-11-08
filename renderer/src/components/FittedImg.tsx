import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { fitPicture } from '../fit-picture';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  /** Fill the place and crop, as a Files cover does, rather than fit its width. */
  cover?: boolean;
  /** The tallest the picture is ever drawn, in points, where a style caps it. */
  maxHeight?: number;
  /** The copy is never narrower than this, so a pane widened later still draws it sharp. */
  minWidth?: number;
};

/**
 * An <img> drawn from a copy the size of its place (../fit-picture.ts). The
 * place is held by a placeholder carrying the picture's own classes, so every
 * layout's size rules apply to it and its measured width is the widest the
 * picture will be drawn. If no copy can be made, `src` itself is drawn, so a
 * missing file still reaches its own onError. `data-full` keeps the original
 * for the full-screen viewer.
 */
export function FittedImg({ src, cover = false, maxHeight, minWidth = 0, ...img }: Props) {
  const place = useRef<HTMLSpanElement | null>(null);
  const [room, setRoom] = useState<{ width: number; height?: number } | null>(null);
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
  useEffect(() => {
    if (!room) return;
    let live = true;
    let made: string | null = null;
    fitPicture(src, { ...room, cover })
      .then((r) => { made = r.url; if (live) setDrawn({ for: src, url: r.url }); else URL.revokeObjectURL(r.url); })
      .catch(() => { if (live) setFailed(src); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [src, room, cover]);
  if (failed === src) return <img {...img} src={src} />;
  if (drawn?.for !== src) return <span ref={place} className={`${img.className ?? ''} arriving`} aria-hidden="true" />;
  return <img {...img} src={drawn.url} data-full={src} />;
}
