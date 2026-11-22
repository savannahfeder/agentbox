// FILES IN THE CLOUD, THIS COMPUTER'S END (w-439393243c).
//
// On a plan that keeps files, every file Files lists is saved to the cloud
// under the sha256 of its bytes, and a film, picture or sound nobody has opened
// for the chosen days leaves this computer until it is opened again. So does
// one in a project's folder that no thread names, once it is old enough to
// leave (main/files-loose.mts). Documents, tables and code always stay: they
// are small and agents read them all the time. A plan that stops keeping
// files, or the switch turned off, brings everything back down before the
// cloud copy is deleted. An account that cannot be read changes nothing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cloneFile } from './clone-file.mts';

export interface KeptVersion {
  hash: string;
  size: number;
  /** Every place on this computer that holds these bytes, the version line's kept copy included. */
  paths: string[];
  kind: string | null;
  /** When the version was made. */
  at: number;
  name: string;
  /** Inside a project's own documents or the version line, never a code folder. */
  movable: boolean;
  /** No thread names it: it is sent only when it may leave, and gets no poster, as Files never shows it. */
  loose?: boolean;
  /** In an open thread's own folder, where its agent works: never taken off. */
  stays?: boolean;
}

export interface FilesStorage {
  putFile(key: string, file: string): Promise<void>;
  getToFile(key: string, file: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  del(key: string): Promise<void>;
}

export interface FilesAccount { bytes: number; cap: number; full: boolean }

export interface OffEntry { size: number; name: string; kind: string | null; paths: string[]; at: number; poster?: string }

export interface KeeperStatus {
  /** null while the account cannot be read. */
  cap: number | null;
  bytes: number;
  full: boolean;
  on: boolean;
  offAfterDays: number;
  /** Bytes taken off this computer and kept in the cloud. */
  offBytes: number;
}

interface Ledger { up: Record<string, { size: number; at: number }>; off: Record<string, OffEntry>; opened: Record<string, number> }

type Change =
  | { up: string; size: number; at: number }
  | { gone: string }
  | { off: string; entry: OffEntry }
  | { back: string }
  | { opened: string; at: number };

function apply(l: Ledger, c: Change): void {
  if ('up' in c) l.up[c.up] = { size: c.size, at: c.at };
  else if ('gone' in c) delete l.up[c.gone];
  else if ('off' in c) l.off[c.off] = c.entry;
  else if ('back' in c) delete l.off[c.back];
  else if ('opened' in c) l.opened[c.opened] = c.at;
}

const LEAVES = new Set(['film', 'image', 'sound']);
const DAY_MS = 24 * 60 * 60_000;
const LEDGER = 'files-cloud.json';
// Each change is a line here, so tens of thousands of files are not a rewrite of the whole record each.
const CHANGES = 'files-cloud.jsonl';
const FOLD_AFTER = 2000;
// What a bring-back leaves free on the disk, so a lapsed plan's files never fill it.
const KEEP_FREE = 2 * 2 ** 30;
// A thread's folder can be thousands of files.
const FETCH_AT_ONCE = 4;

/** One version per set of bytes, holding every place any of them names. */
function oneEach(versions: readonly KeptVersion[]): KeptVersion[] {
  const by = new Map<string, KeptVersion>();
  for (const v of versions) {
    const had = by.get(v.hash);
    if (!had) { by.set(v.hash, { ...v, paths: [...v.paths] }); continue; }
    for (const p of v.paths) if (!had.paths.includes(p)) had.paths.push(p);
    had.movable &&= v.movable;
    had.stays = !!(had.stays || v.stays);
    if (had.loose && !v.loose) Object.assign(had, { kind: v.kind, name: v.name, loose: false });
    had.at = Math.max(had.at, v.at);
  }
  return [...by.values()];
}

export const keyOf = (hash: string): string => `files/${hash}`;

/** Days a film or picture stays on this computer unopened; 0 is never taken off. */
export const OFF_AFTER_DAYS = [7, 30, 90, 0] as const;
export const DEFAULT_OFF_AFTER = 30;

/** On from the start, as a paid plan's files are; off only when someone switches it off. */
export function filesSettingsOf(config: { filesInCloud?: unknown; filesOffAfterDays?: unknown }): { on: boolean; offAfterDays: number } {
  const days = Number(config.filesOffAfterDays);
  return { on: config.filesInCloud !== false, offAfterDays: (OFF_AFTER_DAYS as readonly number[]).includes(days) && config.filesOffAfterDays != null ? days : DEFAULT_OFF_AFTER };
}

async function hashOf(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', () => resolve(null));
  });
}

export function filesKeeper({ dir, storage, account, settings, now = Date.now, poster = null, freeBytes = null, notify = () => {}, log = (m: string) => console.warn(`files: ${m}`) }: {
  dir: string;
  storage: () => Promise<FilesStorage | null>;
  account: () => Promise<FilesAccount | null>;
  settings: () => { on: boolean; offAfterDays: number };
  now?: () => number;
  /** A small picture of `src` written to `to`; false when there is none. */
  poster?: ((src: string, to: string) => Promise<boolean>) | null;
  freeBytes?: (() => Promise<number>) | null;
  notify?: () => void;
  log?: (m: string) => void;
}) {
  const file = path.join(dir, LEDGER);
  const changesFile = path.join(dir, CHANGES);
  let ledger: Ledger = { up: {}, off: {}, opened: {} };
  try { ledger = { ...ledger, ...JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Ledger> }; } catch { /* none yet */ }
  let changes = 0;
  try {
    for (const line of fs.readFileSync(changesFile, 'utf8').split('\n')) {
      if (!line) continue;
      try { apply(ledger, JSON.parse(line) as Change); changes += 1; } catch { /* a line cut short by a crash */ }
    }
  } catch { /* none yet */ }
  let last: { cap: number | null; bytes: number; full: boolean } = { cap: null, bytes: 0, full: false };
  let passing: Promise<void> | null = null;
  const coming = new Map<string, Promise<boolean>>();

  const fold = (): void => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger));
    fs.renameSync(tmp, file);
    fs.writeFileSync(changesFile, '');
    changes = 0;
  };
  // A change is written before what it records happens to the files, so a crash never loses a file's place.
  const note = (c: Change): void => {
    apply(ledger, c);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(changesFile, `${JSON.stringify(c)}\n`);
    if (++changes >= FOLD_AFTER) fold();
  };
  // A torn last line would swallow the next change written after it.
  if (changes) fold();

  let fetching = 0;
  const waitingToFetch: Array<() => void> = [];
  async function inTurn<T>(fn: () => Promise<T>): Promise<T> {
    if (fetching >= FETCH_AT_ONCE) await new Promise<void>((r) => waitingToFetch.push(r));
    fetching += 1;
    try { return await fn(); } finally { fetching -= 1; waitingToFetch.shift()?.(); }
  }

  const mayLeave = (v: KeptVersion, offAfterDays: number): boolean => v.movable && !v.stays && LEAVES.has(v.kind ?? '') && offAfterDays > 0
    && Math.max(v.at, ledger.opened[v.hash] ?? 0) < now() - offAfterDays * DAY_MS;

  // A snapshot, so the bytes sent are the bytes hashed even if the file is written meanwhile.
  async function send(store: FilesStorage, v: KeptVersion): Promise<boolean> {
    const from = v.paths.find((p) => fs.existsSync(p));
    if (!from) return false;
    const snap = path.join(dir, 'sending', `${v.hash}.${process.pid}`);
    fs.mkdirSync(path.dirname(snap), { recursive: true });
    try {
      await cloneFile(from, snap);
      if (await hashOf(snap) !== v.hash) return false;
      await store.putFile(keyOf(v.hash), snap);
      note({ up: v.hash, size: v.size, at: now() });
      return true;
    } finally { fs.rmSync(snap, { force: true }); }
  }

  async function takeOff(store: FilesStorage, v: KeptVersion): Promise<void> {
    const here: string[] = [];
    for (const p of v.paths) if (await hashOf(p) === v.hash) here.push(p);
    if (!here.length || !(await store.exists(keyOf(v.hash)))) return;
    let shown: string | undefined;
    if (poster && !v.loose) {
      const to = path.join(dir, 'posters', `${v.hash}.jpg`);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      if (await poster(here[0], to).catch(() => false)) shown = to;
    }
    note({ off: v.hash, entry: { size: v.size, name: v.name, kind: v.kind, paths: here, at: now(), ...(shown ? { poster: shown } : {}) } });
    for (const p of here) fs.rmSync(p, { force: true });
  }

  async function bringBackNow(hash: string): Promise<boolean> {
    const entry = ledger.off[hash];
    if (!entry) return true;
    const store = await storage();
    if (!store) return false;
    if (freeBytes && (await freeBytes()) < entry.size + KEEP_FREE) { log(`no room to bring back ${entry.name}`); return false; }
    // A file at one of its paths now is newer work, so it only fills the free ones.
    const free = entry.paths.filter((p) => !fs.existsSync(p));
    if (!free.length) { log(`newer files took every place ${entry.name} came from; it stays in the cloud`); return false; }
    const [first, ...rest] = free;
    const tmp = `${first}.coming-${process.pid}`;
    fs.mkdirSync(path.dirname(first), { recursive: true });
    try {
      if (!(await inTurn(() => store.getToFile(keyOf(hash), tmp)))) { log(`the cloud no longer has ${entry.name}`); return false; }
      if (await hashOf(tmp) !== hash) { log(`the cloud gave other bytes for ${entry.name}; it stays there`); return false; }
      // Never over a file that turned up while it came down.
      const put = (place: () => void) => { try { place(); } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err; } };
      put(() => fs.linkSync(tmp, first));
      for (const p of rest) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const twin = `${p}.coming-${process.pid}`;
        try {
          await cloneFile(tmp, twin);
          put(() => fs.linkSync(twin, p));
        } finally { fs.rmSync(twin, { force: true }); }
      }
    } finally { fs.rmSync(tmp, { force: true }); }
    if (entry.poster) fs.rmSync(entry.poster, { force: true });
    note({ back: hash });
    note({ opened: hash, at: now() });
    notify();
    return true;
  }

  async function passNow(versions: readonly KeptVersion[]): Promise<void> {
    const acct = await account().catch(() => null);
    last = { cap: acct?.cap ?? null, bytes: acct?.bytes ?? last.bytes, full: !!acct?.full };
    if (!acct) return;
    const store = await storage();
    if (!store) return;
    const { on, offAfterDays } = settings();
    if (!acct.cap || !on) {
      for (const hash of Object.keys(ledger.off)) await bringBack(hash).catch((err: Error) => { log(`could not bring back ${ledger.off[hash]?.name}: ${err.message}`); });
      for (const hash of Object.keys(ledger.up)) {
        if (ledger.off[hash]) continue;
        await store.del(keyOf(hash)).then(() => { note({ gone: hash }); }, (err: Error) => { log(`could not delete a kept file: ${err.message}`); });
      }
      notify();
      return;
    }
    const each = oneEach(versions);
    const leave = (v: KeptVersion) => takeOff(store, v).catch((err: Error) => { log(`could not take ${v.name} off this computer: ${err.message}`); });
    let bytes = acct.bytes;
    let full = acct.full;
    for (const v of [...each].sort((a, b) => b.at - a.at)) {
      if (!v.movable || ledger.up[v.hash] || ledger.off[v.hash]) continue;
      if (v.loose && !mayLeave(v, offAfterDays)) continue;
      if (full || bytes + v.size > acct.cap) { full = true; continue; }
      try {
        if (await send(store, v)) {
          bytes += v.size;
          if (mayLeave(v, offAfterDays)) await leave(v);
        }
      } catch (err) {
        const e = err as Error & { error?: string };
        if (e.error === 'files-full') full = true;
        else log(`could not save ${v.name} to the cloud: ${e.message}`);
      }
    }
    last = { cap: acct.cap, bytes, full };
    for (const v of each) {
      if (!ledger.up[v.hash] || ledger.off[v.hash] || !mayLeave(v, offAfterDays)) continue;
      await leave(v);
    }
    notify();
  }

  function bringBack(hash: string): Promise<boolean> {
    if (!coming.has(hash)) coming.set(hash, bringBackNow(hash).finally(() => coming.delete(hash)));
    return coming.get(hash)!;
  }

  return {
    /** One pass: send what is new, then take off what has gone unopened. One runs at a time. */
    pass(versions: readonly KeptVersion[]): Promise<void> {
      passing ??= passNow(versions).catch((err: Error) => { log(`a pass failed: ${err.message}`); }).finally(() => { passing = null; });
      return passing;
    },
    bringBack,
    /** Whether a pass would send or take off anything, so a computer with no plan for files never weighs them. */
    async wantsVersions(): Promise<boolean> {
      const acct = await account().catch(() => null);
      return !!acct?.cap && settings().on;
    },
    /** True while `hash` is on its way back. */
    isComing: (hash: string): boolean => coming.has(hash),
    off: (hash: string): OffEntry | null => ledger.off[hash] ?? null,
    /** Every kept file that left from a place inside `folder`. */
    offUnder(folder: string): string[] {
      const inside = `${path.resolve(folder)}${path.sep}`;
      return Object.entries(ledger.off).filter(([, e]) => e.paths.some((p) => path.resolve(p).startsWith(inside))).map(([hash]) => hash);
    },
    /** The kept file that was at `file` before it left this computer. */
    hashAt(file: string): string | null {
      const at = path.resolve(file);
      return Object.entries(ledger.off).find(([, e]) => e.paths.some((p) => path.resolve(p) === at))?.[0] ?? null;
    },
    isUp: (hash: string): boolean => !!ledger.up[hash],
    opened(hash: string): void { note({ opened: hash, at: now() }); },
    /** The status with the account read again, for a page that shows it. */
    async look(): Promise<KeeperStatus> {
      const acct = await account().catch(() => null);
      if (acct) last = { cap: acct.cap, bytes: acct.bytes, full: acct.full };
      return this.status();
    },
    status(): KeeperStatus {
      const { on, offAfterDays } = settings();
      return { ...last, on, offAfterDays, offBytes: Object.values(ledger.off).reduce((s, e) => s + e.size, 0) };
    },
  };
}

export type FilesKeeper = ReturnType<typeof filesKeeper>;
