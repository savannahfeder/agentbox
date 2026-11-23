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

type Decode = (from: Blob | ImageBitmap, resize?: { resizeWidth: number; resizeHeight: number; resizeQuality: 'high' }) => Promise<ImageBitmap>;
type Encode = (picture: ImageBitmap) => Promise<Blob>;
type Copy = { blob: Blob; shrunk: boolean };
type Shrink = (blob: Blob, box: Box, pixels: number) => Promise<Copy>;

export interface FitTools {
  fetch: (url: string, signal?: AbortSignal) => Promise<{ ok: boolean; status?: number; blob: () => Promise<Blob> }>;
  decode: Decode;
  encode: Encode;
  /** Does decode, resize and encode all at once, somewhere other than here. */
  shrink?: Shrink;
  link: (blob: Blob) => string;
  scale: () => number;
  /** Copies already made, so a picture seen before is not shrunk again. */
  kept?: KeptCopies;
  /** The same copies on disk, so they outlive a restart. */
  stored?: StoredCopies;
}

export interface StoredCopies {
  get(key: string): Promise<Copy | undefined>;
  put(key: string, copy: Copy): Promise<void>;
}

/** The keys to let go so the rest fit in `budget` bytes, the one used longest ago first. */
export function oldestOverBudget(copies: { key: string; size: number; used: number }[], budget: number): string[] {
  let bytes = copies.reduce((sum, c) => sum + c.size, 0);
  const out: string[] = [];
  for (const c of [...copies].sort((a, b) => a.used - b.used)) {
    if (bytes <= budget) break;
    out.push(c.key);
    bytes -= c.size;
  }
  return out;
}

const req = <T,>(r: IDBRequest<T>) => new Promise<T>((ok, bad) => { r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
const PRUNE_EVERY = 20;

export function storedCopies(budget: number, idb: IDBFactory = indexedDB): StoredCopies {
  let opened: Promise<IDBDatabase> | null = null;
  const db = () => (opened ??= new Promise((ok, bad) => {
    const r = idb.open('agentbox-picture-copies', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('copies', { keyPath: 'key' }); };
    r.onsuccess = () => {
      const d = r.result;
      d.onclose = () => { opened = null; };
      d.onversionchange = () => { d.close(); opened = null; };
      ok(d);
    };
    r.onerror = () => { opened = null; bad(r.error); };
  }));
  let puts = 0;
  const prune = async () => {
    const copies = (await db()).transaction('copies', 'readwrite').objectStore('copies');
    const all = await req(copies.getAll() as IDBRequest<{ key: string; blob: Blob; used: number }[]>);
    for (const key of oldestOverBudget(all.map((c) => ({ key: c.key, size: c.blob.size, used: c.used })), budget)) copies.delete(key);
  };
  return {
    async get(key) {
      const copies = (await db()).transaction('copies', 'readwrite').objectStore('copies');
      const had = await req(copies.get(key) as IDBRequest<{ key: string; blob: Blob; shrunk: boolean; used: number } | undefined>);
      if (!had) return undefined;
      copies.put({ ...had, used: Date.now() });
      return { blob: had.blob, shrunk: had.shrunk };
    },
    async put(key, copy) {
      if (copy.blob.size > budget) return;
      await req((await db()).transaction('copies', 'readwrite').objectStore('copies').put({ key, ...copy, used: Date.now() }));
      if (puts++ % PRUNE_EVERY === 0) await prune();
    },
  };
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

// THESE THREE ALSO RUN IN THE WORKER, FROM THEIR OWN SOURCE (workerSource), so
// they may name nothing outside themselves but their arguments and globals.
const decodeHere: Decode = (from, resize) => (resize ? createImageBitmap(from, resize) : createImageBitmap(from));
const encodeHere: Encode = async (picture) => {
  const canvas = new OffscreenCanvas(picture.width, picture.height);
  canvas.getContext('2d')!.drawImage(picture, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
};
/** The copy `box` needs at `pixels` per point, or the file itself when it is near that already. */
export async function shrinkPicture(blob: Blob, box: Box, pixels: number, decode: Decode, encode: Encode): Promise<Copy> {
  const whole = await decode(blob);
  const across = box.width / whole.width;
  const down = (box.height ?? Infinity) / whole.height;
  const fit = (box.cover && Number.isFinite(down) ? Math.max(across, down) : Math.min(across, down)) * pixels;
  if (!(fit < 0.9)) { whole.close(); return { blob, shrunk: false }; }
  const width = Math.max(1, Math.round(whole.width * fit));
  const height = Math.max(1, Math.round(whole.height * fit));
  let small: ImageBitmap;
  try { small = await decode(whole, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }); } finally { whole.close(); }
  try { return { blob: await encode(small), shrunk: true }; } finally { small.close(); }
}

// A SHRINK HELD THE WINDOW'S THREAD, so a thread stalled while its pictures
// loaded: resizing one 2880x1800 screenshot there took 68 ms, in a worker 9 ms
// of the window's time (tests/a-picture-is-shrunk-off-the-windows-thread).
// Made from a string, so it loads the same from a file, a tab or the phone.
export function workerSource(): string {
  return `const decode = ${decodeHere};
const encode = ${encodeHere};
const shrink = ${shrinkPicture};
onmessage = async ({ data }) => {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') { postMessage({ id: data.id, unable: true }); return; }
  try { postMessage({ id: data.id, copy: await shrink(data.blob, data.box, data.pixels, decode, encode) }); }
  catch (err) { postMessage({ id: data.id, error: String((err && err.message) || err) }); }
};`;
}

type Reply = { copy?: Copy; unable?: boolean; error?: string };

/**
 * A shrink done in the worker `make` starts. It is done `here` instead when no
 * worker starts, when the worker cannot shrink or dies (for good), and when it
 * fails on a picture or says nothing for `deadline` ms (for that picture).
 */
export function offTheWindow(make: () => Worker, here: Shrink, deadline = 20_000): Shrink {
  let worker: Worker | null = null;
  let gaveUp = false;
  let next = 0;
  const waiting = new Map<number, (reply: Reply) => void>();
  const giveUp = () => {
    gaveUp = true;
    worker?.terminate();
    worker = null;
    for (const answer of waiting.values()) answer({ unable: true });
    waiting.clear();
  };
  const ask = (blob: Blob, box: Box, pixels: number) => new Promise<Reply>((answer) => {
    if (!worker) {
      try {
        worker = make();
        worker.onmessage = (e: MessageEvent<Reply & { id: number }>) => { const a = waiting.get(e.data.id); waiting.delete(e.data.id); a?.(e.data); };
        worker.onerror = giveUp;
      } catch { giveUp(); answer({ unable: true }); return; }
    }
    const id = next++;
    const timer = setTimeout(() => { waiting.delete(id); answer({ error: 'no answer' }); }, deadline);
    waiting.set(id, (reply) => { clearTimeout(timer); answer(reply); });
    worker.postMessage({ id, blob, box, pixels });
  });
  return async (blob, box, pixels) => {
    if (!gaveUp) {
      const reply = await ask(blob, box, pixels);
      if (reply.copy) return reply.copy;
      if (reply.unable) giveUp();
    }
    return here(blob, box, pixels);
  };
}

const browser: FitTools = {
  // The phone and browser copies reach the app's picture scheme over http.
  fetch: (url, signal) => fetch(fetchableFileUrl(url), { signal }),
  decode: decodeHere,
  encode: encodeHere,
  shrink: typeof Worker === 'undefined' ? undefined : offTheWindow(
    () => new Worker(URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }))),
    (blob, box, pixels) => shrinkPicture(blob, box, pixels, decodeHere, encodeHere),
  ),
  link: (blob) => URL.createObjectURL(blob),
  scale: () => (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
  kept: keptCopies(48 * 2 ** 20),
  stored: typeof indexedDB === 'undefined' ? undefined : storedCopies(512 * 2 ** 20),
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
// A picture on screen goes before any that is not, in the order asked. One off
// screen takes one turn at most, and only while nothing on screen is still on
// its way, so whatever comes on screen next has a turn free.
const AT_ONCE = 2;
type Ask = { onScreen: () => boolean; state: 'coming' | 'waiting' | 'running' | 'done'; forScreen?: boolean; go?: () => void };
const asks = new Set<Ask>();

function mayStart(ask: Ask, forScreen: boolean): boolean {
  let running = 0;
  let runningOff = 0;
  let screenAhead = false;
  for (const a of asks) {
    if (a.state === 'running') { running += 1; if (!a.forScreen) runningOff += 1; }
    else if (a !== ask && a.state !== 'done' && a.onScreen()) screenAhead = true;
  }
  return running < AT_ONCE && (forScreen || (runningOff === 0 && !screenAhead));
}

function admit() {
  for (const forScreen of [true, false]) {
    for (const a of asks) {
      if (a.state !== 'waiting' || a.onScreen() !== forScreen || !mayStart(a, forScreen)) continue;
      a.state = 'running';
      a.forScreen = forScreen;
      a.go?.();
    }
  }
}

const gone = () => new DOMException('The picture left the screen.', 'AbortError');
async function inTurn<T>(ask: Ask, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw gone();
  ask.state = 'waiting';
  admit();
  // Let in at once, it starts before anything let in beside it.
  if (ask.state === 'waiting') {
    await new Promise<void>((go, stop) => {
      const leave = () => { ask.state = 'done'; stop(gone()); admit(); };
      ask.go = () => { signal?.removeEventListener('abort', leave); go(); };
      signal?.addEventListener('abort', leave, { once: true });
    });
  }
  try { return await work(); } finally {
    ask.state = 'done';
    admit();
  }
}

/**
 * A link to draw `url` from in a box of `box` points: a shrunk copy when the
 * picture is bigger than the box needs, else the file itself. The caller
 * revokes it when it stops drawing it. Throws when the picture cannot be read,
 * and an AbortError once `signal` says it is no longer wanted. `onScreen` says,
 * whenever it is asked, whether the picture is in view now.
 */
export async function fitPicture(url: string, box: Box, tools: FitTools = browser, signal?: AbortSignal, onScreen: () => boolean = () => true): Promise<{ url: string; shrunk: boolean }> {
  const ask: Ask = { onScreen, state: 'coming' };
  asks.add(ask);
  try { return await fitted(ask, url, box, tools, signal); } finally {
    ask.state = 'done';
    asks.delete(ask);
    admit();
  }
}

async function fitted(ask: Ask, url: string, box: Box, tools: FitTools, signal?: AbortSignal): Promise<{ url: string; shrunk: boolean }> {
  if (signal?.aborted) throw gone();
  const res = await tools.fetch(url, signal);
  if (!res.ok) throw new PictureMissing(res.status);
  const blob = await res.blob();
  if (signal?.aborted) throw gone();
  if (!(await shrinkable(blob))) return { url: tools.link(blob), shrunk: false };
  const pixels = tools.scale();
  const key = tools.kept || tools.stored ? await keyOf(blob, box, pixels) : null;
  const had = key === null ? undefined : tools.kept?.get(key) ?? await tools.stored?.get(key).catch(() => undefined);
  if (signal?.aborted) throw gone();
  if (had) {
    tools.kept?.put(key!, had);
    return { url: tools.link(had.blob), shrunk: had.shrunk };
  }
  const copy = await inTurn(ask, () => (tools.shrink
    ? tools.shrink(blob, box, pixels)
    : shrinkPicture(blob, box, pixels, tools.decode, tools.encode)), signal);
  if (key !== null) {
    tools.kept?.put(key, copy);
    if (copy.shrunk) tools.stored?.put(key, copy).catch(() => {});
  }
  return { url: tools.link(copy.blob), shrunk: copy.shrunk };
}
