// PURE. A file path typed into a sentence becomes the file: a document becomes
// a link to it, a picture becomes the picture.
//
// She should not have to. A worker that writes
//
//   designs/dev-landing-shots/round19.html
//
// in the middle of a paragraph has already given her the link; the renderer
// simply printed it as dead text, because only a path inside backticks or
// inside markdown link brackets was ever turned into one. Which of the three a
// worker reaches for is a coin flip, and she pays for the flip.
//
// This runs as a remark plugin so the link is a real markdown link node by the
// time React sees it, and Focus's own `a` component resolves and opens it the
// way it resolves every other artifact link. Nothing new has to know about
// roots or the main process.
//
// The extension list is narrower than the attachment row's on purpose. The row
// is a manifest and may as well carry `supervisor.mjs`; a link is a promise
// that clicking gets her somewhere, so it covers only what opens into something
// she can read, hear or watch.
//
// SOUND, FILM AND MARKDOWN JOINED IT ON 2026-09-29. She sent a result naming
// five voice samples as five grey paths nobody could press. Over the 30 days
// before, 1,844 agent messages: 41 named an audio or video file and 15 a
// markdown document, and all 56 drew as dead text. The pane opens markdown
// itself, and Focus draws a player for a sound or a film (ArtifactMedia).
import { defaultUrlTransform } from 'react-markdown';

// Local file links are handled by the app's click handler, never navigated to
// by the browser. Keep all of markdown's other protocol restrictions.
export function artifactUrlTransform(url: string): string {
  return /^file:\/\//i.test(url) ? url : defaultUrlTransform(url);
}

const MEDIA_EXT = 'mp3|wav|m4a|aac|ogg|mp4|mov|m4v|webm';
const EXT = `html?|pdf|png|jpe?g|gif|webp|svg|csv|md|markdown|${MEDIA_EXT}`;
const PATH = new RegExp(String.raw`(?<![\w./:@~-])(?:\.\/)?[\w-][\w./-]*\.(?:${EXT})\b`, 'gi');
const QUOTED = new RegExp(String.raw`["“]([^"”\r\n]+\.(?:${EXT}))["”]|['‘]([^'’\r\n]+\.(?:${EXT}))['’]`, 'gi');

const MEDIA = new RegExp(String.raw`\.(?:${MEDIA_EXT})$`, 'i');

/** Is this a sound or a film of the product's, the kind the pane plays in place. */
export function isMediaPath(path: string | undefined | null): boolean {
  const clean = String(path ?? '');
  if (/^[a-z]+:/i.test(clean)) return false;
  return MEDIA.test(clean.split(/[?#]/)[0]);
}

// THE SAME FILES, WRITTEN OUT IN FULL FROM THE ROOT OR FROM THE HOME FOLDER.
// 88 of the dead references in that count were this: a worker pasting
// /Users/…/astral/designs/w-3a/latest.html, 61 of them pages. They are linked
// only when they land inside the product's own folder, which the pane passes as
// `dir`, and then as the short path every other door in the app resolves.
// Anywhere else, /tmp or the app's own source, is our machinery and stays text.
const FULL = new RegExp(String.raw`(?<![\w./:@~-])(?:~|/)/?[\w./-]*\.(?:${EXT})\b`, 'gi');

// A LOCAL ADDRESS WITH NO http:// IN FRONT. remark-gfm links a url only when
// it carries its scheme, and 18 of those messages wrote `localhost:3000`
// bare, which is how people say it out loud. Linked as http, which the pane
// opens beside the card (isLocalPreview).
const LOCAL = /(?<![\w./:@-])(?:localhost|127\.0\.0\.1):\d{2,5}(?:\/[^\s<>()[\]`'"]*)?/gi;

// A FOLDER ON A LINE OF ITS OWN IS A DOOR TOO (2026-10-04). The brief asks a
// worker to put what it made on its own line, and a worker that drew several
// pictures puts their folder there. It drew as grey text with nothing to press.
// Only on its own line, and only inside the product's folder: a folder in the
// middle of a sentence is usually a remark about where something went, and a
// folder anywhere else is our machinery. The link's url keeps its slash, which
// is how Focus knows to draw the folder's pictures rather than open a file.
const FOLDER_LINE = /(^|\n)([ \t]*)((?:~\/|\/)[\w./-]*[\w-])(\/?)[ \t]*(?=\n|$)/g;
const FILE_LIKE = /\.[a-z0-9]{1,8}$/i;

// A PICTURE NAMED IN A SENTENCE IS DRAWN, NOT LINKED.
//
// Counted over her Agentbox store that day, every way an AGENT has named a
// picture in a result, a checkpoint or a body it wrote:
//
//   bare path in prose    27    drew blue text
//   markdown image        25    drew the picture
//   path in a code span    4    drew the picture
//   markdown link          2    drew blue text
//
// So the commonest way a worker names a picture was the one way that showed her
// nothing, and 29 of those 58 mentions drew as a link. Her OWN 108 mentions are
// pasted screenshots, which arrive as markdown images and always drew fine,
// which is why this looked like it worked.
//
// The fix is the node the worker would have got by typing an exclamation mark.
// Focus's `img` component (ArtifactImg) draws it AND makes it a door, so
// clicking it still opens the file the way clicking the link used to.
const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;

// Where a path is already doing a job of its own. A url that remark-gfm has
// autolinked is a `link` whose text still looks like a path, and linkifying
// inside it would nest one link in another.
const SKIP = new Set([
  'link', 'linkReference', 'image', 'imageReference', 'definition',
  'inlineCode', 'code', 'html',
]);

type Node = { type: string; value?: string; url?: string; alt?: string; children?: Node[] };

export type Options = { dir?: string | null };

// The short path a full one names, or null when it is not inside `dir`.
// Focus's code span asks the same question of a path in backticks.
export function productPath(full: string, dir: string): string | null {
  const root = dir.replace(/\/+$/, '');
  if (!root) return null;
  let abs = full;
  if (abs.startsWith('~/')) {
    const home = root.match(/^\/(?:Users|home)\/[^/]+/)?.[0];
    if (!home) return null;
    abs = home + abs.slice(1);
  }
  return abs.startsWith(root + '/') ? abs.slice(root.length + 1) : null;
}

type Hit = { at: number; text: string; url: string };

function pieces(text: string, dir: string): Node[] {
  const hits: Hit[] = [];
  const quoted: { start: number; end: number }[] = [];
  for (const m of text.matchAll(QUOTED)) {
    const name = m[1] ?? m[2];
    const at = m.index! + 1;
    // Even an outside path must be consumed whole, or its last word becomes
    // a misleading relative link. Quotes themselves remain ordinary text.
    quoted.push({ start: at, end: at + name.length });
    if (!/^(?:~\/|\/|\.?\/?[\w-])[\w ./()-]*$/u.test(name)) continue;
    const full = /^(?:~\/|\/)/.test(name);
    let url = full ? productPath(name, dir) : name;
    // "Downloads as <quoted filename>" explicitly names its folder. Do not
    // add Downloads to the general filename search or infer it across sentences.
    const home = dir.match(/^\/(?:Users|home)\/[^/]+/)?.[0];
    if (!full && !name.includes('/') && home && /\bDownloads(?: folder)?\s+as\s*$/i.test(text.slice(0, m.index))) {
      url = `file://${home}/Downloads/${encodeURIComponent(name)}`;
    }
    if (url) hits.push({ at, text: name, url });
  }
  const inQuote = (at: number) => quoted.some(q => at >= q.start && at < q.end);
  for (const m of text.matchAll(PATH)) {
    if (!inQuote(m.index!)) hits.push({ at: m.index!, text: m[0], url: m[0] });
  }
  if (dir) {
    for (const m of text.matchAll(FULL)) {
      if (inQuote(m.index!)) continue;
      const rel = productPath(m[0], dir);
      if (rel) hits.push({ at: m.index ?? 0, text: m[0], url: rel });
    }
    for (const m of text.matchAll(FOLDER_LINE)) {
      const [, lead, pad, folder, slash] = m;
      if (FILE_LIKE.test(folder)) continue;
      const rel = productPath(folder, dir);
      if (!rel) continue;
      hits.push({ at: m.index! + lead.length + pad.length, text: folder + slash, url: `${rel}/` });
    }
  }
  for (const m of text.matchAll(LOCAL)) {
    // The full stop or comma that ends the sentence is not part of the address.
    const address = m[0].replace(/[.,;:!?]+$/, '');
    hits.push({ at: m.index ?? 0, text: address, url: `http://${address}` });
  }
  hits.sort((a, b) => a.at - b.at);

  const out: Node[] = [];
  let at = 0;
  for (const hit of hits) {
    if (hit.at < at) continue;
    if (hit.at > at) out.push({ type: 'text', value: text.slice(at, hit.at) });
    out.push(PICTURE.test(hit.url)
      // `alt` is the path, so a picture whose file is missing still says which
      // one it was and a copy of the message carries the name.
      ? { type: 'image', url: hit.url, alt: hit.text }
      : { type: 'link', url: hit.url, children: [{ type: 'text', value: hit.text }] });
    at = hit.at + hit.text.length;
  }
  if (!out.length) return [];
  if (at < text.length) out.push({ type: 'text', value: text.slice(at) });
  return out;
}

/** Rewrite one tree in place. Exported so a test can hold a plain tree to it. */
export function linkArtifactPaths(node: Node, options: Options = {}): void {
  if (!node || !Array.isArray(node.children)) return;
  const dir = String(options?.dir ?? '');
  const out: Node[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const split = pieces(child.value, dir);
      if (split.length) { out.push(...split); continue; }
      out.push(child);
      continue;
    }
    if (!SKIP.has(child.type)) linkArtifactPaths(child, options);
    out.push(child);
  }
  node.children = out;
}

export function remarkArtifactPaths(options: Options = {}) {
  return (tree: Node) => { linkArtifactPaths(tree, options); };
}
