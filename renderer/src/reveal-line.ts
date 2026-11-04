// Landing on one message in a thread or a group: wait until it is drawn, scroll
// to it and mark it for a few seconds. A message carries `data-line="<id>"`
// (Thread.tsx, RoomChat.tsx). The page draws a thread a moment after it opens,
// and a long thread draws only its newest messages, so a line that is not there
// yet is asked for twice: once from the thread (it shows the whole conversation)
// and once from a group (the reply's side thread).

export const LINE_MARK = 'line-found';
export const LINE_MISSING = 'agentbox:line-missing';
const EVERY_MS = 50;
const TRIES = 60;
const ASK_AFTER = 6;
const MARKED_MS = 2600;

type Page = { querySelector(selector: string): { scrollIntoView(o: ScrollIntoViewOptions): void; classList: { add(c: string): void; remove(c: string): void } } | null };

export function revealLine(uid: string, io: {
  doc?: Page;
  announce?: (name: string, uid: string) => void;
  later?: (fn: () => void, ms: number) => unknown;
  clear?: (handle: unknown) => void;
} = {}): () => void {
  const doc = io.doc ?? document;
  const announce = io.announce ?? ((name, id) => window.dispatchEvent(new CustomEvent(name, { detail: id })));
  const later = io.later ?? ((fn, ms) => window.setTimeout(fn, ms));
  const clear = io.clear ?? ((h) => window.clearTimeout(h as number));
  const selector = `[data-line="${uid.replace(/["\\]/g, '\\$&')}"]`;
  let handle: unknown = null;
  let stopped = false;
  let asked = false;
  const look = (n: number) => {
    if (stopped) return;
    const el = doc.querySelector(selector);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.add(LINE_MARK);
      later(() => el.classList.remove(LINE_MARK), MARKED_MS);
      return;
    }
    if (n >= TRIES) return;
    if (n >= ASK_AFTER && !asked) { asked = true; announce(LINE_MISSING, uid); }
    handle = later(() => look(n + 1), EVERY_MS);
  };
  look(0);
  return () => { stopped = true; if (handle !== null) clear(handle); };
}
