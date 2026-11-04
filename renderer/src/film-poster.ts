// A film's poster: the first frame with something on it. Read from a hidden copy
// of the film, one film at a time, since a tab has six connections and a page of
// tiles would otherwise spend them all.
import { useEffect, useState } from 'react';
import { fetchableFileUrl } from './phone-files';

// Standard deviation of brightness, out of 255. A cream wash reads about 1, and a
// wordmark on it well over 20.
const BLANK_BELOW = 6;
const MOMENTS = [0.6, 1, 1.5, 2, 3, 4, 6];
const POSTER_WIDTH = 640;
const SAMPLE = { w: 32, h: 18 };
const LOOK_FOR_MS = 12_000;

export function frameContrast(rgba: ArrayLike<number>): number {
  const count = Math.floor(rgba.length / 4);
  if (!count) return 0;
  let sum = 0, squares = 0;
  for (let i = 0; i < count; i += 1) {
    const luma = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    sum += luma;
    squares += luma * luma;
  }
  const mean = sum / count;
  return Math.sqrt(Math.max(0, squares / count - mean * mean));
}

export const isBlankFrame = (rgba: ArrayLike<number>) => frameContrast(rgba) < BLANK_BELOW;

export function momentsToTry(length: number): number[] {
  if (!Number.isFinite(length) || length <= 0) return [];
  const inside = MOMENTS.filter((s) => s < length - 0.05);
  return inside.length ? inside : [length / 2];
}

export function bestMoment(read: { s: number; contrast: number }[]): number | null {
  if (!read.length) return null;
  const first = read.find((r) => r.contrast >= BLANK_BELOW);
  return (first ?? read.reduce((a, b) => (b.contrast > a.contrast ? b : a))).s;
}

export type FilmPoster = { image: string | null; length: number };

const NOTHING: FilmPoster = { image: null, length: 0 };
const kept = new Map<string, Promise<FilmPoster>>();
let queue: Promise<unknown> = Promise.resolve();

function readPoster(url: string): Promise<FilmPoster> {
  return new Promise((done) => {
    const film = document.createElement('video');
    const small = document.createElement('canvas');
    small.width = SAMPLE.w; small.height = SAMPLE.h;
    const read: { s: number; contrast: number }[] = [];
    let todo: number[] = [];
    let settled = false;
    let length = 0;
    const finish = (image: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      film.removeAttribute('src');
      film.load();
      done({ image, length });
    };
    const deadline = setTimeout(() => finish(null), LOOK_FOR_MS);
    const paint = () => {
      const w = Math.min(POSTER_WIDTH, film.videoWidth);
      const big = document.createElement('canvas');
      big.width = w; big.height = Math.round((w * film.videoHeight) / film.videoWidth);
      big.getContext('2d')?.drawImage(film, 0, 0, big.width, big.height);
      return big.toDataURL('image/jpeg', 0.82);
    };
    const next = () => {
      const s = todo.shift();
      if (s === undefined) {
        const best = bestMoment(read);
        if (best === null) { finish(null); return; }
        if (Math.abs(film.currentTime - best) < 0.01) { finish(paint()); return; }
        todo = [];
        film.onseeked = () => { try { finish(paint()); } catch { finish(null); } };
        film.currentTime = best;
        return;
      }
      film.currentTime = s;
    };
    film.muted = true;
    film.preload = 'auto';
    film.crossOrigin = 'anonymous';
    film.onloadeddata = () => {
      length = film.duration;
      todo = momentsToTry(length);
      next();
    };
    film.onseeked = () => {
      try {
        const ctx = small.getContext('2d', { willReadFrequently: true });
        ctx?.drawImage(film, 0, 0, SAMPLE.w, SAMPLE.h);
        const contrast = frameContrast(ctx?.getImageData(0, 0, SAMPLE.w, SAMPLE.h).data ?? []);
        read.push({ s: film.currentTime, contrast });
        if (contrast >= BLANK_BELOW) { finish(paint()); return; }
        next();
      } catch { finish(null); }
    };
    film.onerror = () => finish(null);
    // Off the page, the rewrite that serves a browser copy's files does not reach it.
    film.src = fetchableFileUrl(url);
    film.load();
  });
}

/** The poster for a film's address; asked twice, it is read once. */
export function posterOf(url: string): Promise<FilmPoster> {
  const had = kept.get(url);
  if (had) return had;
  const asked = queue.then(() => readPoster(url)).catch(() => NOTHING).then((poster) => {
    // A file still on its way reads as nothing now and something later.
    if (!poster.image) kept.delete(url);
    return poster;
  });
  queue = asked;
  kept.set(url, asked);
  while (kept.size > 60) kept.delete(kept.keys().next().value as string);
  return asked;
}

/** Undefined while it is being read. A null image means the frames could not be read. */
export function useFilmPoster(url: string | null): FilmPoster | undefined {
  const [poster, setPoster] = useState<FilmPoster | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setPoster(undefined);
    if (url) void posterOf(url).then((p) => { if (live) setPoster(p); });
    return () => { live = false; };
  }, [url]);
  return poster;
}
