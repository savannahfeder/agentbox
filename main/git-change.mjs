// WHAT ACTUALLY MOVED ON THE DISK, READ OUT OF THE REPOSITORY.
//
// THE HOLE. main/code-change.mjs builds a run's change out of the agent's own
// conversation, which only carries the before and after when the agent used
// the Edit or Write tool. Measured on this Mac 2026-08-24: of 105 runs that
// changed a file over two days, 4 would have shown the whole change. The other
// 101 rewrote their files with sed, a heredoc or a script, and a card drawn
// from the conversation has nothing in it. That is what a tester was clicking.
//
// SO THE CARD STOPS ASKING HOW THE AGENT TYPED. A run's checkout is
// photographed when the session spawns and read again when it exits, and the
// difference between the two is the change. It catches every route in, because
// it never asks which one was taken.
//
// WHY THE CONVERSATION IS STILL READ AND NOT REPLACED. Three reasons, all
// real: a product with no repository (most of her twenty-eight) has nothing
// here to read; the product's own docs folder is not a checkout and that is
// where the reports and drawings a run makes for her live; and the agent's
// sentence beside a hunk only exists in the conversation. So git fills the
// code and the transcript fills the words, and where git has a file the
// transcript also has, git wins: it is the disk.
//
// WHAT IT STILL CANNOT DO, said plainly because the next session will wonder.
// In a checkout two agents share, a file the other one wrote inside this run's
// window is inside this run's window, and no reading of the disk can tell them
// apart. Most workers get their own worktree, where this does not arise.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Bigger than this is not a file anybody reads a diff of. */
const BIG_FILE = 512 * 1024;

/** How much already-changed work we copy at spawn before giving up on it. */
const COPY_BUDGET = 16 * 1024 * 1024;

/** Rows one file may contribute before the rest is left out and said so. */
const MAX_ROWS_PER_FILE = 20_000;

/** The store's own bookkeeping, which git would not offer anyway. */
const NOT_CODE = /(^|\/)(node_modules|\.git)\//;

function git(cwd, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  // A user's `diff.mnemonicPrefix` rewrites a/ and b/ into c/ i/ o/ w/.
  // The reader below only knows one prefix. Turn the setting off for this
  // process so a checkout reads the same on every machine.
  return execFileSync('git', ['--no-pager', '-c', 'diff.mnemonicPrefix=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function tryGit(cwd, args, opts) {
  try { return git(cwd, args, opts); } catch { return null; }
}

/** Split a -z list, dropping the empty tail. */
function zList(out) {
  return String(out ?? '').split('\0').filter(Boolean);
}

/** Text we would draw. A NUL in the first block means a picture or a binary. */
function readTextFile(file) {
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }
  if (!stat.isFile() || stat.size > BIG_FILE) return null;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  if (text.includes('\0')) return null;
  return text;
}

/**
 * The checkout as it stands, kept so the same checkout can be read again when
 * the run ends.
 *
 * Cheap on purpose, because it runs on the spawn path of every worker: two
 * git commands that list names, and a copy of only those files that were
 * already changed before the run started. In a worker's own fresh worktree
 * that last set is empty. Measured on her main checkout, which is the worst
 * case she has: 199 untracked files, 4 already changed, 0.02s.
 *
 * Returns null when the directory is not a repository at all, which is the
 * ordinary case for a product with no code, and the caller carries on with
 * the conversation alone.
 */
export function snapshotRepo(cwd) {
  if (!cwd) return null;
  const root = tryGit(cwd, ['rev-parse', '--show-toplevel'])?.trim();
  if (!root) return null;
  const head = tryGit(root, ['rev-parse', 'HEAD'])?.trim() || null;

  // Everything that was ALREADY different from HEAD when we arrived, plus
  // everything untracked. Their contents are the only thing we have to keep,
  // because for every other file the start state is the commit.
  const dirty = head ? zList(tryGit(root, ['diff', '--name-only', '-z', 'HEAD'])) : [];
  const others = zList(tryGit(root, ['ls-files', '-z', '--others', '--exclude-standard']));

  const before = new Map();
  let kept = 0;
  for (const rel of new Set([...dirty, ...others])) {
    if (NOT_CODE.test(rel)) continue;
    const text = readTextFile(path.join(root, rel));
    // A file that is missing, binary or huge is remembered as unreadable
    // rather than as empty: calling it empty would draw the whole of it green
    // at the end as if this run had written it.
    if (text === null) { before.set(rel, null); continue; }
    if (kept + text.length > COPY_BUDGET) { before.set(rel, null); continue; }
    kept += text.length;
    before.set(rel, text);
  }
  return { root, head, before, at: Date.now() };
}

/**
 * WHERE A HUNK STARTS IN EACH FILE, off its `@@` header —.
 *
 * Measured while looking into that: the pane had no line numbers at all, and
 * the reason is that this parser matched `@@` only to know a hunk had started
 * and threw the header away, numbers included. They were always right there.
 *
 * `@@ -12,7 +14,9 @@ some context` means the old file's run starts at line 12
 * and the new file's at 14. The counts after the commas are how many lines each
 * run covers and are not needed: walking the body gives the same answer and
 * cannot disagree with the rows actually drawn.
 */
function hunkStarts(header) {
  const m = /^@@+ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(String(header ?? ''));
  return m ? { old: Number(m[1]), now: Number(m[2]) } : null;
}

/**
 * One line of a change, the shape renderer/src/code-artifact.ts draws, and the
 * line number each one had in each file.
 *
 * `nums` runs parallel to `rows`, one `[old, now]` per row, with null on the
 * side a row does not exist in: a removed line has no number in the new file
 * and an added one has none in the old. It is a SECOND array rather than a
 * third slot on the row because `Row` is `['=' | '+' | '-', string]` in six
 * other files and their tests, and widening it to carry a number that only
 * git can supply would touch every one of them to no purpose.
 *
 * With no header there are no numbers, and that is left honest rather than
 * guessed: `nums` comes back null and the pane draws the gutter empty.
 */
function rowsFromPatchBody(body, starts) {
  const rows = [];
  const nums = starts ? [] : null;
  let old = starts?.old ?? 0;
  let now = starts?.now ?? 0;
  for (const line of body) {
    const mark = line[0];
    if (mark === '\\') continue; // "\ No newline at end of file"
    if (mark === '+') { rows.push(['+', line.slice(1)]); nums?.push([null, now++]); }
    else if (mark === '-') { rows.push(['-', line.slice(1)]); nums?.push([old++, null]); }
    else if (mark === ' ') { rows.push(['=', line.slice(1)]); nums?.push([old++, now++]); }
  }
  return { rows, nums };
}

/**
 * A unified diff as files and hunks.
 *
 * Git's own diff rather than our line matcher, because a whole file read off
 * the disk is thousands of lines and the matcher in code-change.mjs gives up
 * over four million cells, which a 3,000 line file crosses on its own. Git
 * also brings the three lines of context that make a save able to find its
 * place again (renderer/src/code-edit.ts).
 */
export function filesFromPatch(patch) {
  const out = new Map();
  let file = null;
  let oldName = null;
  let hunk = null;
  // The `@@` line for the hunk being collected, kept until its body is closed.
  let starts = null;
  const closeHunk = () => {
    if (!file || !hunk) return;
    const { rows, nums } = rowsFromPatchBody(hunk, starts);
    hunk = null;
    starts = null;
    const plus = rows.filter((r) => r[0] === '+').length;
    const minus = rows.filter((r) => r[0] === '-').length;
    if (!plus && !minus) return;
    file.hunks.push(nums ? { rows, nums, plus, minus } : { rows, plus, minus });
    file.plus += plus;
    file.minus += minus;
  };
  const nameOn = (line, side) => {
    const name = line.slice(4).trim();
    if (name === '/dev/null') return null;
    // a/ and b/ are the ordinary prefixes. c/ i/ o/ w/ are mnemonicPrefix,
    // and 1/ 2/ are `git diff --no-index` under that same setting. One
    // prefix comes off; a file that is itself named `b/foo` stays `b/foo`.
    return name.replace(/^[abiowc12]\//, '');
  };
  for (const line of String(patch ?? '').split('\n')) {
    if (line.startsWith('diff --git ')) { closeHunk(); file = null; oldName = null; continue; }
    if (line.startsWith('--- ')) { closeHunk(); oldName = nameOn(line, 'old'); file = null; continue; }
    if (line.startsWith('+++ ')) {
      // A delete has no new name, so it is filed under the old one. A rename
      // is filed under the new one, which is where it now is on the disk.
      const rel = nameOn(line, 'new') ?? oldName;
      file = null;
      if (rel && !NOT_CODE.test(rel)) {
        file = out.get(rel) ?? { path: rel, hunks: [], plus: 0, minus: 0 };
        out.set(rel, file);
      }
      continue;
    }
    if (line.startsWith('@@')) { closeHunk(); hunk = file ? [] : null; starts = file ? hunkStarts(line) : null; continue; }
    if (hunk) hunk.push(line);
  }
  closeHunk();
  // A file git listed but whose whole diff was binary says nothing here.
  return [...out.values()].filter((f) => f.hunks.length);
}

/** A file that was not there before: every line of it, green. */
function wholeFileRows(text) {
  const parts = String(text).split('\n');
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return parts.map((l) => ['+', l]);
}

/** Two texts, diffed by git without either of them being in a repository. */
function patchBetweenTexts(before, after) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-diff-'));
  try {
    const a = path.join(dir, 'before');
    const b = path.join(dir, 'after');
    fs.writeFileSync(a, before);
    fs.writeFileSync(b, after);
    // --no-index exits 1 when the files differ, which is the whole point, so
    // the non-zero exit is the success case and is read off the error.
    try {
      return git(dir, ['diff', '--no-color', '--no-ext-diff', '--no-index', '-U3', '--', a, b]);
    } catch (e) {
      return String(e?.stdout ?? '');
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * What this run changed in this checkout, read off the disk.
 *
 * Three sources, because a checkout has three kinds of file in it and the
 * start state of each is somewhere different:
 *
 * - Tracked and untouched at spawn: the commit we were on is the before, so
 *   one `git diff` against it says everything, committed work included.
 * - Already changed at spawn: the copy we kept is the before, because the
 *   commit would credit this run with somebody else's unfinished work.
 * - Written by this run and never tracked: there is no before, so the file is
 *   every line green.
 */
export function changeFromRepo(snapshot) {
  if (!snapshot?.root) return { files: [], plus: 0, minus: 0, root: snapshot?.root ?? null };
  const { root, head, before } = snapshot;
  const files = new Map();
  const add = (file) => {
    if (!file.hunks.length) return;
    if (file.hunks.length && file.plus + file.minus > MAX_ROWS_PER_FILE) {
      // Kept honest rather than kept whole: a generated file can be tens of
      // thousands of lines and nobody reads past the first screen anyway.
      let rows = 0;
      const keep = [];
      for (const h of file.hunks) {
        if (rows >= MAX_ROWS_PER_FILE) break;
        keep.push(h);
        rows += h.rows.length;
      }
      file.leftOut = file.hunks.length - keep.length;
      file.hunks = keep;
    }
    files.set(file.path, file);
  };

  // 1. Everything tracked, against the commit the run started on. The files
  //    we kept a copy of are cut out here and done properly below.
  if (head) {
    const excludes = [...before.keys()].map((rel) => `:(exclude,literal)${rel}`);
    const patch = tryGit(root, [
      'diff', '--no-color', '--no-ext-diff', '-U3', '-M', head, '--', '.', ...excludes,
    ]);
    for (const file of filesFromPatch(patch ?? '')) add(file);
  }

  // 2. The files that were already changed when we arrived.
  for (const [rel, kept] of before) {
    if (kept === null) continue; // unreadable at spawn; we cannot honestly diff it
    const now = readTextFile(path.join(root, rel));
    const after = now === null ? '' : now;
    if (after === kept) continue;
    for (const file of filesFromPatch(patchBetweenTexts(kept, after))) {
      add({ ...file, path: rel });
    }
  }

  // 3. Files this run made that git has never tracked.
  for (const rel of zList(tryGit(root, ['ls-files', '-z', '--others', '--exclude-standard']))) {
    if (before.has(rel) || files.has(rel) || NOT_CODE.test(rel)) continue;
    const text = readTextFile(path.join(root, rel));
    if (text === null || !text.length) continue;
    const rows = wholeFileRows(text);
    // A FILE NOBODY HAS SEEN BEFORE NUMBERS ITSELF. Every row is an addition
    // and the file starts at line 1, so there is nothing to parse and no reason
    // to leave this the one place in the pane with an empty gutter.
    const nums = rows.map((_, i) => [null, i + 1]);
    add({ path: rel, hunks: [{ rows, nums, plus: rows.length, minus: 0 }], plus: rows.length, minus: 0 });
  }

  const out = [...files.values()];
  return {
    files: out,
    plus: out.reduce((n, f) => n + f.plus, 0),
    minus: out.reduce((n, f) => n + f.minus, 0),
    root,
    // When the photograph was taken, which is the run's own start and the only
    // honest answer to "how long did this take" for a run whose conversation
    // carried no edits at all.
    at: snapshot.at,
  };
}
