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
  fetch: (url: string) => Promise<{ ok: boolean; status?: number; blob: () => Promise<Blob> }>;
  decode: (from: Blob | ImageBitmap, resize?: { resizeWidth: number; resizeHeight: number; resizeQuality: 'high' }) => Promise<ImageBitmap>;
  encode: (picture: ImageBitmap) => Promise<Blob>;
  link: (blob: Blob) => string;
  scale: () => number;
}

const browser: FitTools = {
  // The phone and browser copies reach the app's picture scheme over http.
  fetch: (url) => fetch(fetchableFileUrl(url)),
  decode: (from, resize) => (resize ? createImageBitmap(from, resize) : createImageBitmap(from)),
  encode: async (picture) => {
    const canvas = new OffscreenCanvas(picture.width, picture.height);
    canvas.getContext('2d')!.drawImage(picture, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  },
  link: (blob) => URL.createObjectURL(blob),
  scale: () => (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
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
const AT_ONCE = 2;
let running = 0;
const waiting: (() => void)[] = [];
async function inTurn<T>(work: () => Promise<T>): Promise<T> {
  if (running >= AT_ONCE) await new Promise<void>((go) => waiting.push(go));
  running += 1;
  try { return await work(); } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/**
 * A link to draw `url` from in a box of `box` points: a shrunk copy when the
 * picture is bigger than the box needs, else the file itself. The caller
 * revokes it when it stops drawing it. Throws when the picture cannot be read.
 */
export function fitPicture(url: string, box: Box, tools: FitTools = browser): Promise<{ url: string; shrunk: boolean }> {
  return inTurn(async () => {
    const res = await tools.fetch(url);
    if (!res.ok) throw new PictureMissing(res.status);
    const blob = await res.blob();
    if (!(await shrinkable(blob))) return { url: tools.link(blob), shrunk: false };
    const whole = await tools.decode(blob);
    const pixels = tools.scale();
    const across = box.width / whole.width;
    const down = (box.height ?? Infinity) / whole.height;
    const fit = (box.cover && Number.isFinite(down) ? Math.max(across, down) : Math.min(across, down)) * pixels;
    if (!(fit < 0.9)) { whole.close(); return { url: tools.link(blob), shrunk: false }; }
    const width = Math.max(1, Math.round(whole.width * fit));
    const height = Math.max(1, Math.round(whole.height * fit));
    let small: ImageBitmap;
    try { small = await tools.decode(whole, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }); } finally { whole.close(); }
    try { return { url: tools.link(await tools.encode(small)), shrunk: true }; } finally { small.close(); }
  });
}
