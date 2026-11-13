// FILES IN THE CLOUD, THIS COMPUTER'S END (w-439393243c).
//
// On a plan that keeps files, every file Files lists is saved to the cloud
// under the sha256 of its bytes, and a film or picture nobody has opened for
// the chosen days leaves this computer until it is opened again. Documents,
// tables and code always stay: they are small and agents read them all the
// time. A plan that stops keeping files, or the switch turned off, brings
// everything back down before the cloud copy is deleted. An account that cannot be read changes nothing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

const LEAVES = new Set(['film', 'image']);
const DAY_MS = 24 * 60 * 60_000;
const LEDGER = 'files-cloud.json';
// What a bring-back leaves free on the disk, so a lapsed plan's files never fill it.
const KEEP_FREE = 2 * 2 ** 30;

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
  let ledger: Ledger = { up: {}, off: {}, opened: {} };
  try { ledger = { ...ledger, ...JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Ledger> }; } catch { /* none yet */ }
  let last: { cap: number | null; bytes: number; full: boolean } = { cap: null, bytes: 0, full: false };
  let passing: Promise<void> | null = null;
  const coming = new Map<string, Promise<boolean>>();

  const save = (): void => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ledger));
    fs.renameSync(tmp, file);
  };

  // A snapshot, so the bytes sent are the bytes hashed even if the file is written meanwhile.
  async function send(store: FilesStorage, v: KeptVersion): Promise<boolean> {
    const from = v.paths.find((p) => fs.existsSync(p));
    if (!from) return false;
    const snap = path.join(dir, 'sending', `${v.hash}.${process.pid}`);
    fs.mkdirSync(path.dirname(snap), { recursive: true });
    try {
      fs.copyFileSync(from, snap, fs.constants.COPYFILE_FICLONE);
      if (await hashOf(snap) !== v.hash) return false;
      await store.putFile(keyOf(v.hash), snap);
      ledger.up[v.hash] = { size: v.size, at: now() };
      save();
      return true;
    } finally { fs.rmSync(snap, { force: true }); }
  }

  async function takeOff(store: FilesStorage, v: KeptVersion): Promise<void> {
    const here: string[] = [];
    for (const p of v.paths) if (await hashOf(p) === v.hash) here.push(p);
    if (!here.length || !(await store.exists(keyOf(v.hash)))) return;
    let shown: string | undefined;
    if (poster) {
      const to = path.join(dir, 'posters', `${v.hash}.jpg`);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      if (await poster(here[0], to).catch(() => false)) shown = to;
    }
    ledger.off[v.hash] = { size: v.size, name: v.name, kind: v.kind, paths: here, at: now(), ...(shown ? { poster: shown } : {}) };
    save();
    for (const p of here) fs.rmSync(p, { force: true });
  }

  async function bringBackNow(hash: string): Promise<boolean> {
    const entry = ledger.off[hash];
    if (!entry) return true;
    const store = await storage();
    if (!store) return false;
    if (freeBytes && (await freeBytes()) < entry.size + KEEP_FREE) { log(`no room to bring back ${entry.name}`); return false; }
    const [first, ...rest] = entry.paths;
    const tmp = `${first}.coming-${process.pid}`;
    fs.mkdirSync(path.dirname(first), { recursive: true });
    try {
      if (!(await store.getToFile(keyOf(hash), tmp))) { log(`the cloud no longer has ${entry.name}`); return false; }
      if (await hashOf(tmp) !== hash) { log(`the cloud gave other bytes for ${entry.name}; it stays there`); return false; }
      fs.renameSync(tmp, first);
      for (const p of rest) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.copyFileSync(first, p, fs.constants.COPYFILE_FICLONE);
      }
    } finally { fs.rmSync(tmp, { force: true }); }
    if (entry.poster) fs.rmSync(entry.poster, { force: true });
    delete ledger.off[hash];
    ledger.opened[hash] = now();
    save();
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
        await store.del(keyOf(hash)).then(() => { delete ledger.up[hash]; save(); }, (err: Error) => { log(`could not delete a kept file: ${err.message}`); });
      }
      notify();
      return;
    }
    let bytes = acct.bytes;
    let full = acct.full;
    for (const v of [...versions].sort((a, b) => b.at - a.at)) {
      if (!v.movable || ledger.up[v.hash] || ledger.off[v.hash]) continue;
      if (full || bytes + v.size > acct.cap) { full = true; continue; }
      try {
        if (await send(store, v)) bytes += v.size;
      } catch (err) {
        const e = err as Error & { error?: string };
        if (e.error === 'files-full') full = true;
        else log(`could not save ${v.name} to the cloud: ${e.message}`);
      }
    }
    last = { cap: acct.cap, bytes, full };
    if (offAfterDays > 0) {
      const before = now() - offAfterDays * DAY_MS;
      for (const v of versions) {
        if (!v.movable || !LEAVES.has(v.kind ?? '') || !ledger.up[v.hash] || ledger.off[v.hash]) continue;
        if (Math.max(v.at, ledger.opened[v.hash] ?? 0) >= before) continue;
        await takeOff(store, v).catch((err: Error) => { log(`could not take ${v.name} off this computer: ${err.message}`); });
      }
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
    /** The kept file that was at `file` before it left this computer. */
    hashAt(file: string): string | null {
      const at = path.resolve(file);
      return Object.entries(ledger.off).find(([, e]) => e.paths.some((p) => path.resolve(p) === at))?.[0] ?? null;
    },
    isUp: (hash: string): boolean => !!ledger.up[hash],
    opened(hash: string): void { ledger.opened[hash] = now(); save(); },
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
