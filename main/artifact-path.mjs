// A file a worker named on a card, resolved to a real file ON THAT CARD'S OWN
// PRODUCT, and never anywhere else.
//
// She was right twice over. The finder used to try EVERY product's roots in
// turn, own product first, so a path an Agentbox worker wrote against a folder
// Agentbox does not have fell straight through to whichever product did have one.
// On the card she was reading, nine of eleven chips opened another product's
// files. A chip that opens the wrong file is worse than no chip at all, because
// nothing on screen tells her it is wrong.
//
// Her answer, the same day: "Fix the finder so a card never opens another
// product's file, and say so plainly when it cannot find one."
//
// So there are exactly two rules here:
//
//   1. Every GUESS is made inside one product. The roots below, the
//      account-root retry and the by-name hunt all read one product's trees.
//   2. When the guessing runs out, this returns a sentence rather than a
//      silence, and the caller shows it.
//
// An ABSOLUTE path a worker typed is not a guess: it says exactly which file it
// means, so it still opens as written even when it points outside the product.
// That is the difference this file draws. Deciding for her that an explicit
// path is wrong would break every link into the app's own repo, which is not a
// product at all.

import fsDefault from 'node:fs';
import path from 'node:path';
import { machineryDir } from './store/home.mjs';
import { NAME } from '../shared/product-name.mjs';

// The roots a worker might have been standing in when it wrote a relative path:
// the docs dir, its two well-known subfolders, the product's code repo, and the
// app's own home for this product.
//
// THE HOME IS IN THIS LIST BECAUSE `runs/` LEFT HER FOLDER. The change a run
// made is written to `runs/<item>/…` and the pane asks for it by exactly that
// relative path. Once the move carried `runs/` into
// `<home>/projects/<encoded>/`, that path resolved against her folder and found
// nothing there. MEASURED on her real store before this line existed: of the 37
// run records that had moved, the pane resolved 0.
//
// It goes LAST, after her own folder, so nothing of hers is ever shadowed by
// one of ours.
export function artifactRoots(prod) {
  if (!prod) return [];
  return [
    prod.dir,
    prod.dir && path.join(prod.dir, 'designs'),
    prod.dir && path.join(prod.dir, 'attachments'),
    prod.repoPath,
    prod.repoPath && path.join(prod.repoPath, 'designs'),
    prod.dir && machineryDir(prod.dir),
  ].filter(Boolean);
}

// Machinery, not artifacts. Walking these is slow and never finds the file a
// worker meant.
//
// `runs` JOINED THIS LIST FOR A SHARPER REASON THAN SLOWNESS. Every card's
// change record is called the same thing, `the-change-it-made.change`, so a
// hunt by basename through `runs/` will always find SOME card's record and
// return it as if it were this one's. MEASURED on her store: asking for's
// change handed back's. This file's own header says a chip that opens the wrong
// file is worse than no chip at all, and that was it happening. A change record
// now resolves by exact path or not at all.
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'sessions', 'runs', 'pending-writes', 'checkpoints']);

// Hunt the file down by NAME inside one product's trees, newest match wins.
// Workers write links relative to whatever directory they were standing in, so
// a fixed root list will always miss some of them, and every miss cost her a
// 10-minute detour (2026-08-05). Bounded: six levels, own product only.
function huntByName(base, roots, fs) {
  let best = null;
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(full, depth + 1); }
      else if (e.name === base) {
        let m = 0;
        try { m = fs.statSync(full).mtimeMs; } catch {}
        if (!best || m > best.m) best = { full, m };
      }
    }
  };
  for (const root of roots) walk(root, 0);
  return best?.full ?? null;
}

// What she reads when the file is not there. Plain sentences, her vocabulary:
// this ends up in a toast under her cursor, not in a log.
export function notFoundMessage(raw, own, product) {
  const name = own?.name || product || 'this project';
  if (!own) return `${raw} could not be opened. ${product ? `“${product}”` : 'That project'} is not set up in ${NAME}.`;
  return `${raw} is not in ${name}. Nothing was opened.`;
}

// Resolve one worker-written path. Returns { ok: true, path } or
// { ok: false, error } where the error is a sentence for her, not a code.
//
// `products` is the whole list only so the card's own product can be found in
// it. Nothing in here reads another entry.
export function resolveArtifact({ src, product, products = [], accountRoot, storeRoot, fs = fsDefault }) {
  if (typeof src !== 'string' || !src) return { ok: false, error: 'No file was named.' };
  const raw = decodeURIComponent(src.replace(/^file:\/\//, '')).replace(/^\.\//, '');
  const own = products.find((x) => x.slug === product) ?? null;
  const roots = artifactRoots(own);

  const candidates = [];
  if (path.isAbsolute(raw)) {
    // Said in full, so taken at its word.
    candidates.push(raw);
    // Workers also write an absolute path with a segment missing (the account
    // root straight onto reports/, no product slug). The remainder is a guess,
    // so it is retried under THIS product's roots and no other.
    for (const base of [accountRoot, storeRoot].filter(Boolean)) {
      if (raw.startsWith(base + path.sep)) {
        const rest = raw.slice(base.length + 1);
        for (const root of roots) candidates.push(path.join(root, rest));
      }
    }
  } else {
    for (const root of roots) candidates.push(path.join(root, raw));
    // AND THE WORKER'S OWN CHECKOUT, when the path names its task. Every run
    // works in `<repo>/.claude/worktrees/<task id>` (./task-folders.mjs), so
    // `designs/w-1b574413db/a1.png` is relative to that folder, and the hunt
    // below never finds it because it skips every folder starting with a dot.
    // Only a task the path itself names: a bare `shots/a.png` must not reach
    // into some other task's checkout (2026-10-04, w-7fe215448b).
    if (own?.repoPath) {
      for (const segment of raw.split('/')) {
        if (/^w-[0-9a-f]{6,}$/i.test(segment)) candidates.push(path.join(own.repoPath, '.claude', 'worktrees', segment, raw));
      }
    }
  }

  for (const full of candidates) {
    if (fs.existsSync(full)) return { ok: true, path: full };
  }

  // The hunt takes the two TREES, not the root list: designs/ and attachments/
  // sit inside the docs dir already, and walking them twice finds nothing new.
  const base = path.basename(raw);
  const trees = own ? [own.dir, own.repoPath].filter(Boolean) : [];
  if (base && trees.length) {
    const found = huntByName(base, trees, fs);
    if (found) return { ok: true, path: found };
  }

  return { ok: false, error: notFoundMessage(raw, own, product) };
}
