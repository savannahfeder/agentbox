// WHAT A RUN CHANGED, WRITTEN DOWN AS A FILE SHE CAN OPEN.
//
// This is the half that runs when the session ends. The pane that draws it is
// renderer/src/components/CodeArtifact.tsx and the arithmetic it draws with is
// renderer/src/code-artifact.ts; nothing here draws anything.
//
// WHAT THIS FILE READS, AND WHAT IT NO LONGER READS ALONE. The conversation:
// every edit a Claude Code session makes through the editing tool is a
// `tool_use` block in its own transcript, carrying the exact text it replaced
// and the exact text it wrote, stamped, in order. It is the only place the
// agent's own sentence beside a change exists, and the only reading available
// on a product with no repository.
//
// IT IS NOT ENOUGH ON ITS OWN, AND THAT WAS MEASURED, NOT ARGUED. An agent
// that rewrites a file with sed or a heredoc puts nothing in its transcript,
// and on her Mac 2026-08-24 that was 101 of the 105 runs that changed a file
// over two days. Every one of those left a tester an empty card. So the disk is
// read too, by main/git-change.mjs, and `mergeChange` below puts the two
// together: git's lines, the conversation's words, git winning where they
// disagree.
//
// WHAT IS STILL REFUSED, from her 2026-08-23 answer: a branch diffed against
// main, and a slab of raw patch handed to the window. What replaced it is a
// photograph of this run's own checkout, taken when the run spawns.
// tests/the-old-git-diff-screen-stays-gone.test.mjs holds the line.
//
// MEASURED ON HER MAC, 2026-08-23, over the sixty largest conversations: 4,442
// file writes, 99.7% with the agent's own prose earlier in the same message.
import fs from 'node:fs';
import path from 'node:path';
import { machineryPath } from './store/home.mjs';

/** The tools that change a file on disk. Read, Bash and the rest are not edits. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Source we would never show her: the store's own bookkeeping and scratch. */
const NOT_CODE = /(^|\/)(node_modules|\.git)\//;

// AND SCRATCH, WHICH IS NOT THE PRODUCT. A run writes throwaway scripts to
// /tmp constantly and one of them landed in the tree as a folder called `tmp`
// on the first real change we read (18 files, and one of them was
// /tmp/shelf-shots.mjs). Dropped rather than shown: what a tester is being asked
// to review is the product, and a file nobody will ever open again reads as
// work they have to account for.
const SCRATCH = /^\/(private\/)?(tmp|var\/folders)\//;

/**
 * A root, spelt the way the filesystem really spells it.
 *
 * Resolved off the DEEPEST ANCESTOR THAT STILL EXISTS rather than off the root
 * itself, because this runs after the work is over: a worktree can be removed,
 * a scratch folder cleaned up, a branch checked out elsewhere, and a change she
 * can still open must not depend on the checkout outliving the run. `/tmp/gone`
 * resolves through `/tmp` to `/private/tmp/gone` with nothing on disk at all.
 */
function realRoot(root) {
  let head = path.resolve(root);
  const tail = [];
  for (let i = 0; i < 64; i += 1) {
    try {
      const real = fs.realpathSync(head);
      const full = tail.length ? path.join(real, ...tail) : real;
      return full === path.resolve(root) ? null : full;
    } catch { /* not there; try its parent */ }
    const parent = path.dirname(head);
    if (parent === head) return null;
    tail.unshift(path.basename(head));
    head = parent;
  }
  return null;
}

function lines(text) {
  const s = String(text ?? '');
  if (!s) return [];
  const out = s.split('\n');
  // A trailing newline is a line terminator, not an empty last line.
  if (out.length > 1 && out[out.length - 1] === '') out.pop();
  return out;
}

/**
 * The rows of one edit: what came out, what went in, and the lines around them
 * that did not move.
 *
 * A plain longest-common-subsequence over the two texts, which is what makes a
 * one-line insertion read as one green line inside its own neighbours rather
 * than as the whole block replaced. `old` empty (a Write) is every line green.
 */
export function rowsForEdit(oldText, newText) {
  const a = lines(oldText);
  const b = lines(newText);
  if (!a.length) return b.map((l) => ['+', l]);
  if (!b.length) return a.map((l) => ['-', l]);

  // A guard on the table rather than on the file: a 400x400 table is 160k
  // cells and instant, a 20k x 20k one is 400M and would hang the exit
  // handler. Past it the edit is shown as a straight replacement, which is
  // what a whole-file rewrite honestly is.
  if (a.length * b.length > 4_000_000) {
    return [...a.map((l) => ['-', l]), ...b.map((l) => ['+', l])];
  }

  const n = a.length, m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] = a[i] === b[j]
        ? table[at(i + 1, j + 1)] + 1
        : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }
  const rows = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push(['=', a[i]]); i++; j++; }
    else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) { rows.push(['-', a[i]]); i++; }
    else { rows.push(['+', b[j]]); j++; }
  }
  while (i < n) { rows.push(['-', a[i]]); i++; }
  while (j < m) { rows.push(['+', b[j]]); j++; }
  return rows;
}

/** Every edit inside one tool call, as one hunk each. */
function hunksFromCall(input) {
  const out = [];
  if (Array.isArray(input?.edits)) {
    for (const e of input.edits) out.push(rowsForEdit(e?.old_string, e?.new_string));
    return out;
  }
  if (typeof input?.new_string === 'string' || typeof input?.old_string === 'string') {
    out.push(rowsForEdit(input.old_string, input.new_string));
    return out;
  }
  if (typeof input?.content === 'string') {
    out.push(rowsForEdit('', input.content));
    return out;
  }
  if (typeof input?.new_source === 'string') {
    out.push(rowsForEdit(input.old_source ?? '', input.new_source));
    return out;
  }
  return out;
}

/**
 * The agent's own sentence, taken from the text blocks of the same message the
 * edit was in. One line, because that is all the file ever needs to carry.
 */
function proseFrom(content) {
  if (!Array.isArray(content)) return '';
  const said = content.filter((b) => b?.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim();
  if (!said) return '';
  const first = said.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';
  return first.slice(0, 400);
}

/**
 * A change, built out of one session's own transcript.
 *
 * `roots` are the checkouts this product's work happens in. Anything written
 * outside all of them is somebody else's file or /tmp scratch and is dropped,
 * which is the same rule run-files.ts already applies to the chips on a card.
 * When no root matches at all the absolute path is kept, because a change with
 * no files in it is worse than one with a long name in it.
 */
/**
 * The tally the reader fills in. It owns the two rules that decide whether a
 * file belongs in her artifact at all — inside one of this run's own roots, and
 * not scratch — and the arithmetic underneath the panel.
 */
function collector({ roots = [] } = {}) {
  const files = new Map();
  const totals = { plus: 0, minus: 0, editCount: 0, withProse: 0, startedAt: 0, endedAt: 0 };

  // EACH ROOT AND ALSO WHAT IT REALLY IS, because a tool may report either
  // spelling. Measured 2026-08-26 in a repo under /tmp: the app knew the
  // checkout as `/tmp/proof/widget-repo` and an edit written against
  // `/private/tmp/proof/widget-repo/math.js` matched no root, fell through to
  // the scratch rule below and was dropped — a run that really did change her
  // code finishing with an artifact that did not mention it.
  //
  // macOS is the common case (/tmp is a symlink to /private/tmp, and so is
  // /var), but nothing here is macOS-specific: any checkout reached through a
  // symlink has the same shape, and matching both spellings costs one stat per
  // root, once.
  const spellings = new Set();
  for (const r of roots.filter(Boolean)) {
    spellings.add(r);
    const real = realRoot(r);
    if (real) spellings.add(real);
  }
  const sorted = [...spellings].map((r) => (r.endsWith('/') ? r : `${r}/`)).sort((a, b) => b.length - a.length);

  const relative = (abs) => {
    for (const root of sorted) if (abs.startsWith(root)) return abs.slice(root.length);
    return null;
  };

  return {
    files,
    totals,
    add(abs, rows, { said = '', stamp = 0 } = {}) {
      abs = String(abs ?? '').trim();
      if (!abs || NOT_CODE.test(abs)) return;
      const rel = relative(abs);
      // Inside one of this run's own roots it is the product, wherever it
      // sits. Outside all of them AND under scratch, it is nobody's.
      if (rel === null && SCRATCH.test(abs)) return;
      if (!rows.length) return;
      const p = rows.filter((r) => r[0] === '+').length;
      const m = rows.filter((r) => r[0] === '-').length;
      if (!p && !m) return;
      const key = rel ?? abs;
      const file = files.get(key) ?? { path: key, abs, hunks: [], plus: 0, minus: 0, at: stamp };
      file.hunks.push({ rows, said: said || undefined, at: stamp || undefined, plus: p, minus: m });
      file.plus += p; file.minus += m;
      files.set(key, file);
      totals.plus += p; totals.minus += m;
      totals.editCount += 1;
      if (said) totals.withProse += 1;
      if (stamp) {
        if (!totals.startedAt || stamp < totals.startedAt) totals.startedAt = stamp;
        if (stamp > totals.endedAt) totals.endedAt = stamp;
      }
    },
    done() {
      return {
        files: [...files.values()],
        // The checkouts this run's work happened in, so a change read back
        // weeks later can still find the file a short path belongs to.
        roots: [...roots].filter(Boolean),
        plus: totals.plus,
        minus: totals.minus,
        editCount: totals.editCount,
        withProse: totals.withProse,
        startedAt: totals.startedAt || undefined,
        endedAt: totals.endedAt || undefined,
      };
    },
  };
}

export function changeFromTranscript(text, { roots = [], since = 0 } = {}) {
  const into = collector({ roots });

  for (const raw of String(text ?? '').split('\n')) {
    if (!raw.trim()) continue;
    let row;
    try { row = JSON.parse(raw); } catch { continue; }
    if (row?.type !== 'assistant') continue;
    const content = row?.message?.content;
    if (!Array.isArray(content)) continue;
    const stamp = Date.parse(row?.timestamp ?? '') || 0;
    if (since && stamp && stamp < since) continue;
    const said = proseFrom(content);
    for (const block of content) {
      if (block?.type !== 'tool_use' || !EDIT_TOOLS.has(block.name)) continue;
      // THE ABSOLUTE PATH IS KEPT BESIDE THE SHORT ONE, because a line she
      // types into the change has to be written back to the file it came from,
      // and `renderer/src/api.ts` on its own does not say which checkout that
      // is. The short path is still what the tree and the crumb draw; this is
      // never shown.
      const abs = block?.input?.file_path ?? block?.input?.notebook_path ?? '';
      for (const rows of hunksFromCall(block.input)) into.add(abs, rows, { said, stamp });
    }
  }

  return into.done();
}

/** Where a run's change is written, product-relative. */
export function changePath(itemId) {
  return `runs/${itemId}/the-change-it-made.change`;
}

/** An absolute path as the shortest of the run's roots can say it. */
export function shortPath(abs, roots = []) {
  const sorted = [...roots].filter(Boolean).map((r) => (r.endsWith('/') ? r : `${r}/`)).sort((a, b) => b.length - a.length);
  for (const root of sorted) if (String(abs).startsWith(root)) return String(abs).slice(root.length);
  return null;
}

/**
 * The two readings of one run, put together.
 *
 * WHERE THEY DISAGREE, THE DISK WINS. The conversation only knows what the
 * agent typed through the editing tool, and a run that used sed for half its
 * work would otherwise show half a change, which reads as a finished one. What
 * the transcript keeps is the agent's own sentence beside the hunk, so a file
 * both of them have takes git's lines and the conversation's words.
 *
 * The transcript also keeps every file git cannot see: the drawings and
 * reports a run writes into the product's own folder, which is not a checkout,
 * and anything under a product with no repository at all.
 */
export function mergeChange(fromTranscript, repoChanges = [], { roots = [] } = {}) {
  const files = new Map(fromTranscript.files.map((f) => [f.path, f]));
  let fromDisk = 0;
  for (const repo of repoChanges) {
    if (!repo?.root) continue;
    for (const file of repo.files ?? []) {
      const abs = path.join(repo.root, file.path);
      const key = shortPath(abs, roots) ?? file.path;
      const said = files.get(key)?.hunks?.find((h) => h.said)?.said;
      const at = files.get(key)?.at;
      const hunks = file.hunks.map((h, i) => (i === 0 && said ? { ...h, said } : h));
      files.set(key, { path: key, abs, hunks, plus: file.plus, minus: file.minus, at, fromDisk: true });
      fromDisk += 1;
    }
  }
  const out = [...files.values()];
  const spawnedAt = repoChanges.map((r) => r?.at).filter(Boolean).sort()[0];
  return {
    ...fromTranscript,
    // A run whose conversation held no edits still has a clock: the moment its
    // checkout was photographed, and the moment it was read back.
    startedAt: fromTranscript.startedAt ?? spawnedAt,
    endedAt: fromTranscript.endedAt ?? (fromDisk ? Date.now() : undefined),
    files: out,
    plus: out.reduce((n, f) => n + (f.plus ?? 0), 0),
    minus: out.reduce((n, f) => n + (f.minus ?? 0), 0),
    editCount: out.reduce((n, f) => n + (f.hunks?.length ?? 0), 0),
    // How many of the files on the card came from reading the disk rather than
    // the conversation. Not drawn; it is how the next round can measure this
    // without re-deriving it.
    fromDisk,
  };
}

/**
 * Build the change for one finished run and put it in the product's folders.
 *
 * `repos` are the snapshots taken of this run's checkouts when it spawned
 * (main/git-change.mjs), already read back into changes. Passing none is the
 * old behaviour exactly: the conversation alone.
 *
 * `change` IS THE CONVERSATION HALF, ALREADY READ, for a run whose conversation
 * this file cannot read. `changeFromTranscript` speaks Claude Code's JSONL and
 * only that; a Codex run's own edits arrive as app-server notifications and are
 * read by `changeFromCodexTurn` in main/codex.mjs, which produces the same
 * shape. When one is handed over, the transcript is not opened at all -- there
 * is nothing in a Codex rollout this reader would find, and half an artifact
 * looks exactly like a finished one.
 *
 * The caller owns the roots it prepared that half with. They are the same roots
 * it passes here, and the repo roots this function adds are already among them
 * on every path that does this (the checkout a run works in is its cwd).
 *
 * Returns the absolute path, or null when the run touched no code at all,
 * which is most runs: a session that answered a question or drew a page has
 * nothing to show here and must not leave an empty artifact behind.
 */
export function writeChangeForRun({ transcript, docsDir, itemId, roots = [], since = 0, repos = [], change: prepared = null }) {
  if (!docsDir || !itemId) return null;
  const allRoots = [...roots, ...repos.map((r) => r?.root).filter(Boolean)];
  let said = prepared;
  if (!said) {
    let text = '';
    try { text = fs.readFileSync(transcript, 'utf8'); } catch { text = ''; }
    said = changeFromTranscript(text, { roots: allRoots, since });
  }
  const change = mergeChange(said, repos, { roots: allRoots });
  if (!change.files.length) return null;
  // THROUGH THE HOME, NOT INTO HER FOLDER. This line used to be
  // `path.join(docsDir, ...)`, which is the one writer the move in
  // main/store/home.mjs did not catch. So `runs/` was carried out of her folder
  // once and then re-created in it by the next run that changed any code, which
  // is why files kept reappearing there after the move was supposedly done.
  const out = machineryPath(docsDir, changePath(itemId));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ item: itemId, ...change }, null, 1));
  return out;
}

/** Read a change back off disk for the pane. */
export function readChange(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || !Array.isArray(parsed.files)) throw new Error('that file is not a change');
  return parsed;
}
