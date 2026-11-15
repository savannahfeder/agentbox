// A PICTURE IS DRAWN FROM A COPY THE SIZE IT IS SHOWN AT.
//
// A screenshot from a Retina Mac is 2880 pixels wide and a thread shows it at
// 760 points, but the window decoded and kept every one at full size. Measured
// in the real window: 30 screenshots in one answer took 606 MB once read, and
// the owner's minute log showed the window swinging between 240 MB and 1.2 GB.
// So the picture is fetched once, shrunk with the browser's own decoder (which
// works off the window's main thread) and drawn from that copy. The full-screen
// viewer still opens the original.

import { fetchableFileUrl } from './phone-files';

/** Points the picture is shown in. `cover` fills the box and crops, as a Files cover does. */
export interface Box { width: number; height?: number; cover?: boolean }

export interface FitTools {
  fetch: (url: string, signal?: AbortSignal) => Promise<{ ok: boolean; status?: number; blob: () => Promise<Blob> }>;
  decode: (from: Blob | ImageBitmap, resize?: { resizeWidth: number; resizeHeight: number; resizeQuality: 'high' }) => Promise<ImageBitmap>;
  encode: (picture: ImageBitmap) => Promise<Blob>;
  link: (blob: Blob) => string;
  scale: () => number;
  /** Copies already made, so a picture seen before is not shrunk again. */
  kept?: KeptCopies;
}

export interface KeptCopies {
  get(key: string): { blob: Blob; shrunk: boolean } | undefined;
  put(key: string, copy: { blob: Blob; shrunk: boolean }): void;
  bytes(): number;
}

/** The newest copies, up to `budget` bytes in all; the one used longest ago goes first. */
export function keptCopies(budget: number): KeptCopies {
  const copies = new Map<string, { blob: Blob; shrunk: boolean }>();
  let bytes = 0;
  return {
    get(key) {
      const copy = copies.get(key);
      if (copy) { copies.delete(key); copies.set(key, copy); }
      return copy;
    },
    put(key, copy) {
      if (copy.blob.size > budget) return;
      const had = copies.get(key);
      if (had) { bytes -= had.blob.size; copies.delete(key); }
      copies.set(key, copy);
      bytes += copy.blob.size;
      for (const [k, c] of copies) {
        if (bytes <= budget) break;
        copies.delete(k);
        bytes -= c.blob.size;
      }
    },
    bytes: () => bytes,
  };
}

// Keyed by the bytes, not the address: a picture an agent redraws under the
// same name is a new picture and is shrunk again. A page served over plain
// http has no crypto.subtle, and there nothing is kept.
async function keyOf(blob: Blob, box: Box, pixels: number): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  let hex = '';
  for (const b of sum) hex += b.toString(16).padStart(2, '0');
  return `${hex} ${box.width}x${box.height ?? ''}${box.cover ? ' cover' : ''} @${pixels}`;
}

const browser: FitTools = {
  // The phone and browser copies reach the app's picture scheme over http.
  fetch: (url, signal) => fetch(fetchableFileUrl(url), { signal }),
  decode: (from, resize) => (resize ? createImageBitmap(from, resize) : createImageBitmap(from)),
  encode: async (picture) => {
    const canvas = new OffscreenCanvas(picture.width, picture.height);
    canvas.getContext('2d')!.drawImage(picture, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  },
  link: (blob) => URL.createObjectURL(blob),
  scale: () => (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
  kept: keptCopies(48 * 2 ** 20),
};

// A still PNG or JPEG only. A GIF, an animated PNG or a drawing would lose its
// frames or its sharpness, so it is drawn from the whole file as before.
async function shrinkable(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  const jpeg = head[0] === 0xff && head[1] === 0xd8;
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  if (jpeg) return true;
  if (!png) return false;
  return !new TextDecoder('latin1').decode(head).includes('acTL');
}

/** The picture's place answered that nothing is there. */
export class PictureMissing extends Error {
  constructor(status?: number) { super(`picture not found (${status ?? 'no answer'})`); }
}

// Two at a time, so opening a thread of thirty does not decode thirty at once.
// Only the decoding takes a turn: a file slow to arrive holds none.
const AT_ONCE = 2;
let running = 0;
const waiting: (() => void)[] = [];
const gone = () => new DOMException('The picture left the screen.', 'AbortError');
async function inTurn<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw gone();
  if (running >= AT_ONCE) {
    await new Promise<void>((go, stop) => {
      const leave = () => { waiting.splice(waiting.indexOf(next), 1); stop(gone()); };
      const next = () => { signal?.removeEventListener('abort', leave); go(); };
      waiting.push(next);
      signal?.addEventListener('abort', leave, { once: true });
    });
  }
  running += 1;
  try { return await work(); } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/**
 * A link to draw `url` from in a box of `box` points: a shrunk copy when the
 * picture is bigger than the box needs, else the file itself. The caller
 * revokes it when it stops drawing it. Throws when the picture cannot be read,
 * and an AbortError once `signal` says it is no longer wanted.
 */
export async function fitPicture(url: string, box: Box, tools: FitTools = browser, signal?: AbortSignal): Promise<{ url: string; shrunk: boolean }> {
  if (signal?.aborted) throw gone();
  const res = await tools.fetch(url, signal);
  if (!res.ok) throw new PictureMissing(res.status);
  const blob = await res.blob();
  if (signal?.aborted) throw gone();
  if (!(await shrinkable(blob))) return { url: tools.link(blob), shrunk: false };
  const pixels = tools.scale();
  const key = tools.kept ? await keyOf(blob, box, pixels) : null;
  const had = key === null ? undefined : tools.kept?.get(key);
  if (had) return { url: tools.link(had.blob), shrunk: had.shrunk };
  const copy = await inTurn(async () => {
    const whole = await tools.decode(blob);
    const across = box.width / whole.width;
    const down = (box.height ?? Infinity) / whole.height;
    const fit = (box.cover && Number.isFinite(down) ? Math.max(across, down) : Math.min(across, down)) * pixels;
    if (!(fit < 0.9)) { whole.close(); return { blob, shrunk: false }; }
    const width = Math.max(1, Math.round(whole.width * fit));
    const height = Math.max(1, Math.round(whole.height * fit));
    let small: ImageBitmap;
    try { small = await tools.decode(whole, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }); } finally { whole.close(); }
    try { return { blob: await tools.encode(small), shrunk: true }; } finally { small.close(); }
  }, signal);
  if (key !== null) tools.kept?.put(key, copy);
  return { url: tools.link(copy.blob), shrunk: copy.shrunk };
}
