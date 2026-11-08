// A THREAD PAGE THAT DRAWS NOTHING SAYS WHICH KIND OF NOTHING
// (tests/a-thread-page-that-draws-nothing-is-recorded).
//
// A moment after a thread opens the screen reports what it laid out, and this
// photographs that strip of the window. Text laid out with no ink painted is a
// window that did not paint ("paint-blank"); nothing laid out and no reply box is
// a page with nothing on it ("dom-blank"). Only blanks are written, to
// memory-log/blank-<day>.jsonl beside the freeze and memory logs.
import fs from 'node:fs';
import path from 'node:path';

/** How far from the strip's usual shade a pixel must be to count as ink. */
export const INK_STEP = 60;
/** The share of ink pixels a strip with a line of text easily clears. */
export const INK_MIN = 0.001;
const CAPTURE_MS = 3_000;
const REPAINT_MS = 600;

export type PaneFacts = {
  /** Text the page laid out inside the window, counted up to a cap. */
  text: number;
  dock: boolean;
  /** Where that text is, in window points, to photograph. */
  strip?: { x: number; y: number; width: number; height: number } | null;
  [k: string]: unknown;
};

/** The share of a BGRA picture far from its most common shade; null when the picture cannot be read. */
export function inkFraction(bitmap: Uint8Array, width: number, height: number): number | null {
  const n = width * height;
  if (!n || bitmap.length < n * 4) return null;
  const lum = new Uint8Array(n);
  const counts = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const l = (bitmap[o + 2] * 77 + bitmap[o + 1] * 150 + bitmap[o] * 29) >> 8;
    lum[i] = l;
    counts[l]++;
  }
  let usual = 0;
  for (let l = 1; l < 256; l++) if (counts[l] > counts[usual]) usual = l;
  let ink = 0;
  for (let i = 0; i < n; i++) if (Math.abs(lum[i] - usual) > INK_STEP) ink++;
  return ink / n;
}

export function blankVerdict(facts: Pick<PaneFacts, 'text' | 'dock'>, ink: number | null): 'paint-blank' | 'dom-blank' | null {
  if (!facts.text && !facts.dock) return 'dom-blank';
  if (facts.text > 0 && ink !== null && ink < INK_MIN) return 'paint-blank';
  return null;
}

type Image = { toBitmap(): Uint8Array; getSize(): { width: number; height: number }; isEmpty(): boolean };
export type PageWindow = {
  isDestroyed(): boolean;
  webContents: { capturePage(rect: { x: number; y: number; width: number; height: number }): Promise<Image>; invalidate(): void };
};
type IpcLike = { handle(channel: string, fn: (e: unknown, payload: unknown) => unknown): void };

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => { setTimeout(() => r(null), ms); })]);

async function inkOf(win: PageWindow, strip: NonNullable<PaneFacts['strip']>): Promise<number | null> {
  const rect = { x: Math.round(strip.x), y: Math.round(strip.y), width: Math.max(1, Math.round(strip.width)), height: Math.max(1, Math.round(strip.height)) };
  const image = await within(win.webContents.capturePage(rect).catch(() => null), CAPTURE_MS);
  if (!image || image.isEmpty()) return null;
  const { width, height } = image.getSize();
  return inkFraction(image.toBitmap(), width, height);
}

export function recordBlankPages({ ipcMain, window, dir, context = () => ({}), now = () => new Date() }: {
  ipcMain: IpcLike;
  window: () => PageWindow | null;
  dir: string;
  /** What the app was doing: its processes' memory, its uptime, what was running. */
  context?: () => Record<string, unknown>;
  now?: () => Date;
}) {
  ipcMain.handle('zero:blank-check', async (e, payload) => {
    const p = (payload ?? {}) as { thread?: string; facts?: PaneFacts; lateMs?: number; longTaskMs?: number };
    const facts = p.facts;
    const win = window();
    if (!facts || !win || win.isDestroyed()) return null;
    // The phone door answers through these same handlers; its page is not this window.
    if ((e as { sender?: unknown } | null)?.sender !== win.webContents) return null;
    const ink = facts.strip ? await inkOf(win, facts.strip) : null;
    const verdict = blankVerdict(facts, ink);
    if (!verdict) return null;
    // A repaint asked for once: whether it brings the page back is half the answer.
    let healed: boolean | null = null;
    if (verdict === 'paint-blank' && facts.strip) {
      win.webContents.invalidate();
      await new Promise((r) => { setTimeout(r, REPAINT_MS); });
      const after = await inkOf(win, facts.strip);
      healed = after === null ? null : after >= INK_MIN;
    }
    const at = now();
    const line = { at: at.toISOString(), verdict, thread: p.thread ?? null, ink, healed, lateMs: p.lateMs ?? null, longTaskMs: p.longTaskMs ?? null, facts, ...context() };
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, `blank-${at.toISOString().slice(0, 10)}.jsonl`), `${JSON.stringify(line)}\n`);
    } catch (err) {
      console.warn(`agentbox: could not write the blank page down: ${(err as Error).message}`);
    }
    console.warn(`agentbox: thread ${p.thread ?? '?'} opened ${verdict}${healed === null ? '' : healed ? ', a repaint brought it back' : ', a repaint did not help'}`);
    return verdict;
  });
}
