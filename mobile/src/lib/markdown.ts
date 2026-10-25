// A MESSAGE AS BLOCKS AND SPANS A PHONE CAN DRAW, read the way the website
// reads it: micromark's GFM parser (what remark-gfm runs), the website's own
// rule for a path in a sentence (artifact-paths.ts), and its own rules for
// what a link, a picture or a code span becomes (Focus.tsx `mdComponents`,
// mentions.ts). Only the drawing is the app's (ui/Markdown.tsx).
import type { Nodes, Parents, PhrasingContent, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { CODE_PATH, isMediaPath, linkArtifactPaths, productPath } from '../../../renderer/src/artifact-paths';
import { mentionKind, mentionLabel, mentionName, type MentionKind } from '../../../renderer/src/mentions';
import { sourceReference } from '../../../renderer/src/source-reference.mjs';

export type { MentionKind };

export interface Span {
  text: string;
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  /** A file, a folder or an address, drawn as the website's mention: its kind's icon, then its name. */
  mention?: { kind: MentionKind; src: string };
}

export type Align = 'left' | 'right' | 'center' | null;

export type Block =
  | { kind: 'p'; spans: Span[] }
  | { kind: 'h'; depth: number; spans: Span[] }
  | { kind: 'code'; text: string; lang?: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'list'; ordered: boolean; start: number; tight: boolean; items: { checked: boolean | null; blocks: Block[] }[] }
  | { kind: 'table'; align: Align[]; head: Span[][]; rows: Span[][][] }
  | { kind: 'hr' }
  | { kind: 'picture'; src: string; alt: string }
  /** A folder, drawn with its newest pictures (Focus.tsx `FolderPreview`). */
  | { kind: 'folder'; src: string }
  /** A film or a sound the phone can play, drawn with its player (Focus.tsx `ArtifactMedia`). */
  | { kind: 'media'; src: string; label: string };

export interface Place {
  dir?: string | null;
  /** Whether the phone has this film or sound; one it does not stays a name in its sentence. */
  playable?: (src: string) => boolean;
}

const PICTURE_LINK = /\.(png|jpe?g|gif|webp|svg)(?:[?#]|$)/i;
const PICTURE_CODE = /\.(png|jpe?g|gif|webp)$/i;
const ADDRESS = /^(https?|data):/i;

function parse(text: string, place: Place) {
  const tree = fromMarkdown(String(text ?? ''), { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  linkArtifactPaths(tree as any, { dir: place.dir ?? null });
  return tree;
}

const plainText = (node: Nodes): string => {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if (node.type === 'image') return node.alt ?? '';
  if (node.type === 'break') return '\n';
  return 'children' in node ? (node.children as Nodes[]).map(plainText).join('') : '';
};

type Marks = Omit<Span, 'text' | 'mention'>;
// What one run of words holds: spans, and what stands on its own between them.
type Alone = Extract<Block, { kind: 'picture' | 'folder' | 'media' }>;
type Piece = Span | { alone: Alone };

// A link, a picture or a code span, as the website's `a`, `img` and `code` decide.
function phrasing(node: PhrasingContent, marks: Marks, place: Place, out: Piece[]) {
  const span = (text: string, extra: Partial<Span> = {}) => out.push({ text, ...marks, ...extra });
  switch (node.type) {
    case 'text': span(node.value.replace(/\n/g, ' ')); return;
    case 'html': span(node.value); return;
    case 'break': span('\n'); return;
    case 'strong': for (const c of node.children) phrasing(c, { ...marks, bold: true }, place, out); return;
    case 'emphasis': for (const c of node.children) phrasing(c, { ...marks, italic: true }, place, out); return;
    case 'delete': for (const c of node.children) phrasing(c, { ...marks, strike: true }, place, out); return;
    case 'footnoteReference': span(`[${node.label ?? node.identifier}]`); return;
    case 'image': out.push({ alone: { kind: 'picture', src: node.url, alt: node.alt ?? '' } }); return;
    case 'inlineCode': {
      const value = node.value;
      const source = sourceReference(value);
      if (source) { span(mentionName(value), { mention: { kind: 'code', src: source } }); return; }
      const shown = value.trim();
      const path = (place.dir && productPath(shown, place.dir)) || shown;
      if (CODE_PATH.test(path)) {
        if (PICTURE_CODE.test(path)) { out.push({ alone: { kind: 'picture', src: path, alt: shown } }); return; }
        if (isMediaPath(path) && place.playable?.(path)) { out.push({ alone: { kind: 'media', src: path, label: mentionName(path) } }); return; }
        span(mentionName(path), { mention: { kind: isMediaPath(path) ? 'media' : mentionKind(path), src: path } });
        return;
      }
      span(value, { code: true });
      return;
    }
    case 'link': {
      const href = node.url;
      const words = node.children.map(plainText).join('');
      if (href && !ADDRESS.test(href) && !/^(file|mailto):/i.test(href) && PICTURE_LINK.test(href)) {
        out.push({ alone: { kind: 'picture', src: href, alt: words || href } });
        return;
      }
      const local = !/^(https?|data|file|mailto):/i.test(href);
      if (href && local && /\/$/.test(href)) { out.push({ alone: { kind: 'folder', src: href } }); return; }
      if (href && local && isMediaPath(href) && place.playable?.(href)) { out.push({ alone: { kind: 'media', src: href, label: mentionLabel(href, words) ?? words } }); return; }
      span(mentionLabel(href, words) ?? words, { mention: { kind: mentionKind(href), src: href } });
      return;
    }
    default:
      if ('children' in node) for (const c of (node as Parents).children as PhrasingContent[]) phrasing(c, marks, place, out);
  }
}

const same = (a: Span, b: Span) => a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.code === b.code && !a.mention && !b.mention;
// Neighbouring words of one look are one span, and a block's words start and
// end where its first and last letters do, the way the page lays them out.
function tidy(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    const last = out.at(-1);
    if (last && same(last, s)) last.text += s.text;
    else out.push({ ...s });
  }
  if (out[0] && !out[0].code && !out[0].mention) out[0].text = out[0].text.replace(/^\s+/, '');
  const end = out.at(-1);
  if (end && !end.code && !end.mention) end.text = end.text.replace(/\s+$/, '');
  return out.filter((s) => s.text !== '');
}

// A paragraph, split where a picture, a folder or a player stands on its own.
function runs(children: PhrasingContent[], place: Place, wrap: (spans: Span[]) => Block): Block[] {
  const pieces: Piece[] = [];
  for (const c of children) phrasing(c, {}, place, pieces);
  const out: Block[] = [];
  let words: Span[] = [];
  const flush = () => { const spans = tidy(words); if (spans.length) out.push(wrap(spans)); words = []; };
  for (const p of pieces) {
    if ('alone' in p) { flush(); out.push(p.alone); } else words.push(p);
  }
  flush();
  return out;
}

// Words that cannot hold a picture of their own (a heading, a table cell, an
// option) carry it as a mention of it.
function spansIn(children: PhrasingContent[], place: Place): Span[] {
  const pieces: Piece[] = [];
  for (const c of children) phrasing(c, {}, place, pieces);
  return tidy(pieces.map((p) => ('alone' in p ? asMention(p.alone) : p)));
}

function asMention(b: Alone): Span {
  if (b.kind === 'picture') return { text: mentionName(b.src), mention: { kind: 'image', src: b.src } };
  if (b.kind === 'folder') return { text: mentionLabel(b.src, b.src) ?? b.src, mention: { kind: 'folder', src: b.src } };
  return { text: b.label, mention: { kind: 'media', src: b.src } };
}

function blocks(nodes: RootContent[], place: Place): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph': out.push(...runs(node.children, place, (spans) => ({ kind: 'p', spans }))); break;
      case 'heading': out.push({ kind: 'h', depth: node.depth, spans: spansIn(node.children, place) }); break;
      case 'code': out.push({ kind: 'code', text: node.value, ...(node.lang ? { lang: node.lang } : {}) }); break;
      case 'blockquote': out.push({ kind: 'quote', blocks: blocks(node.children, place) }); break;
      case 'list': out.push({
        kind: 'list', ordered: !!node.ordered, start: node.start ?? 1, tight: !node.spread && !node.children.some((i) => i.spread),
        items: node.children.map((i) => ({ checked: typeof i.checked === 'boolean' ? i.checked : null, blocks: blocks(i.children, place) })),
      }); break;
      case 'table': {
        const [head, ...rows] = node.children;
        const cells = (row: typeof head) => row.children.map((cell) => spansIn(cell.children, place));
        out.push({ kind: 'table', align: (node.align ?? []).map((a) => a ?? null), head: head ? cells(head) : [], rows: rows.map(cells) });
        break;
      }
      case 'thematicBreak': out.push({ kind: 'hr' }); break;
      case 'html': if (node.value.trim()) out.push({ kind: 'p', spans: [{ text: node.value }] }); break;
      case 'footnoteDefinition': {
        const inner = blocks(node.children, place);
        const first = inner[0];
        if (first?.kind === 'p') first.spans.unshift({ text: `${node.label ?? node.identifier}. ` });
        out.push(...inner);
        break;
      }
      default: break;
    }
  }
  return out;
}

/** A message, as the blocks the thread draws. `dir` is the project's folder on the phone (phoneView `products[].dir`). */
export function messageBlocks(text: string, place: Place = {}): Block[] {
  return blocks(parse(text, place).children, place);
}

/** One line of words, an option's, with its inline markdown read and its blocks run together. */
export function inlineSpans(text: string, place: Place = {}): Span[] {
  const all: PhrasingContent[] = [];
  const gather = (nodes: RootContent[]) => {
    for (const n of nodes) {
      if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'tableCell') {
        if (all.length) all.push({ type: 'text', value: ' ' });
        all.push(...n.children);
      } else if ('children' in n) gather(n.children as RootContent[]);
      else if (n.type === 'code' || n.type === 'html') all.push({ type: 'text', value: n.value });
    }
  };
  gather(parse(text, place).children);
  return spansIn(all, place);
}
