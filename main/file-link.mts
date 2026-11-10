// A FILE ON THIS COMPUTER, READY TO GO INTO A LINK ANYONE CAN OPEN
// (cloud/supabase/migrations/20261105000001_a_file_anyone_with_its_link_can_read.sql).
//
// A page's own pictures, styles and scripts are put inside it, because the
// copy on the web has no folder beside it. Only files in the page's own
// folder or below go in: a page that names ../../.ssh/id_rsa must not put a
// key on a public page.
import crypto from 'node:crypto';
import fsDefault from 'node:fs';
import path from 'node:path';
import { PHONE_SITE } from '../shared/cloud-address.mts';

export const LINK_MAX_BYTES = 6_000_000;
const MAX_BODY_CHARS = 8_400_000;

type LinkFs = Pick<typeof fsDefault, 'readFileSync' | 'realpathSync'>;

export type LinkKind = 'markdown' | 'page' | 'image' | 'pdf';
export interface LinkFile { kind: LinkKind; type: string; body: string; hash: string; error?: undefined }
export interface LinkCopy extends LinkFile { name: string; version: number }

const KINDS: Record<string, readonly [LinkKind, string] | undefined> = {
  '.md': ['markdown', 'text/markdown'], '.markdown': ['markdown', 'text/markdown'],
  '.html': ['page', 'text/html'], '.htm': ['page', 'text/html'],
  '.png': ['image', 'image/png'], '.jpg': ['image', 'image/jpeg'], '.jpeg': ['image', 'image/jpeg'],
  '.gif': ['image', 'image/gif'], '.webp': ['image', 'image/webp'], '.svg': ['image', 'image/svg+xml'],
  '.pdf': ['pdf', 'application/pdf'],
};
const INSIDE_TYPES: Record<string, string | undefined> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/** What a link would show this file as, or null when a link cannot draw it. */
export function linkKindOf(name: unknown): { kind: LinkKind; type: string } | null {
  const k = KINDS[path.extname(String(name ?? '')).toLowerCase()];
  return k ? { kind: k[0], type: k[1] } : null;
}

/** Which file a link belongs to, so sharing it again keeps the same link. */
export const linkSource = (product: unknown, thread: unknown, family: unknown): string => [product, thread, family].map((s) => String(s ?? '')).join('/').slice(0, 400);

export const linkAddress = (site: string, token: string): string => `${String(site).replace(/\/+$/, '')}/f/${token}`;

// Our cloud's web app answers on both addresses; a link people pass around
// reads as ours.
const OUR_SITE = 'https://app.agentbox.ac';
export function linkSiteFor(site: unknown): string | null {
  if (typeof site !== 'string') return null;
  // A stand-in cloud's site on this computer has no certificate.
  if (!/^https:\/\/[^\s/]+\/*$/.test(site) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/*$/.test(site)) return null;
  const s = site.replace(/\/+$/, '');
  return s === PHONE_SITE ? OUR_SITE : s;
}

const outside = (ref: string): boolean => !ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(ref);

function pageWithItsFiles(html: string, file: string, fs: LinkFs): string {
  const dir = path.dirname(file);
  let room = LINK_MAX_BYTES - Buffer.byteLength(html);
  const cache = new Map<string, string | null>();
  const inline = (ref: string): string | null | undefined => {
    const clean = ref.trim().split(/[?#]/)[0];
    if (outside(clean)) return null;
    let rel;
    try { rel = decodeURIComponent(clean); } catch { return null; }
    const target = path.resolve(dir, rel);
    if (target !== dir && !target.startsWith(dir + path.sep)) return null;
    const type = INSIDE_TYPES[path.extname(target).toLowerCase()];
    if (!type) return null;
    if (cache.has(target)) return cache.get(target);
    let out: string | null = null;
    try {
      const real = fs.realpathSync(target);
      const realDir = fs.realpathSync(dir);
      if (real.startsWith(realDir + path.sep)) {
        const bytes = fs.readFileSync(real);
        const url = `data:${type};base64,${bytes.toString('base64')}`;
        if (url.length <= room) { room -= url.length; out = url; }
      }
    } catch { out = null; }
    cache.set(target, out);
    return out;
  };
  const swap = (whole: string, before: string, q: string, ref: string): string => { const d = inline(ref); return d ? `${before}${q}${d}${q}` : whole; };
  return html
    .replace(/(\s(?:src|poster)\s*=\s*)(["'])([^"']*)\2/gi, swap)
    .replace(/<link\b[^>]*>/gi, (tag: string) => tag.replace(/(\shref\s*=\s*)(["'])([^"']*)\2/i, swap))
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole: string, q: string, ref: string) => { const d = inline(ref); return d ? `url(${q}${d}${q})` : whole; });
}

/** The file as a link carries it: { kind, type, body } or { error } in words. */
export function fileForLink(file: string, { fs = fsDefault }: { fs?: LinkFs } = {}): LinkFile | { error: string } {
  const kind = linkKindOf(file);
  if (!kind) return { error: 'Only documents, pages, pictures and PDFs can be shared as a link.' };
  let bytes: Buffer;
  try { bytes = fs.readFileSync(file); } catch { return { error: 'This file is not on this computer any more.' }; }
  if (bytes.length > LINK_MAX_BYTES) return { error: `This file is over ${LINK_MAX_BYTES / 1e6} MB, too big to share as a link.` };
  let body: string;
  if (kind.kind === 'markdown') body = bytes.toString('utf8');
  else if (kind.kind === 'page') body = pageWithItsFiles(bytes.toString('utf8'), file, fs);
  else body = bytes.toString('base64');
  if (body.length > MAX_BODY_CHARS) return { error: 'This file is too big to share as a link.' };
  return { ...kind, body, hash: crypto.createHash('sha256').update(body).digest('hex').slice(0, 40) };
}

/**
 * The file on screen as its link carries it. The link only ever carries what
 * was on screen when Share was pressed: a version nobody opened must not go
 * out on its own.
 */
export function linkCopyOf(file: string, { fs = fsDefault }: { fs?: LinkFs } = {}): LinkCopy | { error: string } {
  const made = fileForLink(file, { fs });
  if (made.error) return made;
  return { ...(made as LinkFile), name: path.basename(file), version: versionInName(file) };
}

/** The version a file's name says (plan-v3.md is 3), as files here are named. */
export const versionInName = (name: unknown): number => Number(/-v(\d{1,4})\.[^./]+$/i.exec(String(name ?? ''))?.[1] ?? 1) || 1;
