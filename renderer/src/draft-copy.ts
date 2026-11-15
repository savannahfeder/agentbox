// A second copy of every draft, in a file the app writes itself.
//
// localStorage is one Chromium database, and Chromium deletes and recreates it
// after its writes keep failing (a full disk does it). The window goes on
// showing every draft from memory, so the loss only shows at the next start,
// all at once. The file copy is what that start fills back from.

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  readonly length: number;
  key(index: number): string | null;
}

export interface DraftCopy { at: number; drafts: Record<string, string> }

/** When the storage last matched the file. Not a draft itself. */
export const COPY_STAMP_KEY = 'zero.copyofdrafts.at';

export function isDraftKey(key: string): boolean {
  return /^zero\.(draft|commentdraft)/.test(key) || key.startsWith('doc-edit-draft:');
}

export function takeDraftCopy(store: Store, now = Date.now()): DraftCopy {
  const drafts: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && isDraftKey(k)) {
      const v = store.getItem(k);
      if (v !== null) drafts[k] = v;
    }
  }
  try { store.setItem(COPY_STAMP_KEY, String(now)); } catch { /* the file copy still goes */ }
  return { at: now, drafts };
}

/**
 * Fill the storage back from the copy; returns how many drafts it wrote.
 *
 * A draft the storage is missing comes back. One it holds is replaced only when
 * the storage's stamp is older than the copy, which means it lost writes the
 * file kept; otherwise the storage's words are the newer ones. A draft deleted
 * in the half second before a crash can come back, which beats losing one.
 */
export function putDraftsBack(store: Store, copy: DraftCopy | null | undefined): number {
  if (!copy || typeof copy.at !== 'number' || !copy.drafts || typeof copy.drafts !== 'object') return 0;
  let stamp = 0;
  try { stamp = Number(store.getItem(COPY_STAMP_KEY)) || 0; } catch { /* treat as never stamped */ }
  const storageLostWrites = stamp < copy.at;
  let put = 0;
  for (const [k, v] of Object.entries(copy.drafts)) {
    if (!isDraftKey(k) || typeof v !== 'string') continue;
    try {
      const held = store.getItem(k);
      if (held === v) continue;
      if (held === null || storageLostWrites) { store.setItem(k, v); put++; }
    } catch { /* a refused write leaves the rest to try */ }
  }
  return put;
}

interface Bridge { read(): string | null; write(text: string): void }

/**
 * Put drafts back now, then keep the file in step: a draft write marks it
 * stale, and the copy goes at most once a second and when the page goes away.
 */
export function keepACopyOfTheDrafts(store: Storage, bridge: Bridge | undefined): void {
  if (!bridge) return;
  let raw: string | null;
  // A copy that could not be read may still be good, so it is never written over.
  try { raw = bridge.read(); } catch { return; }
  try { if (raw) putDraftsBack(store, JSON.parse(raw)); } catch { /* damaged: replaced below */ }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const send = () => {
    timer = null;
    try { bridge.write(JSON.stringify(takeDraftCopy(store))); } catch { /* next change tries again */ }
  };
  const stale = () => { if (!timer) timer = setTimeout(send, 1000); };

  const proto = Object.getPrototypeOf(store) as Storage;
  const { setItem, removeItem, clear } = proto;
  proto.setItem = function (this: Storage, k: string, v: string) {
    setItem.call(this, k, v);
    if (this === store && isDraftKey(k)) stale();
  };
  proto.removeItem = function (this: Storage, k: string) {
    removeItem.call(this, k);
    if (this === store && isDraftKey(k)) stale();
  };
  proto.clear = function (this: Storage) {
    clear.call(this);
    if (this === store) stale();
  };
  window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); send(); } });
  send();
}
