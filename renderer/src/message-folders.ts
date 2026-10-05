// PURE. The folders a message names, and where its pictures are looked for.
//
// A worker that draws three versions saves them in designs/<the thread's id>/,
// names each one bare in its sentence (`quiet-1.png`) and puts the folder on a
// line of its own under the message. Every word of that is a fair way to say
// it, and the window drew "missing image: quiet-1.png" three times, because it
// only ever looked for a bare name in five fixed folders and the one the
// message had just named was never among them (her screenshot, 2026-10-04,
// tests/a-picture-named-beside-its-folder-is-drawn.test.mjs).
//
// So the folders the message itself names come first, then the thread's own
// designs folder, then the five it always tried. Only folders inside this
// project's own folder count: anything else is outside what the window may
// draw (main/img-scheme.mjs), so naming it as a place to look would only add a
// request that is refused.
import { referencedFiles } from './referenced-files';
import { productPath } from './remark-artifact-paths';

// A path written out in full, from the root or the home folder.
const FULL = /(?<![\w./:@~-])(?:~\/|\/)[\w./-]+/g;
// A short folder path, ending in its slash: `designs/w-3/`.
const SHORT = /(?<![\w./:@~-])[\w-][\w.-]*(?:\/[\w.-]+)*\/(?=[\s)`'"\]]|$)/g;
const HAS_EXT = /\.[a-z0-9]{1,8}$/i;

const parent = (rel: string) => rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';

/** Every folder inside `dir` the message names, as paths relative to `dir`, in order. */
export function namedFolders(texts: Array<string | null | undefined>, dir: string | null | undefined): string[] {
  if (!dir) return [];
  const out: string[] = [];
  const add = (rel: string | null | undefined) => {
    const clean = String(rel ?? '').replace(/\/+$/, '');
    if (clean && !out.includes(clean)) out.push(clean);
  };
  for (const text of texts) {
    if (!text) continue;
    for (const m of String(text).matchAll(FULL)) {
      const token = m[0].replace(/[.,;:]+$/, '');
      const rel = productPath(token, dir);
      if (!rel) continue;
      const bare = rel.replace(/\/+$/, '');
      add(HAS_EXT.test(bare) && !rel.endsWith('/') ? parent(bare) : bare);
    }
    for (const m of String(text).matchAll(SHORT)) add(m[0]);
  }
  for (const file of referencedFiles(...texts, { dir })) add(parent(file));
  return out;
}

/** Every folder a picture this message names may be in, the likeliest first. */
export function pictureRoots({ dir, repo, id, texts }: {
  dir: string | null | undefined;
  repo: string | null | undefined;
  id?: string | null;
  texts: Array<string | null | undefined>;
}): string[] {
  const roots = [
    ...(dir ? namedFolders(texts, dir).map((f) => `${dir}/${f}`) : []),
    dir && id && `${dir}/designs/${id}`,
    // THE WORKER'S OWN CHECKOUT. Every run works in `.claude/worktrees/<task
    // id>` under the repository (main/task-folders.mjs), so a path it writes is
    // relative to that folder. Her screenshot that evening was seven of them,
    // all "missing image" (tests/a-picture-in-the-workers-own-checkout-is-drawn).
    repo && id && `${repo}/.claude/worktrees/${id}`,
    dir,
    dir && `${dir}/designs`,
    dir && `${dir}/attachments`,
    repo,
    repo && `${repo}/designs`,
  ].filter(Boolean) as string[];
  return [...new Set(roots)];
}
