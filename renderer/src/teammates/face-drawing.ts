// An AI teammate's face: an ink head-and-shoulders drawing (Notionists by
// Zoish, CC0), the look of the multiplayer film's rows. It has no background,
// so the paper behind it (shared/teammate-face.mts facePaper) can be any shape.
import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';

const drawn = new Map<string, string>();

/** The drawing as SVG markup, made once per seed. The phone draws this. */
export function faceSvg(seed: string): string {
  let svg = drawn.get(seed);
  if (!svg) {
    // Closer than the full bust, so a face reads at the inbox's 18px; low enough that the hair clears a round frame.
    svg = createAvatar(notionists, { seed, scale: 125, translateY: 18 }).toString();
    drawn.set(seed, svg);
  }
  return svg;
}

/** The drawing as a data URI, for an <img>. */
export function faceDrawing(seed: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(faceSvg(seed))}`;
}

/** `count` faces other than `seed`'s, a new set for each `page`, none drawn twice. */
export function otherFaces(seed: string, count = 7, page = 0): string[] {
  const seen = new Set([faceSvg(seed)]);
  const out: string[] = [];
  for (let n = page * 100; out.length < count && n < page * 100 + 100; n++) {
    const next = `${seed}.${n}`;
    const art = faceSvg(next);
    if (seen.has(art)) continue;
    seen.add(art);
    out.push(next);
  }
  return out;
}
