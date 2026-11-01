// PURE. A sentence that names pictures and films stays whole: each file stays in
// it as its name, and what draws or plays sits in one row under it.
type Node = {
  type: string; value?: string; url?: string; alt?: string | null;
  children?: Node[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
};

export const MEDIA_ROW = 'media-row';
export const NAME_ONLY = 'data-name-only';

const DRAWN = /\.(?:png|jpe?g|gif|webp|svg|mp4|mov|m4v|webm)(?:[?#]|$)/i;
const ELSEWHERE = /^(?:https?|data|mailto):/i;
// A voice note is a message of its own and draws its own player where it is said.
const VOICE = /voice-note|\bvoice-/i;

const isFile = (at: string | undefined) => !!at && !ELSEWHERE.test(at) && DRAWN.test(at) && !VOICE.test(at);
const baseName = (at: string) => at.split(/[?#]/)[0].split('/').pop() ?? at;

/** Where the node points, when it is something that draws or plays. */
function drawnAt(node: Node): string | null {
  if (node.type === 'image' || node.type === 'link') return isFile(node.url) ? node.url! : null;
  if (node.type === 'inlineCode') return isFile(node.value) && !/\s/.test(node.value!) ? node.value! : null;
  return null;
}

const nameOf = (node: Node, at: string): Node => {
  const words = node.type === 'link' ? node.children ?? [] : [{ type: 'text', value: (node.type === 'image' && node.alt) || baseName(at) }];
  return { type: 'link', url: at, children: words, data: { hProperties: { [NAME_ONLY]: '1' } } };
};

const isWords = (node: Node) => !(node.type === 'text' && !/[^\s.,;:!?&+-]/.test(node.value ?? '')) && node.type !== 'break';

function rowFor(media: Node[]): Node {
  return { type: 'paragraph', children: media, data: { hName: 'div', hProperties: { className: MEDIA_ROW } } };
}

export function mediaUnderSentences(tree: Node): void {
  const list = tree.children;
  if (!list) return;
  for (let i = 0; i < list.length; i += 1) {
    const node = list[i];
    if (node.type !== 'paragraph') { mediaUnderSentences(node); continue; }
    const kids = node.children ?? [];
    const media = kids.filter((k) => drawnAt(k));
    if (!media.length) continue;
    const hasWords = kids.some((k) => !drawnAt(k) && isWords(k));
    if (!hasWords) {
      if (media.length > 1) list[i] = rowFor(media);
      continue;
    }
    node.children = kids.map((k) => { const at = drawnAt(k); return at ? nameOf(k, at) : k; });
    list.splice(i + 1, 0, rowFor(media));
    i += 1;
  }
}

/** The same, as a remark plugin. */
export function remarkMediaUnderSentences() {
  return (tree: unknown) => mediaUnderSentences(tree as Node);
}
