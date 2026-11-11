// A FILE SHARED BY ITS LINK, as the web app reads it: <site>/f/<token>.
// The database side is cloud/supabase/migrations/20261105000001_a_file_anyone_with_its_link_can_read.sql.

export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type FileKind = 'markdown' | 'page' | 'image' | 'pdf' | 'video';

// The rows the database's functions answer with, as JSON; checked field by field below.
interface LinkRow { name?: string; kind: FileKind; type?: string; body?: string; version?: number; created_at: string; updated_at: string; owner_name?: unknown; owner_avatar?: unknown; mine?: boolean }
interface CommentRow { id: string; by_name?: unknown; by_avatar?: unknown; body?: string; created_at: string; mine?: boolean; by_owner?: boolean }

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
}

export type Shown = { state: 'file'; file: SharedFile } | { state: 'stopped' } | { state: 'unknown' };

export interface FileComment {
  id: string;
  byName: string;
  byAvatar: string | null;
  body: string;
  createdAt: number;
  mine: boolean;
  byOwner: boolean;
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
      },
    };
  }
  return (await rpc('file_link_stopped', { tok })) === true ? { state: 'stopped' } : { state: 'unknown' };
}

export async function readComments(rpc: Rpc, tok: string): Promise<FileComment[]> {
  const rows = await rpc('file_link_comments_of', { tok }) as CommentRow[] | null;
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: String(r.id), byName: (typeof r.by_name === 'string' && r.by_name.trim()) || 'Someone',
    byAvatar: typeof r.by_avatar === 'string' && /^https:/.test(r.by_avatar) ? r.by_avatar : null,
    body: String(r.body ?? ''), createdAt: Date.parse(r.created_at) || 0, mine: r.mine === true, byOwner: r.by_owner === true,
  }));
}

export async function postComment(rpc: Rpc, tok: string, words: string): Promise<string> {
  return String(await rpc('comment_on_file_link', { tok, b: words }));
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

export function sharedLine(file: Pick<SharedFile, 'ownerName' | 'updatedAt'> & { createdAt?: number }, now = Date.now()): string {
  const who = file.ownerName.length > 60 ? `${file.ownerName.slice(0, 59)}…` : file.ownerName;
  if (!file.updatedAt) return `Shared by ${who}`;
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
