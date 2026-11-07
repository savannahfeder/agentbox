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
import { PHONE_SITE } from '../shared/cloud-address.mjs';

export const LINK_MAX_BYTES = 6_000_000;
const MAX_BODY_CHARS = 8_400_000;

const KINDS = {
  '.md': ['markdown', 'text/markdown'], '.markdown': ['markdown', 'text/markdown'],
  '.html': ['page', 'text/html'], '.htm': ['page', 'text/html'],
  '.png': ['image', 'image/png'], '.jpg': ['image', 'image/jpeg'], '.jpeg': ['image', 'image/jpeg'],
  '.gif': ['image', 'image/gif'], '.webp': ['image', 'image/webp'], '.svg': ['image', 'image/svg+xml'],
  '.pdf': ['pdf', 'application/pdf'],
};
const INSIDE_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/** What a link would show this file as, or null when a link cannot draw it. */
export function linkKindOf(name) {
  const k = KINDS[path.extname(String(name ?? '')).toLowerCase()];
  return k ? { kind: k[0], type: k[1] } : null;
}

/** Which file a link belongs to, so sharing it again keeps the same link. */
export const linkSource = (product, thread, family) => [product, thread, family].map((s) => String(s ?? '')).join('/').slice(0, 400);

export const linkAddress = (site, token) => `${String(site).replace(/\/+$/, '')}/f/${token}`;

// Our cloud's web app answers on both addresses; a link people pass around
// reads as ours.
const OUR_SITE = 'https://app.agentbox.ac';
export function linkSiteFor(site) {
  if (typeof site !== 'string') return null;
  // A stand-in cloud's site on this computer has no certificate.
  if (!/^https:\/\/[^\s/]+\/*$/.test(site) && !/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/*$/.test(site)) return null;
  const s = site.replace(/\/+$/, '');
  return s === PHONE_SITE ? OUR_SITE : s;
}

const outside = (ref) => !ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(ref);

function pageWithItsFiles(html, file, fs) {
  const dir = path.dirname(file);
  let room = LINK_MAX_BYTES - Buffer.byteLength(html);
  const cache = new Map();
  const inline = (ref) => {
    const clean = ref.trim().split(/[?#]/)[0];
    if (outside(clean)) return null;
    let rel;
    try { rel = decodeURIComponent(clean); } catch { return null; }
    const target = path.resolve(dir, rel);
    if (target !== dir && !target.startsWith(dir + path.sep)) return null;
    const type = INSIDE_TYPES[path.extname(target).toLowerCase()];
    if (!type) return null;
    if (cache.has(target)) return cache.get(target);
    let out = null;
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
  const swap = (whole, before, q, ref) => { const d = inline(ref); return d ? `${before}${q}${d}${q}` : whole; };
  return html
    .replace(/(\s(?:src|poster)\s*=\s*)(["'])([^"']*)\2/gi, swap)
    .replace(/<link\b[^>]*>/gi, (tag) => tag.replace(/(\shref\s*=\s*)(["'])([^"']*)\2/i, swap))
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, q, ref) => { const d = inline(ref); return d ? `url(${q}${d}${q})` : whole; });
}

/** The file as a link carries it: { kind, type, body } or { error } in words. */
export function fileForLink(file, { fs = fsDefault } = {}) {
  const kind = linkKindOf(file);
  if (!kind) return { error: 'Only documents, pages, pictures and PDFs can be shared as a link.' };
  let bytes;
  try { bytes = fs.readFileSync(file); } catch { return { error: 'This file is not on this computer any more.' }; }
  if (bytes.length > LINK_MAX_BYTES) return { error: `This file is over ${LINK_MAX_BYTES / 1e6} MB, too big to share as a link.` };
  let body;
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
export function linkCopyOf(file, { fs = fsDefault } = {}) {
  const made = fileForLink(file, { fs });
  if (made.error) return made;
  return { ...made, name: path.basename(file), version: versionInName(file) };
}

/** The version a file's name says (plan-v3.md is 3), as files here are named. */
export const versionInName = (name) => Number(/-v(\d{1,4})\.[^./]+$/i.exec(String(name ?? ''))?.[1] ?? 1) || 1;
