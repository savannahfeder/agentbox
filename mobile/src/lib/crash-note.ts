// The error that ends the app, written down before it does, so the next launch
// can send it (platform/crash.ts). Nothing of the person's goes in: a thread
// title or a path can sit inside an error's words, so quoted runs and paths are
// taken out, and frames keep only a function name and a place in the bundle.

export type CrashNote = { at: number; version: string; name: string; message: string; frames: string[] };
type Handler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { setGlobalHandler(h: Handler): void; getGlobalHandler(): Handler };

const MAX_FRAMES = 15;
const PATH = /(?:file:\/\/)?(?:~|\/)[^\s'"`)\]},;]*/g;
// Hermes: `at fn (address at /long/path/main.jsbundle:1:234)`, `at fn (main.jsbundle:1:234)` or `at fn (native)`.
const FRAME = /^\s*at\s+(\S+)\s+\((?:address at\s+)?([^()]*?)(?::(\d+):(\d+))?\)\s*$/;

function cleanMessage(text: string): string {
  const out = text
    .replace(/'[^']{1,400}'|"[^"]{1,400}"/g, "'<str>'")
    .replace(PATH, '<path>');
  return out.length > 300 ? `${out.slice(0, 300)}…` : out;
}

function framesOf(stack: unknown): string[] {
  const frames: string[] = [];
  for (const line of String(stack ?? '').split('\n')) {
    const m = line.match(FRAME);
    if (!m) continue;
    const [, fn, file, ln, col] = m;
    const where = file!.split('/').pop() || '?';
    frames.push(`${fn!.slice(0, 80)} ${ln ? `${where}:${ln}:${col}` : where}`);
    if (frames.length === MAX_FRAMES) break;
  }
  return frames;
}

export function crashNote(error: unknown, version: string, at: number): CrashNote {
  const e = error && typeof error === 'object' ? error as { name?: unknown; message?: unknown; stack?: unknown } : null;
  return {
    at,
    version,
    name: typeof e?.name === 'string' ? e.name.slice(0, 60) : 'Error',
    message: cleanMessage(typeof e?.message === 'string' ? e.message : String(error)),
    frames: framesOf(e?.stack),
  };
}

export function crashNoteFrom(text: string | null): CrashNote | null {
  if (!text) return null;
  try {
    const n = JSON.parse(text);
    if (typeof n?.message !== 'string' || typeof n?.version !== 'string' || !Array.isArray(n?.frames)) return null;
    return { at: Number(n.at) || 0, version: n.version, name: String(n.name ?? 'Error'), message: n.message, frames: n.frames.map(String).slice(0, MAX_FRAMES) };
  } catch {
    return null;
  }
}

/** The next handler still runs, so a fatal error ends the app as it always did. */
export function catchCrashes(errorUtils: ErrorUtilsLike | undefined, keep: (text: string) => void, version: () => string, now: () => number) {
  if (!errorUtils?.setGlobalHandler) return;
  const next = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      try { keep(JSON.stringify(crashNote(error, version(), now()))); } catch { /* the crash itself matters more */ }
    }
    next(error, isFatal);
  });
}

/** The computer's "Counts and crash reports" switch, newest computer first; null before any is read. */
export function reportsOn(rows: { settings?: object | null }[]): boolean | null {
  const d = (rows[0]?.settings as { workspace?: { diagnostics?: unknown } } | null | undefined)?.workspace?.diagnostics;
  return typeof d === 'boolean' ? d : null;
}

export function crashReport(n: CrashNote): string {
  return [
    `Phone app crash, sent by the app on its next launch.`,
    `Build: ${n.version}`,
    `When: ${new Date(n.at).toISOString()}`,
    `${n.name}: ${n.message}`,
    ...n.frames.map((f) => `  at ${f}`),
  ].join('\n');
}
