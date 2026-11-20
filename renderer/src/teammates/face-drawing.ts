// An AI teammate's face: an ink head-and-shoulders drawing (Notionists by
// Zoish, CC0), the look of the multiplayer film's rows. It has no background,
// so the paper behind it (shared/teammate-face.mts facePaper) can be any shape.
import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';

const drawn = new Map<string, string>();

/** A data URI of the drawing, made once per seed. */
export function faceDrawing(seed: string): string {
  let uri = drawn.get(seed);
  if (!uri) {
    uri = createAvatar(notionists, { seed }).toDataUri();
    drawn.set(seed, uri);
  }
  return uri;
}

/** `count` faces other than `seed`'s, a new set for each `page`, none drawn twice. */
export function otherFaces(seed: string, count = 7, page = 0): string[] {
  const seen = new Set([faceDrawing(seed)]);
  const out: string[] = [];
  for (let n = page * 100; out.length < count && n < page * 100 + 100; n++) {
    const next = `${seed}.${n}`;
    const art = faceDrawing(next);
    if (seen.has(art)) continue;
    seen.add(art);
    out.push(next);
  }
  return out;
}
