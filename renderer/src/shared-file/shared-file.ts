// A FILE SHARED BY ITS LINK, as the web app reads it: <site>/f/<token>.
// The database side is cloud/supabase/migrations/20261105000001_a_file_anyone_with_its_link_can_read.sql
// and 20261112120000_a_link_says_who_can_open_it_and_what_they_can_do.sql.
import { mergeText } from '../../../shared/text-merge.mts';

import { cleanPlace, type NotePlace, type RawPlace } from '../../../shared/artifact-marks.mts';

export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type FileKind = 'markdown' | 'page' | 'image' | 'pdf' | 'video';

// The rows the database's functions answer with, as JSON; checked field by field below.
interface LinkRow { name?: string; kind: FileKind; type?: string; body?: string; version?: number; created_at: string; updated_at: string; owner_name?: unknown; owner_avatar?: unknown; mine?: boolean; can?: unknown; rev?: unknown; changed_by_name?: unknown; anyone?: unknown }
interface VersionRow { id: string; rev?: number; how?: unknown; by_name?: unknown; by_owner?: boolean; at: string; current?: boolean }
interface CommentRow { id: string; by_name?: unknown; by_avatar?: unknown; body?: string; created_at: string; mine?: boolean; by_owner?: boolean; place?: unknown }

export interface SharedFile {
  name: string;
  kind: FileKind;
  type: string;
  /** Words for markdown and a page, base64 for an image or a PDF. */
  body: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  ownerName: string;
  ownerAvatar: string | null;
  mine: boolean;
  /** What this person may do with it. Signed out, writing asks them to sign in first. */
  can: LinkCan;
  /** Which copy the link holds; 0 on a database too old to edit or keep history. */
  rev: number;
  /** Who made the copy the link holds, when it was not its owner. */
  changedByName: string | null;
  /** The site's own /raw address can read it signed out. */
  anyone: boolean;
}

export type LinkCan = 'view' | 'comment' | 'edit' | 'owner';
const RANK: Record<LinkCan, number> = { view: 1, comment: 2, edit: 3, owner: 4 };
export const mayComment = (file: Pick<SharedFile, 'can'>): boolean => RANK[file.can] >= 2;
/** Edited on its page: a document or a table, by an editor or its owner. */
export const mayEdit = (file: Pick<SharedFile, 'can' | 'kind' | 'rev'>): boolean => RANK[file.can] >= 3 && file.kind === 'markdown' && file.rev > 0;
export const mayLookBack = (file: Pick<SharedFile, 'can' | 'kind' | 'rev'>): boolean => RANK[file.can] >= 3 && (file.kind === 'markdown' || file.kind === 'page') && file.rev > 0;

export type Shown = { state: 'file'; file: SharedFile } | { state: 'stopped' } | { state: 'unknown' } | { state: 'sign-in' } | { state: 'no-access' };

export interface LinkVersion { id: string; how: 'shared' | 'edited' | 'restored'; byName: string; byOwner: boolean; at: number; current: boolean }

export interface FileComment {
  id: string;
  byName: string;
  byAvatar: string | null;
  body: string;
  createdAt: number;
  mine: boolean;
  byOwner: boolean;
  /** Where in the file it points; none for the whole file. */
  place?: NotePlace;
}

// What a sentence leaves on a pasted link ("here it is: <link>." or "(<link>)").
const PATH = /^\/f\/([A-Za-z0-9_-]{16,64})\/?(?:[.,;:!?)\]}>'"\s]|%20|%29|%5D|%22|%27)*$/;

/** The token when this address is a shared file on the web app; null anywhere else. */
export function sharedFileToken(pathname: string, onTheWebApp: boolean): string | null {
  if (!onTheWebApp) return null;
  return PATH.exec(pathname.replace(/^\/F\//, '/f/'))?.[1] ?? null;
}

const KINDS = new Set<FileKind>(['markdown', 'page', 'image', 'pdf', 'video']);

export async function readSharedFile(rpc: Rpc, tok: string): Promise<Shown> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(tok)) return { state: 'unknown' };
  const rows = await rpc('file_link_view', { tok }) as LinkRow[] | null;
  const r = Array.isArray(rows) ? rows[0] : null;
  if (r && KINDS.has(r.kind)) {
    return {
      state: 'file',
      file: {
        name: String(r.name ?? ''), kind: r.kind, type: String(r.type ?? ''), body: String(r.body ?? ''),
        version: Number(r.version) || 1,
        createdAt: Date.parse(r.created_at) || Date.parse(r.updated_at) || 0, updatedAt: Date.parse(r.updated_at) || 0,
        ownerName: (typeof r.owner_name === 'string' && r.owner_name.trim()) || 'Someone',
        ownerAvatar: typeof r.owner_avatar === 'string' && /^https:/.test(r.owner_avatar) ? r.owner_avatar : null,
        mine: r.mine === true,
        // A database from before links said what they allow answers none of these: every link let anyone comment.
        can: r.mine === true ? 'owner' : typeof r.can === 'string' && r.can in RANK ? r.can as LinkCan : 'comment',
        rev: Number.isInteger(r.rev) ? r.rev as number : 0,
        changedByName: typeof r.changed_by_name === 'string' && r.changed_by_name.trim() ? r.changed_by_name.trim() : null,
        anyone: r.anyone !== false,
      },
    };
  }
  let door: unknown = null;
  try { door = await rpc('file_link_door', { tok }); } catch { /* an older database has no door; the stopped check says enough */ }
  if (door === 'sign-in' || door === 'no-access' || door === 'stopped') return { state: door };
  if (door === 'unknown') return { state: 'unknown' };
  return (await rpc('file_link_stopped', { tok })) === true ? { state: 'stopped' } : { state: 'unknown' };
}

/**
 * Saves an editor's words over the copy they started from. When somebody saved
 * in between, the two are merged and saved over theirs, so nobody's words are lost.
 */
export async function saveEdit(
  rpc: Rpc, latest: () => Promise<Pick<SharedFile, 'body' | 'rev'> | null>, tok: string, mine: string, from: { rev: number; body: string },
): Promise<{ rev: number; body: string; merged: boolean }> {
  try {
    return { rev: Number(await rpc('edit_file_link', { tok, b: mine, base: from.rev })), body: mine, merged: false };
  } catch (err) {
    if (!/changed since/i.test(String((err as Error)?.message ?? err))) throw err;
    const theirs = await latest();
    if (!theirs) throw err;
    const body = mergeText(from.body, theirs.body, mine, { overlap: 'mine' }).text;
    return { rev: Number(await rpc('edit_file_link', { tok, b: body, base: theirs.rev })), body, merged: true };
  }
}

const HOW = new Set(['shared', 'edited', 'restored']);
export async function readHistory(rpc: Rpc, tok: string): Promise<LinkVersion[]> {
  const rows = await rpc('file_link_history', { tok }) as VersionRow[] | null;
  return (Array.isArray(rows) ? rows : []).filter((r) => HOW.has(String(r.how))).map((r) => ({
    id: String(r.id), how: r.how as LinkVersion['how'], byName: (typeof r.by_name === 'string' && r.by_name.trim()) || 'Someone',
    byOwner: r.by_owner === true, at: Date.parse(r.at) || 0, current: r.current === true,
  }));
}

export async function readVersion(rpc: Rpc, tok: string, id: string): Promise<string | null> {
  const body = await rpc('file_link_version', { tok, v: id });
  return typeof body === 'string' ? body : null;
}

export async function restoreVersion(rpc: Rpc, tok: string, id: string, base: number): Promise<number> {
  return Number(await rpc('restore_file_link_version', { tok, v: id, base }));
}

/** A version's time, always with the hour, as several fall on one day. */
export function versionWhen(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
  if (d.toDateString() === new Date(now).toDateString()) return `Today at ${time}`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })} at ${time}`;
}

export function versionLine(v: Pick<LinkVersion, 'how' | 'byName'>): string {
  return `${v.how === 'shared' ? 'Shared' : v.how === 'restored' ? 'Restored' : 'Edited'} by ${v.byName}`;
}

export async function readComments(rpc: Rpc, tok: string): Promise<FileComment[]> {
  const rows = await rpc('file_link_comments_of', { tok }) as CommentRow[] | null;
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: String(r.id), byName: (typeof r.by_name === 'string' && r.by_name.trim()) || 'Someone',
    byAvatar: typeof r.by_avatar === 'string' && /^https:/.test(r.by_avatar) ? r.by_avatar : null,
    body: String(r.body ?? ''), createdAt: Date.parse(r.created_at) || 0, mine: r.mine === true, byOwner: r.by_owner === true,
    ...placed(r.place),
  }));
}

const placed = (raw: unknown): { place?: NotePlace } => { const place = cleanPlace(raw as RawPlace | null); return place && place.kind !== 'whole' ? { place } : {}; };

/** `place` none or the whole file: the two-word call, which a database without places still answers. */
export async function postComment(rpc: Rpc, tok: string, words: string, place: NotePlace | null = null): Promise<string> {
  const p = placed(place).place;
  return String(await rpc('comment_on_file_link', p ? { tok, b: words, p } : { tok, b: words }));
}

export async function removeComment(rpc: Rpc, id: string): Promise<void> {
  await rpc('remove_file_link_comment', { c: id });
}

/** An image's or a PDF's bytes, from the base64 the link carries. */
export function fileBytes(file: Pick<SharedFile, 'body'>): Uint8Array {
  const raw = atob(file.body.replace(/\s+/g, ''));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// A blob opens on this site's origin, where the reader's sign-in is kept, so one
// typed as a document would run the link owner's script there.
const RASTER = /^image\/(png|jpeg|gif|webp|avif|bmp|x-icon)$/i;
const FILM = /^video\/(mp4|webm|quicktime|ogg)$/i;

/** The type a blob made on this page may carry: one that can never open as a page. */
export function blobType(kind: string, type: string): string {
  if (kind === 'image' && RASTER.test(type)) return type.toLowerCase();
  if (kind === 'video') return FILM.test(type) ? type.toLowerCase() : 'video/mp4';
  return 'application/octet-stream';
}

/** Where a picture is drawn from. An SVG can carry script, so it comes from a data: address, whose origin is opaque. */
export function pictureAddress(file: Pick<SharedFile, 'body' | 'type'>): string {
  if (/^image\/svg\+xml$/i.test(file.type)) return `data:image/svg+xml;base64,${file.body.replace(/\s+/g, '')}`;
  return URL.createObjectURL(new Blob([fileBytes(file) as BlobPart], { type: blobType('image', file.type) }));
}

export function initialOf(name: string): string {
  return (name.trim().match(/\p{L}|\p{N}/u)?.[0] ?? '?').toUpperCase();
}

export function sharedOn(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  // Today it says the time, so someone told "it's fixed" can tell which copy they have.
  if (d.toDateString() === new Date(now).toDateString()) return `today at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '')}`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

const short = (name: string) => (name.length > 60 ? `${name.slice(0, 59)}…` : name);

export function sharedLine(file: Pick<SharedFile, 'ownerName' | 'updatedAt'> & { createdAt?: number; changedByName?: string | null }, now = Date.now()): string {
  const who = short(file.ownerName);
  if (!file.updatedAt) return `Shared by ${who}`;
  if (file.changedByName) return `Shared by ${who} · edited by ${short(file.changedByName)} ${sharedOn(file.updatedAt, now)}`;
  const updated = !!file.createdAt && file.updatedAt - file.createdAt > 1000;
  return `Shared by ${who} · ${updated ? 'updated ' : ''}${sharedOn(file.updatedAt, now)}`;
}

/** A film's link holds the list of its pieces (main/file-link.mts); null for anything else. */
export function filmOf(file: Pick<SharedFile, 'kind' | 'body'>): { pieces: number; size: number; hash: string } | null {
  if (file.kind !== 'video') return null;
  try {
    const { pieces, size, hash } = JSON.parse(file.body) as { pieces?: unknown; size?: unknown; hash?: unknown };
    if (!Number.isInteger(pieces) || (pieces as number) < 1 || !Number.isInteger(size) || typeof hash !== 'string' || !/^[0-9a-f]{40}$/.test(hash)) return null;
    return { pieces: pieces as number, size: size as number, hash };
  } catch { return null; }
}

/** A film's bytes, piece by piece in order; null when a piece is missing. */
export async function readFilm(
  piece: (name: string) => Promise<Uint8Array | null>, token: string, film: { pieces: number; hash: string },
  onProgress: (done: number) => void = () => {},
): Promise<Uint8Array[] | null> {
  const parts: Uint8Array[] = [];
  for (let n = 0; n < film.pieces; n++) {
    const got = await piece(`${token}/${film.hash}/${n}`);
    if (!got) return null;
    parts.push(got);
    onProgress((n + 1) / film.pieces);
  }
  return parts;
}

/** A table goes up as text, as a document does (main/file-link.mts); its type tells them apart. */
export const isTable = (file: { kind: string; type?: string }): boolean =>
  file.kind === 'markdown' && /^text\/(csv|tab-separated-values)$/i.test(file.type ?? '');

/**
 * The words over the file. A document's own first heading is its title, so the
 * page does not lead with "competitor-research.md"; `body` is the rest of it.
 */
export function titleOf(file: Pick<SharedFile, 'name' | 'kind' | 'body'> & { type?: string }): { title: string; body: string } {
  if (isTable(file)) return { title: file.name, body: file.body };
  if (file.kind === 'markdown') {
    const m = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(file.body);
    if (m) return { title: m[1], body: file.body.slice(m[0].length) };
    return { title: file.name.replace(/\.(md|markdown)$/i, ''), body: file.body };
  }
  if (file.kind === 'page') return { title: pageTitle(file.body) || file.name, body: file.body };
  return { title: file.name, body: file.body };
}

// Kept the same in cloud/web/shared-file-worker.mjs, which heads the link preview with it.
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function pageTitle(html: string): string {
  const raw = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(String(html ?? '').replace(/<svg\b[\s\S]*?<\/svg>/gi, ''))?.[1] ?? '';
  return raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? whole;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
  }).replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function commentWhen(ts: number, now = Date.now()): string {
  const m = Math.floor(Math.max(0, now - ts) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return days < 7 ? `${days}d` : sharedOn(ts, now);
}

/** The database's refusals are already plain words; a lost connection is said once, the same way. */
export function saidOf(err: unknown): string {
  const words = String((err as Error)?.message ?? err ?? '').trim();
  if (!words || /failed to fetch|network|load failed|aborted|timed? ?out|the cloud answered 5/i.test(words)) return 'That did not go through. Try again.';
  const sentences = words.split(/;\s*/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('. ');
  return /[.!?]$/.test(sentences) ? sentences : `${sentences}.`;
}
