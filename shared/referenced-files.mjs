// PURE. Every file a message refers to, in the order it refers to them.
//
// The last clause is the design. Nothing here asks a worker to remember to
// attach anything: the message text IS the manifest, so a path a worker merely
// mentioned in passing lands at the foot of the message like any other
// attachment. Three ways a worker names a file, all of them already in use:
//
//   [the report](reports/week-32.md)   a markdown link or image
//   `designs/round-3.html`             a path in a code span
//   designs/round-3.html               a bare path in prose
//
// Absolute paths, urls and anchors are not files of this product's, so they are
// left alone. The extension list is what decides: a bare word with a dot in it
// is not a reference, and guessing wider would put "e.g" and "v1.2" in her
// attachment row.
//
// IT LIVES IN shared/ BECAUSE THE BRIEF NEEDS IT TOO. This was the renderer's
// own module, which meant the only reader of a message's manifest was the
// screen. The spawn path had none, so a task carrying her screenshot was handed
// to a worker as a relative link with nothing anywhere telling it to open one:
// 155 of the 320 sessions on Agentbox that were handed one never did. Same rule,
// one copy, both processes; renderer/src/referenced-files.ts re-exports it.
// `change` is the newest one and it is the whole answer to a tester's call. A run
// that touched the repository writes what it changed as a file, the file lands
// in the row at the foot of the card like every drawing already does, and
// clicking it opens the change in the pane.
const EXT = 'png|jpe?g|gif|webp|svg|html?|pdf|md|markdown|csv|txt|json|ya?ml|sql|sh|css|jsx?|tsx?|mjs|cjs|py|rb|go|rs|toml|change';

// A path, as it appears in prose or inside a link's parentheses. Deliberately
// no leading slash and no scheme: this is a path relative to the product, which
// is the only thing the app can resolve and open.
// The lookbehind is what keeps a url or an absolute path from being read as a
// relative one: without it "https://example.com/a.png" contributes
// "example.com/a.png" and "/etc/hosts.md" contributes "etc/hosts.md", and both
// would sit in her attachment row pointing at nothing.
const PATH = new RegExp(String.raw`(?<![\w./:@-])(?:\.\/)?[\w-][\w./-]*\.(?:${EXT})\b`, 'gi');
const LINK = new RegExp(String.raw`!?\[[^\]\n]*\]\(\s*([^)\s]+?)\s*(?:\s+"[^"]*")?\)`, 'g');

// THE WHOLE PATH, from the root, as a worker that pasted one writes it. Kept
// separate from PATH above because it is read by a different rule: a relative
// path is a reference on sight, an absolute one only when `dir` says it lands
// inside this product's own folder (see `take`).
//
// She was reading a card whose one document was written out in full,
// /Users/…/astral/designs//the-first-row.html. Everything the pane can do with
// a document hangs off this function: the chips at the foot of the message, the
// page drawn in a frame under it, the document it opens on its own, and the
// brief a worker is spawned with. All four were silent, because the path never
// got past the leading slash. Counted over her Agentbox store the same day: 14 of
// the 224 cards carrying any text name a file in full like this, and 8 of those
// mentions point at a file in her own project folder that she should have been
// able to open and could not.
//
// The other 10 are /tmp scratch and the app's own source, which is why the
// leading slash is not simply allowed. Inside her folder it is the document she
// was told to look at. Outside it, it is our machinery and stays plain text.
const ABS_PATH = new RegExp(String.raw`(?<![\w.:@/-])/[\w-][\w./-]*\.(?:${EXT})\b`, 'gi');

const ABSOLUTE = /^([a-z]+:|\/|#)/i;

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

/**
 * Every file referenced across some pieces of a message, deduped, in order.
 *
 * Pass `{ dir }` last, the product's own folder, and a path written out in full
 * from the root that lands inside it is read as the relative path it is. Every
 * caller downstream keeps receiving relative paths and nothing else changes.
 * Leave it out and only relative paths count, which is what this did before.
 */
export function referencedFiles(...texts) {
  const last = texts[texts.length - 1];
  const opts = last && typeof last === 'object' ? texts.pop() : null;
  const dir = String(opts?.dir ?? '').replace(/\/+$/, '');

  const found = [];
  const seen = new Set();

  const take = (raw) => {
    if (!raw) return;
    let path = raw.replace(/^\.\//, '').trim();
    // Written out in full. It is one of ours only when it sits inside this
    // product's folder, and then it is kept as the short path everything
    // downstream already understands.
    if (dir && path.startsWith(dir + '/')) path = path.slice(dir.length + 1);
    if (!path || ABSOLUTE.test(path)) return;
    // a link target that is not a file of ours (an id, a query) is not an
    // attachment; the extension is what makes it one
    if (!new RegExp(String.raw`\.(?:${EXT})$`, 'i').test(path)) return;
    const key = path.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(path);
  };

  for (const text of texts) {
    if (!text) continue;
    // links first, so a target that also matches the bare-path scan is recorded
    // once, in the order a reader meets it
    const source = String(text);
    const hits = [];
    for (const m of source.matchAll(LINK)) hits.push({ at: m.index ?? 0, path: m[1] });
    for (const m of source.matchAll(PATH)) hits.push({ at: m.index ?? 0, path: m[0] });
    if (dir) for (const m of source.matchAll(ABS_PATH)) hits.push({ at: m.index ?? 0, path: m[0] });
    hits.sort((a, b) => a.at - b.at);
    for (const hit of hits) take(hit.path);
  }

  return found;
}

/** What a chip says: the file's own name, with its folder as the quiet part. */
export function fileLabel(path) {
  const parts = path.split('/');
  const name = parts.pop() ?? path;
  return { name, where: parts.join('/') };
}

/** Whether a referenced path is a picture, which is what a worker must OPEN. */
export function isImagePath(path) {
  return IMAGE.test(String(path ?? ''));
}
