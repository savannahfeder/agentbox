// WHERE A VOICE NOTE LIVES UNTIL IT IS SENT. Every piece the microphone hands
// over is written down as it arrives, so a note survives the app quitting,
// crashing or reloading mid-sentence, and a finished note waits here for its
// conversation until it goes out or is thrown away. Kept in the window's own
// database on this Mac; nothing here leaves it.
//
// A small list of what is kept, per conversation, also sits in localStorage,
// because the folded reply box reads drafts synchronously and has to be able
// to say a voice note is waiting.

export type VoiceDraft = {
  id: string;
  /** The conversation it belongs to, and the box within it. */
  key: string;
  startedAt: number;
  mime: string;
  /** Finished: by Done, the limit, the microphone stopping, or the box closing. */
  done: boolean;
  ms?: number;
  name?: string;
  /**
   * When it went out. A note being sent is not offered back to its box; it is
   * kept a while in case the send is undone or fails, then dropped.
   */
  sentAt?: number | null;
};

export interface VoiceDraftStore {
  begin(draft: VoiceDraft): Promise<void>;
  chunk(id: string, index: number, blob: Blob, at: number): Promise<void>;
  finish(id: string, end: { ms: number; name: string }): Promise<void>;
  /** Marks it sent at this moment, or not sent after all (null). */
  sent(id: string, at: number | null): Promise<void>;
  remove(id: string): Promise<void>;
  list(key: string): Promise<VoiceDraft[]>;
  /** The note's pieces joined in order, and when the last of them arrived. */
  read(id: string): Promise<{ blob: Blob; lastAt: number } | null>;
}

export function memoryVoiceStore(): VoiceDraftStore {
  const drafts = new Map<string, VoiceDraft>();
  const chunks = new Map<string, { index: number; blob: Blob; at: number }[]>();
  return {
    async begin(d) { drafts.set(d.id, { ...d }); chunks.set(d.id, []); },
    async chunk(id, index, blob, at) { if (drafts.has(id)) chunks.get(id)!.push({ index, blob, at }); },
    async finish(id, end) { const d = drafts.get(id); if (d) drafts.set(id, { ...d, ...end, done: true }); },
    async sent(id, at) { const d = drafts.get(id); if (d) drafts.set(id, { ...d, sentAt: at }); },
    async remove(id) { drafts.delete(id); chunks.delete(id); },
    async list(key) { return [...drafts.values()].filter((d) => d.key === key).map((d) => ({ ...d })); },
    async read(id) {
      const d = drafts.get(id);
      const got = [...(chunks.get(id) ?? [])].sort((a, b) => a.index - b.index);
      if (!d || !got.length) return null;
      return { blob: new Blob(got.map((c) => c.blob), { type: d.mime }), lastAt: Math.max(...got.map((c) => c.at)) };
    },
  };
}

const DB = 'agentbox-voice-drafts';
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((ok, bad) => { r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
const done = (t: IDBTransaction) => new Promise<void>((ok, bad) => { t.oncomplete = () => ok(); t.onerror = () => bad(t.error); t.onabort = () => bad(t.error); });

export function indexedVoiceStore(idb: IDBFactory = indexedDB): VoiceDraftStore {
  let opened: Promise<IDBDatabase> | null = null;
  // A connection the browser closes is opened again on the next write.
  const db = () => (opened ??= new Promise((ok, bad) => {
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('drafts', { keyPath: 'id' }).createIndex('key', 'key');
      d.createObjectStore('chunks', { keyPath: ['id', 'index'] }).createIndex('id', 'id');
    };
    r.onsuccess = () => {
      const d = r.result;
      d.onclose = () => { opened = null; };
      d.onversionchange = () => { d.close(); opened = null; };
      ok(d);
    };
    r.onerror = () => { opened = null; bad(r.error); };
  }));
  const write = async (stores: string[], fn: (t: IDBTransaction) => void) => {
    const t = (await db()).transaction(stores, 'readwrite');
    fn(t);
    await done(t);
  };
  return {
    begin: (d) => write(['drafts'], (t) => { t.objectStore('drafts').put(d); }),
    chunk: (id, index, blob, at) => write(['chunks'], (t) => { t.objectStore('chunks').put({ id, index, blob, at }); }),
    async finish(id, end) {
      const t = (await db()).transaction(['drafts'], 'readwrite');
      const s = t.objectStore('drafts');
      const d = await req(s.get(id) as IDBRequest<VoiceDraft | undefined>);
      if (d) s.put({ ...d, ...end, done: true });
      await done(t);
    },
    async sent(id, at) {
      const t = (await db()).transaction(['drafts'], 'readwrite');
      const s = t.objectStore('drafts');
      const d = await req(s.get(id) as IDBRequest<VoiceDraft | undefined>);
      if (d) s.put({ ...d, sentAt: at });
      await done(t);
    },
    async remove(id) {
      const t = (await db()).transaction(['drafts', 'chunks'], 'readwrite');
      t.objectStore('drafts').delete(id);
      t.objectStore('chunks').delete(IDBKeyRange.bound([id, -Infinity], [id, Infinity]));
      await done(t);
    },
    async list(key) {
      const t = (await db()).transaction(['drafts'], 'readonly');
      return req(t.objectStore('drafts').index('key').getAll(key) as IDBRequest<VoiceDraft[]>);
    },
    async read(id) {
      const t = (await db()).transaction(['drafts', 'chunks'], 'readonly');
      const d = await req(t.objectStore('drafts').get(id) as IDBRequest<VoiceDraft | undefined>);
      const got = await req(t.objectStore('chunks').index('id').getAll(id) as IDBRequest<{ index: number; blob: Blob; at: number }[]>);
      if (!d || !got.length) return null;
      got.sort((a, b) => a.index - b.index);
      return { blob: new Blob(got.map((c) => c.blob), { type: d.mime }), lastAt: Math.max(...got.map((c) => c.at)) };
    },
  };
}

// --------------------------------------------------- the list for the folded box

const LIST_KEY = 'voice.drafts';
type Listed = Record<string, { id: string; ms?: number }[]>;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'> | null | undefined;
const local = (): Storage => { try { return globalThis.localStorage; } catch { return null; } };

function readList(s: Storage): Listed {
  try { const v = JSON.parse(s?.getItem(LIST_KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function writeList(s: Storage, list: Listed) {
  try { s?.setItem(LIST_KEY, JSON.stringify(list)); } catch { /* the folded box just will not say it */ }
}

/** The voice notes waiting in one conversation's box, for whatever reads drafts synchronously. */
export function voiceDraftsFor(key: string, s: Storage = local()): { id: string; ms?: number }[] {
  return readList(s)[key] ?? [];
}

/** The store, keeping the list in step with it. */
export function listedVoiceStore(inner: VoiceDraftStore, s: Storage = local()): VoiceDraftStore {
  const keyOf = new Map<string, string>();
  const put = (key: string, id: string, ms?: number) => {
    const list = readList(s);
    list[key] = [...(list[key] ?? []).filter((x) => x.id !== id), { id, ...(ms != null ? { ms } : {}) }];
    writeList(s, list);
  };
  const drop = (id: string) => {
    const list = readList(s);
    for (const k of Object.keys(list)) {
      list[k] = list[k].filter((x) => x.id !== id);
      if (!list[k].length) delete list[k];
    }
    writeList(s, list);
  };
  return {
    ...inner,
    async begin(d) { keyOf.set(d.id, d.key); put(d.key, d.id); await inner.begin(d); },
    async finish(id, end) { const key = keyOf.get(id); if (key) put(key, id, end.ms); await inner.finish(id, end); },
    async sent(id, at) {
      const key = keyOf.get(id);
      if (key) { if (at == null) put(key, id); else drop(id); }
      await inner.sent(id, at);
    },
    async remove(id) { drop(id); keyOf.delete(id); await inner.remove(id); },
    // The list follows what the store really holds for this box, so a write
    // that never landed cannot leave the folded box naming a note forever.
    async list(key) {
      const got = await inner.list(key);
      for (const d of got) keyOf.set(d.id, d.key);
      const list = readList(s);
      const waiting = got.filter((d) => !d.sentAt);
      if (waiting.length) list[key] = waiting.map((d) => ({ id: d.id, ...(d.ms != null ? { ms: d.ms } : {}) }));
      else delete list[key];
      writeList(s, list);
      return got;
    },
  };
}
