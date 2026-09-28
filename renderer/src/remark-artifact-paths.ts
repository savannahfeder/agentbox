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
// she can read.

const EXT = 'html?|pdf|png|jpe?g|gif|webp|svg|csv';
const PATH = new RegExp(String.raw`(?<![\w./:@-])(?:\.\/)?[\w-][\w./-]*\.(?:${EXT})\b`, 'gi');

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

function pieces(text: string): Node[] {
  const out: Node[] = [];
  let at = 0;
  PATH.lastIndex = 0;
  for (const m of text.matchAll(PATH)) {
    const start = m.index ?? 0;
    if (start > at) out.push({ type: 'text', value: text.slice(at, start) });
    out.push(PICTURE.test(m[0])
      // `alt` is the path, so a picture whose file is missing still says which
      // one it was and a copy of the message carries the name.
      ? { type: 'image', url: m[0], alt: m[0] }
      : { type: 'link', url: m[0], children: [{ type: 'text', value: m[0] }] });
    at = start + m[0].length;
  }
  if (!out.length) return [];
  if (at < text.length) out.push({ type: 'text', value: text.slice(at) });
  return out;
}

/** Rewrite one tree in place. Exported so a test can hold a plain tree to it. */
export function linkArtifactPaths(node: Node): void {
  if (!node || !Array.isArray(node.children)) return;
  const out: Node[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const split = pieces(child.value);
      if (split.length) { out.push(...split); continue; }
      out.push(child);
      continue;
    }
    if (!SKIP.has(child.type)) linkArtifactPaths(child);
    out.push(child);
  }
  node.children = out;
}

export function remarkArtifactPaths() {
  return (tree: Node) => { linkArtifactPaths(tree); };
}
