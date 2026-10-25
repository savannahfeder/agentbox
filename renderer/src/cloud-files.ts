// PICTURES, FILMS, SOUNDS AND PAGES ON THE PHONE WITH THE MAC SHUT.
//
// Her Mac lists, in each thread's copy, the files the thread names and their
// names in her private bucket (main/phone-uploads.mjs), keyed by where each is
// on the Mac: relative to the project's documents folder, or `@repo/` and
// relative to its code. The screens find a file the way they do on the Mac,
// from a folder and a path, so each project here gets a stand-in folder of its
// own (`standIn`), the same shape as the Mac's, and every address the screens
// make under it is turned back into a key and from there into a link signed
// for an hour. A path written in full from her home (`~/…`) lands inside the
// stand-in too, since the stand-in is the Mac's folder under a home of its own.
import { DOC_SCHEMES, IMG_SCHEMES } from '../../shared/schemes.mjs';

export interface FileEntry { n?: string; s: number; big?: boolean; w?: number; h?: number }
export interface Place { device: string; dir: string; repo: string; files: Map<string, FileEntry>; folders: Map<string, string[]> }
export const BUCKET = 'phone-files';

/** The home each computer's folders stand under on the phone, one per computer. */
export const homeOf = (device: string) => `/home/phone-${device}`;
/** The Mac's folder, written from its home (`~/…`), as a folder on the phone. */
export function standIn(device: string, written: unknown): string {
  const w = typeof written === 'string' ? written.replace(/\/+$/, '') : '';
  if (!w) return '';
  return w === '~' ? homeOf(device) : w.startsWith('~/') ? `${homeOf(device)}${w.slice(1)}` : `${homeOf(device)}/_${w}`;
}

/**
 * Each project's place, from its threads' copies: the newest copy's word on a
 * key wins, since a page can change under the same name.
 */
export function cloudPlaces(threads: { device: string; project: string; snapshot: any }[], slugOf: (device: string, project: string) => string): Map<string, Place> {
  const places = new Map<string, Place>();
  const newestFirst = [...threads].sort((a, b) => (Number(b.snapshot?.item?.updatedAt) || 0) - (Number(a.snapshot?.item?.updatedAt) || 0));
  for (const t of newestFirst) {
    const a = t.snapshot?.attached;
    if (!a || typeof a !== 'object') continue;
    const slug = slugOf(t.device, t.project);
    let place = places.get(slug);
    if (!place) {
      place = { device: t.device, dir: standIn(t.device, a.dir), repo: standIn(t.device, a.repo), files: new Map(), folders: new Map() };
      places.set(slug, place);
    }
    for (const [key, entry] of Object.entries(a.files ?? {})) {
      const e = entry as FileEntry;
      if (!place.files.has(key) && e && typeof e.s === 'number' && (e.big || (typeof e.n === 'string' && /^[0-9a-f]{64}\.[a-z0-9]{1,8}$/.test(e.n)))) place.files.set(key, e);
    }
    for (const [key, keys] of Object.entries(a.folders ?? {})) if (!place.folders.has(key) && Array.isArray(keys)) place.folders.set(key, keys.filter((k) => typeof k === 'string'));
  }
  return places;
}

const inside = (root: string, file: string) => !!root && file.startsWith(`${root}/`);
const clean = (p: string) => {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
};

/** The key a full path on the phone stands for, in the project it is under. */
export function keyAt(places: Map<string, Place>, file: string): { product: string; key: string; place: Place } | null {
  for (const [product, place] of places) {
    if (inside(place.dir, file)) return { product, key: clean(file.slice(place.dir.length + 1)), place };
    if (inside(place.repo, file)) return { product, key: `@repo/${clean(file.slice(place.repo.length + 1))}`, place };
  }
  return null;
}

/** The full path on the phone of a key. */
export const fileOf = (place: Place, key: string) => (key.startsWith('@repo/') ? `${place.repo}/${key.slice(6)}` : `${place.dir}/${key}`);

/** A folder a message names, among those her Mac listed: its full path here and its pictures' keys. */
export function findFolder(place: Place, src: string): { folder: string; keys: string[] } | null {
  let raw = String(src ?? '').replace(/^file:\/\//, '').replace(/\/+$/, '');
  try { raw = decodeURIComponent(raw); } catch { /* as written */ }
  const full = raw.startsWith('~/') ? `${homeOf(place.device)}${raw.slice(1)}` : raw;
  const key = full.startsWith(`${place.dir}/`) ? full.slice(place.dir.length + 1) : full.startsWith(`${place.repo}/`) && place.repo ? `@repo/${full.slice(place.repo.length + 1)}` : full.replace(/^\.\//, '');
  const keys = place.folders.get(`${key}/`);
  return keys ? { folder: key.startsWith('@repo/') ? `${place.repo}/${key.slice(6)}` : `${place.dir}/${key}`, keys } : null;
}

/**
 * What a path a message gives stands for, looked for where the Mac looks
 * (main/artifact-path.mjs resolveArtifact): in full, then under the project's
 * folders, then by its name alone, the newest first.
 */
export function findFile(places: Map<string, Place>, product: string, src: string): { key: string; entry: FileEntry; file: string; place: Place } | null {
  const place = places.get(product);
  if (!place || typeof src !== 'string' || !src) return null;
  let raw = src.replace(/^file:\/\//, '');
  try { raw = decodeURIComponent(raw); } catch { /* as written */ }
  raw = raw.replace(/^\.\//, '').replace(/\/+$/, '');
  const hit = (key: string) => {
    const entry = place.files.get(key);
    return entry ? { key, entry, file: fileOf(place, key), place } : null;
  };
  if (raw.startsWith('/') || raw.startsWith('~/')) {
    const full = raw.startsWith('~/') ? `${homeOf(place.device)}${raw.slice(1)}` : raw;
    const at = keyAt(new Map([[product, place]]), full);
    return at ? hit(at.key) : null;
  }
  const rel = clean(raw);
  for (const key of [rel, `designs/${rel}`, `attachments/${rel}`, `@repo/${rel}`, `@repo/designs/${rel}`]) {
    const found = hit(key);
    if (found) return found;
  }
  const byName = [...place.files.keys()].find((k) => k === rel || k.endsWith(`/${rel}`));
  return byName ? hit(byName) : null;
}

/** The full path an address the screens made asks for, or null for an address of another kind. */
export function pathOfUrl(url: string): { file: string; kind: 'doc' | 'img' } | null {
  for (const [schemes, kind] of [[DOC_SCHEMES, 'doc'], [IMG_SCHEMES, 'img']] as const) {
    for (const scheme of schemes) {
      const prefix = `${scheme}://file/`;
      if (!url.startsWith(prefix)) continue;
      const rest = url.slice(prefix.length).split(/[?#]/)[0];
      try { return { file: `/${rest.split('/').map(decodeURIComponent).join('/')}`, kind }; } catch { return null; }
    }
  }
  return null;
}

// WHAT A PAGE DRAWS FROM BESIDE IT, the same reading as the Mac's
// (main/phone-uploads.mjs partsOf), so each is pointed at its own link.
const REFS = /(\b(?:src|href|poster|data-src)\s*=\s*["'])([^"'#?]+)([^"']*["'])|(\bsrcset\s*=\s*["'])([^"']+)(["'])|(url\(\s*["']?)([^"')#?]+)([^"')]*["']?\s*\))/gi;
const OUTSIDE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

/**
 * A page made ready to draw on the phone: every file beside it pointed at its
 * link, and no script, since nothing on this site may run a page's own code.
 * `linkOf(key)` is the link for a key, or null for one not here.
 */
export function pageForPhone(html: string, pageKey: string, linkOf: (key: string) => string | null): string {
  const folder = pageKey.includes('/') ? pageKey.slice(0, pageKey.lastIndexOf('/')) : '';
  const point = (ref: string) => {
    if (!ref || OUTSIDE.test(ref.trim())) return null;
    let r = ref.trim();
    try { r = decodeURIComponent(r); } catch { /* as written */ }
    return linkOf(clean(folder ? `${folder}/${r}` : r));
  };
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(REFS, (whole, a1, ref1, z1, a2, set, z2, a3, ref3, z3) => {
      // A query belongs to the Mac's file and is dropped; a fragment (a film's #t=33) is kept.
      if (a1) { const to = point(ref1); return to ? `${a1}${to}${z1.replace(/^\?[^#"']*/, '')}` : whole; }
      if (a2) {
        const parts = set.split(',').map((p: string) => {
          const [u, ...rest] = p.trim().split(/\s+/);
          const to = point(u);
          return [to ?? u, ...rest].join(' ');
        });
        return `${a2}${parts.join(', ')}${z2}`;
      }
      const to = point(ref3);
      return to ? `${a3}${to}${z3.replace(/^\?[^#"')]*/, '')}` : whole;
    });
}

const STYLESHEET = /<link\b[^>]*\bhref\s*=\s*["']([^"'#?]+)[^"']*["'][^>]*>/gi;
const keyBeside = (fromKey: string, ref: string) => {
  const folder = fromKey.includes('/') ? fromKey.slice(0, fromKey.lastIndexOf('/')) : '';
  let r = ref.trim();
  try { r = decodeURIComponent(r); } catch { /* as written */ }
  return clean(folder ? `${folder}/${r}` : r);
};

/** The stylesheets of the page's own a page links to, by key. */
export function pageStyles(html: string, pageKey: string): string[] {
  const out: string[] = [];
  for (const m of String(html).matchAll(STYLESHEET)) {
    if (!/\.css$/i.test(m[1]) || OUTSIDE.test(m[1].trim())) continue;
    const key = keyBeside(pageKey, m[1]);
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Each stylesheet a page links to, put in the page itself with its own files
 * pointed at their links: a stylesheet from the cloud is not one the site lets
 * a page load, and its url()s would name files beside a name that is not theirs.
 */
// A stylesheet that is for print, an alternative or switched off is not the page as drawn.
const NOT_DRAWN = (tag: string) => /\balternate\b/i.test(/\brel\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '') || /\sdisabled\b/i.test(tag) || /^\s*print\s*$/i.test(/\bmedia\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '');
export function withStyles(html: string, pageKey: string, styles: Map<string, string>, linkOf: (key: string) => string | null): string {
  return String(html).replace(STYLESHEET, (whole, ref) => {
    if (!/\.css$/i.test(ref) || OUTSIDE.test(ref.trim())) return whole;
    if (NOT_DRAWN(whole)) return '';
    const key = keyBeside(pageKey, ref);
    const css = styles.get(key);
    if (css === undefined) return '';
    const media = /\bmedia\s*=\s*["']([^"'<>]*)["']/i.exec(whole)?.[1];
    const pointed = css.replace(/(url\(\s*["']?)([^"')#?]+)([^"')]*["']?\s*\))/gi, (u, a, r, z) => {
      if (OUTSIDE.test(r.trim())) return u;
      const to = linkOf(keyBeside(key, r));
      return to ? `${a}${to}${z.replace(/^\?[^#"')]*/, '')}` : u;
    });
    return `<style${media && media.trim() !== 'all' ? ` media="${media}"` : ''}>${pointed.replace(/<\/style/gi, '<\\/style')}</style>`;
  });
}

/** Point every address the screens draw at its link, now and from now on. */
export function installCloudFiles(linkFor: (file: string) => string | null, root: Node = document) {
  const ATTRS = ['src', 'poster'];
  const fix = (el: Element) => {
    for (const attr of ATTRS) {
      const was = el.getAttribute(attr);
      const at = was ? pathOfUrl(was) : null;
      if (!at) continue;
      const to = linkFor(at.file);
      if (to && to !== was) el.setAttribute(attr, to);
    }
  };
  const sweep = (node: Node) => {
    if (!(node instanceof Element)) return;
    fix(node);
    for (const el of node.querySelectorAll(ATTRS.map((a) => `[${a}*="://file/"]`).join(','))) fix(el);
  };
  sweep(root instanceof Document ? root.documentElement : root);
  const watch = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'attributes') fix(change.target as Element);
      else for (const node of change.addedNodes) sweep(node);
    }
  });
  watch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS });
  return () => watch.disconnect();
}
