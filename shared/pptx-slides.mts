// PURE, BAR THE INFLATE IT IS HANDED. A PowerPoint file's slides, read as what is
// on each: where each box of words and each picture sits. No fonts, no theme and
// no animation: enough to review a deck and comment on a slide, not to replace
// PowerPoint, and "Open outside" is one press away.

export interface SlideSize { w: number; h: number }
export type SlideBox = { x: number; y: number; w: number; h: number } | null;
export type SlidePart =
  | { kind: 'picture'; file: string; box: SlideBox }
  | { kind: 'words'; title: boolean; box: SlideBox; paragraphs: { text: string; pt: number | null }[] };
export interface Deck { size: SlideSize; slides: SlidePart[][]; picture: (file: string) => Promise<Uint8Array | null> }
export type Inflate = (bytes: Uint8Array) => Promise<Uint8Array>;

const EMU_DEFAULT: SlideSize = { w: 9144000, h: 6858000 };

/** The files in a zip, by name, each with a way to read its bytes. */
export function zipEntries(bytes: Uint8Array, inflate: Inflate): Map<string, () => Promise<Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('not a zip file');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, () => Promise<Uint8Array>>();
  const decode = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('a damaged zip file');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decode.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    out.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size);
      return method === 0 ? raw : inflate(raw);
    });
    at += 46 + nameLength + extra + comment;
  }
  return out;
}

const attr = (tag: string, name: string): string | null => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const unescape = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** One shape's box in parts of the slide, or null when it has none of its own. */
function boxOf(xml: string, size: SlideSize): SlideBox {
  const off = /<a:off\b[^>]*>/.exec(xml)?.[0];
  const ext = /<a:ext\b[^>]*cx=[^>]*>/.exec(xml)?.[0];
  if (!off || !ext) return null;
  return {
    x: Number(attr(off, 'x')) / size.w, y: Number(attr(off, 'y')) / size.h,
    w: Number(attr(ext, 'cx')) / size.w, h: Number(attr(ext, 'cy')) / size.h,
  };
}

/** What one slide's XML says is on it. `rels` maps a picture's r:id to its file in the zip. */
export function readSlide(xml: string, rels: Map<string | null, string>, size: SlideSize = EMU_DEFAULT): SlidePart[] {
  const parts: SlidePart[] = [];
  for (const m of String(xml).matchAll(/<p:(sp|pic)\b[\s\S]*?<\/p:\1>/g)) {
    const shape = m[0];
    if (m[1] === 'pic') {
      const id = /r:embed="([^"]+)"/.exec(shape)?.[1];
      const file = id ? rels.get(id) : null;
      const box = boxOf(shape, size);
      if (file) parts.push({ kind: 'picture', file, box });
      continue;
    }
    const paragraphs = [...shape.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)].map((p) => {
      const runs = [...p[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((r) => unescape(r[1])).join('');
      const size100 = /<a:rPr\b[^>]*\bsz="(\d+)"/.exec(p[1])?.[1];
      return { text: runs, pt: size100 ? Number(size100) / 100 : null };
    }).filter((p) => p.text.trim());
    if (!paragraphs.length) continue;
    const title = /<p:ph\b[^>]*type="(?:title|ctrTitle)"/.test(shape);
    parts.push({ kind: 'words', paragraphs, title, box: boxOf(shape, size) });
  }
  return parts;
}

const inOrder = (a: string, b: string): number => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]);

/** Every slide of a deck, in order, with its size. `inflate(bytes)` undoes zip's compression. */
export async function readDeck(bytes: Uint8Array, inflate: Inflate): Promise<Deck> {
  const entries = zipEntries(bytes, inflate);
  const text = async (name: string): Promise<string> => {
    const read = entries.get(name);
    return read ? new TextDecoder().decode(await read()) : '';
  };
  const sizeTag = /<p:sldSz\b[^>]*>/.exec(await text('ppt/presentation.xml'))?.[0];
  const size = sizeTag ? { w: Number(attr(sizeTag, 'cx')), h: Number(attr(sizeTag, 'cy')) } : EMU_DEFAULT;
  const names = [...entries.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(inOrder);
  const slides: SlidePart[][] = [];
  for (const name of names) {
    const relsXml = await text(name.replace('slides/', 'slides/_rels/').concat('.rels'));
    const rels = new Map([...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((m): [string | null, string] => {
      const target = attr(m[0], 'Target') ?? '';
      return [attr(m[0], 'Id'), target.startsWith('/') ? target.slice(1) : `ppt/${target.replace(/^\.\.\//, '')}`];
    }));
    slides.push(readSlide(await text(name), rels, size));
  }
  return { size, slides, picture: (file: string) => entries.get(file)?.() ?? Promise.resolve(null) };
}
