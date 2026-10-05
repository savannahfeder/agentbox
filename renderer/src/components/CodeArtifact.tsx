// THE CHANGE THE AGENT MADE, AS AN ARTIFACT IN THE PANE.
//
// So this is not a screen and not a window. It is a third kind of file for the
// pane that already opens markdown and html, and everything around it — the
// crumb, the way out, the two marks, the divider, the split she dragged — is
// the pane's and is not touched here.
//
// WHAT IS IN IT AND WHY, measured against Cursor, the Codex app and the Claude
// Code desktop app on 2026-08-23 (reports/how-developers-read-agent-code.html).
// All three give the same six things: a list of the changed files beside the
// change, coloured counts, syntax colour, folding a file shut, a keystroke to
// move, and a way out to the developer's own editor. None of the three shows
// two columns side by side, none puts the change in the conversation as the
// main surface, and none takes commands at the diff. The rule for v1 is that
// we do not go past what those three do, so this has the six and stops.
//
// A chain of folders with one child each folds into one row (`treeRows`), so
// the tree of a real eleven-file change is fifteen rows two levels deep rather
// than a nesting exercise.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import {
  BATCH_ROWS, changeSummary, filesInTreeOrder, fillNext, firstBatch, hunkView, hunkViewAt, linesSkipped, rowSlices, sliceGuessPx, stepInTree, tokenize, tookLabel, treeRows, visibleRows,
  type Change, type ChangedFile, type Hunk,
} from '../code-artifact';
import { copiedText, linesToCopy } from '../code-copy';
import { applySplices, savedLine, unsavedIn, type Row as EditRow } from '../code-edit';
import { caretStep, codeScroll, editsAcrossLines, extendHead, extendsSelection, fileOnScreen, inputChangesText, type Head } from '../code-keys';

/*
 * ------------------------- the caret, in the DOM ---------------------------
   A line is a span full of little coloured spans, so "the caret is at column
   nine" is not a thing the DOM says out loud: it says which text node and how
   far into it. These two turn one into the other and back, and they are the
   only DOM the arrow keys touch. The RULES are in code-keys.ts, where they can
   be tested; this is the plumbing under them. ------------------------------ */

/** Every line of the change she is allowed to type into, in the order drawn. */
function editableLines(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.code-body .code-line')]
    .filter((el) => el.isContentEditable);
}

/** How many characters sit to the left of the caret inside `el`. */
function caretColumn(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.focusNode || !el.contains(sel.focusNode)) return 0;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.setEnd(sel.focusNode, sel.focusOffset);
  return range.toString().length;
}

/** The text node and offset `col` characters into `el`, for a range endpoint. */
function pointAt(el: HTMLElement, col: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = col;
  let node: Text | null = null;
  let offset = 0;
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    node = t;
    const len = t.data.length;
    if (left <= len) { offset = left; break; }
    left -= len;
    offset = len;
  }
  return node ? { node, offset: Math.min(offset, node.data.length) } : { node: el, offset: 0 };
}

/** Put the caret `col` characters into `el`, or at its end if it is shorter. */
function placeCaret(el: HTMLElement, col: number) {
  el.focus();
  const { node, offset } = pointAt(el, col);
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  // The line she has just landed on has to be ON the screen. `nearest` is the
  // whole of it: it moves the column only when the line is off the edge, so
  // walking down the middle of a screenful does not jump.
  el.scrollIntoView({ block: 'nearest' });
}

/*
 * ----------- WHAT THE USER TYPED AND HAS NOT SAVED, KEPT -------------------
   One map per change, outside every component, so closing the pane does not
   throw her typing away (round four; the story is on `edits` below). It is
   per running app and never touches disk. ---------------------------------- */
const KEPT = new Map<string, Map<string, Map<number, Map<number, string>>>>();

/** The unsaved edits for one change, made if this is the first time. */
function keepFor(product: string, src: string) {
  const key = `${product}\n${src}`;
  const had = KEPT.get(key);
  if (had) return had;
  const made = new Map<string, Map<number, Map<number, string>>>();
  KEPT.set(key, made);
  return made;
}

/** Every line of the change that is drawn, in the order drawn. */
function allLines(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.code-body .code-line')];
}

/**
 * How many lines of the change the selection is standing on right now.
 *
 * Two or more is the case an edit cannot serve: the browser's delete and its
 * insert both stop at the end of the contentEditable they are in, so they would
 * take the first line of the block and leave the rest (code-keys.ts,
 * editsAcrossLines, has the measurement and why refusing is the answer).
 *
 * It counts every line the range touches, INCLUDING the removed ones, because
 * the question here is what she has under her hands, not what a copy would
 * hand back. linesToCopy drops the red lines for the clipboard's sake; a
 * selection that reaches across one is still a selection across lines.
 */
function selectedLineCount(): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return 0;
  const range = sel.getRangeAt(0);
  return allLines().filter((el) => range.intersectsNode(el)).length;
}

/** How far into `el` a point of the selection sits, in characters. */
function offsetIn(el: HTMLElement, node: Node, offset: number): number {
  if (!el.contains(node)) return 0;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** The five colours, drawn as classes so the stylesheet owns every value. An
 * uncoloured token is bare text: one element fewer per word, on a pane that
 * held 386,310 of them on the biggest real change. */
function Code({ line }: { line: string }) {
  const toks = useMemo(() => tokenize(line), [line]);
  return (
    <>{toks.map((t, i) => (t.c ? <span key={i} className={`t-${t.c}`}>{t.s}</span> : t.s))}</>
  );
}

function Counts({ plus, minus }: { plus: number; minus: number }) {
  return (
    <span className="code-counts">
      {plus > 0 && <span className="code-plus">+{plus}</span>}
      {minus > 0 && <span className="code-minus">−{minus}</span>}
    </span>
  );
}

// ONE LINE, AND IT IS THE ONE THING ON THIS SCREEN SHE CAN TYPE INTO.
//
// MEMOISED, AND THAT IS LOAD BEARING RATHER THAN AN OPTIMISATION. A line she is
// typing in is a contentEditable, so its text lives in the DOM and not in
// React's idea of it. If a re-render higher up reconciled these children, React
// would put the ORIGINAL line back and her keystrokes would vanish. Identical
// props mean React skips the subtree entirely, so the only thing that ever
// rewrites this DOM is her.
//
// A REMOVED LINE IS NOT EDITABLE, and that is not a restriction so much as an
// honest one: it is not in the file any more, so there is nowhere on disk her
// words could go.
const CodeLine = memo(function CodeLine({ mark, line, num, editable, onEdit, onDone }: {
  mark: string;
  line: string;
  // What line this was in the file, or null where the change came out of the
  // conversation and nobody knows. Null draws an empty gutter, not a guess.
  num: number | null;
  editable: boolean;
  onEdit: (text: string) => void;
  onDone: () => void;
}) {
  return (
    <div className={`code-row${mark === '+' ? ' cr-plus' : mark === '-' ? ' cr-minus' : ''}${editable ? ' cr-live' : ''}`}>
      {/* THE NUMBER LIVES OUTSIDE `.code-line`, and that is load bearing rather
          than tidiness. Everything that reads the change reads the text of
          `.code-line`: the clipboard (code-copy.ts), a save finding its place
          in the file (code-edit.ts), and the arrow keys counting columns. A
          number inside it would be pasted into her source and counted as
          columns she never typed. Outside it, it is invisible to all three,
          exactly as `.code-mark` already is. */}
      <span className="code-num" aria-hidden="true">{num ?? ''}</span>
      <span className="code-mark" aria-hidden="true">{mark === '=' ? '' : mark === '+' ? '+' : '−'}</span>
      <span
        className="code-line"
        contentEditable={editable || undefined}
        suppressContentEditableWarning={editable}
        spellCheck={false}
        onInput={editable ? (e) => onEdit(e.currentTarget.textContent ?? '') : undefined}
        onBlur={editable ? onDone : undefined}
        // A ROW IS ONE LINE OF THE FILE AND STAYS ONE LINE. Enter inside a
        // contentEditable would put a second line inside a row, and the row
        // would then read back as those two lines run together — visible, but
        // not what she meant by pressing Enter. Adding a line to the file is a
        // different feature; refusing the key is the honest half of it. ESCAPE
        // STEPS OUT OF THE LINE, not out of the file. A line is a
        // contentEditable, so while the caret is in one the app's own guard
        // refuses every single-letter key AND escape with it — measured dead
        // 2026-08-24. Blurring hands the keyboard back, saves the line on the
        // way past (onBlur is onDone), and the next escape is the ordinary one
        // that closes the change.
        onKeyDown={editable ? (e) => {
          if (e.key === 'Enter') e.preventDefault();
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); }
        } : undefined}
        onPaste={editable ? (e) => {
          // Same reason, from the other end: paste arrives as plain text with
          // its newlines flattened, rather than as html carrying a paragraph.
          e.preventDefault();
          const flat = e.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ');
          document.execCommand('insertText', false, flat);
        } : undefined}
      >
        <Code line={line} />
      </span>
    </div>
  );
}, (a, b) => a.mark === b.mark && a.line === b.line && a.num === b.num && a.editable === b.editable);
// The two callbacks are deliberately NOT compared. They are fresh closures on
// every parent render and comparing them would defeat the memo entirely, which
// is the bug this component exists to avoid. What they close over — the row's
// index and the parent's handler — is stable for the life of one row.

function HunkRows({ hunk, editable, pending, onEdit, onDone }: {
  hunk: Hunk;
  editable: boolean;
  // What the user typed into this hunk and has not saved, by row. Null when nothing
  // is waiting, which is the ordinary case.
  pending?: Map<number, string> | null;
  // (row index inside the hunk, the line as it now reads)
  onEdit: (at: number, text: string) => void;
  onDone: () => void;
}) {
  // BOTH OF THESE WALK EVERY ROW OF THE HUNK, and they used to do it again on
  // every render of the pane. The rows of a hunk do not move while she reads,
  // so the walk is held rather than repeated.
  const { rows } = useMemo(() => hunkView(hunk.rows), [hunk.rows]);
  const at = useMemo(() => hunkViewAt(hunk.rows), [hunk.rows]);
  const draw = (mark: string, text: string, i: number) => {
    // THE USER'S WORDS WIN OVER THE FILE'S. A line typed in and not saved is
    // drawn as she left it, so closing the change and opening it again shows
    // her own text rather than quietly putting the original back.
    const line = (mark === '-' ? undefined : pending?.get(at[i])) ?? text;
    // A REMOVED LINE IS NUMBERED IN THE OLD FILE, everything else in the new
    // one, which is what every diff tool does and the only reading that is
    // true: a red line has no line in the file as it now stands.
    const pair = hunk.nums?.[at[i]];
    const num = (mark === '-' ? pair?.[0] : pair?.[1]) ?? null;
    return (
      <CodeLine
        key={`${at[i]}:${text}`}
        mark={mark}
        line={line}
        num={num}
        editable={editable && mark !== '-'}
        onEdit={(next) => onEdit(at[i], next)}
        onDone={onDone}
      />
    );
  };
  // THE HEIGHT A SLICE STANDS AT WHILE THE BROWSER IS SKIPPING IT. The
  // stylesheet turns on `content-visibility: auto` per slice, not per hunk, so
  // an 800-row hunk is laid out a slice at a time as she reaches it
  // (`rowSlices` in code-artifact.ts has the measurement).
  const slices = useMemo(() => rowSlices(rows.length), [rows.length]);
  return (
    <div className="code-hunk">
      {slices.map(([a, b]) => (
        <div className="code-slice" key={a} style={{ containIntrinsicSize: `auto ${sliceGuessPx(b - a)}px` }}>
          {rows.slice(a, b).map(([mark, text], j) => draw(mark, text, a + j))}
        </div>
      ))}
    </div>
  );
}

// ONE FILE'S WORTH OF CHANGE, AND IT IS SEALED OFF FROM THE REST OF THE PANE.
//
// The re-rendering half of that is real and this is where it was. Scrolling
// moves `at`, the file she is standing on, several times on the way down a long
// change. `at` lives in state, so every one of those moves re-rendered
// CodeArtifact, and the change was built inline inside it: seventeen sections,
// every hunk in each, every row in every hunk. CodeLine's memo saved the DOM
// but not the work above it — 2,562 elements were still described, keyed and
// compared to decide that not one of them had changed.
//
// Measured on a real 2,562-row change with the processor turned down six
// times, this subtree was the largest named cost in a scroll after the layout
// reads below it (HunkRows, draw and CodeLine together, in the sampling
// profiler). Sealing it behind a memo means walking the files costs the
// seventeen headers and nothing else.
//
// EVERY PROP HERE IS STABLE ON PURPOSE, which is the whole of why the memo
// works: `file` comes out of a useMemo, `pending` is a map held in a ref,
// and both handlers are useCallbacks with no dependencies. A fresh closure in
// any one of them would defeat this exactly the way it would defeat CodeLine.
const FileHunks = memo(function FileHunks({ file, pending, onEdit, onDone }: {
  file: ChangedFile;
  // What the user typed into this file and has not saved, by hunk. Null is ordinary.
  pending?: Map<number, Map<number, string>> | null;
  onEdit: (file: string, hunk: number, row: number, text: string) => void;
  onDone: () => void;
}) {
  return (
    <>
      {file.hunks.map((hunk, i) => (
        <div className="code-hunk-block" key={i}>
          {/* WHERE THE FILE JUMPS, SAID PLAINLY. This is the sentence the fold also carried,
             which is that these two blocks are not neighbours. It draws only between hunks
             and only when git gave us the numbers to count with.
           */}
          {i > 0 && linesSkipped(file.hunks[i - 1], hunk) !== null && (
            <div className="code-skip" aria-hidden="true">
              <span>{linesSkipped(file.hunks[i - 1], hunk)} lines not shown</span>
            </div>
          )}
          <HunkRows
            hunk={hunk}
            editable
            // ONLY WHAT WAS KEPT FROM AN EARLIER OPENING IS DRAWN. A line
            // she is typing in right now is a contentEditable holding its
            // own text, and handing it back its own keystrokes is how
            // React puts the caret at the front of the word (CodeLine
            // says why it is memoised at all).
            pending={pending?.get(i) ?? null}
            onEdit={(row, text) => onEdit(file.path, i, row, text)}
            onDone={onDone}
          />
        </div>
      ))}
    </>
  );
});

export function CodeArtifact({ product, src, change, startAt = null, startAtFrom = 0, onFileAt, onNotice }: {
  product: string;
  // The change artifact's own path, which is what a save asks main to look one
  // of its files up inside.
  src: string;
  change: Change;
  // THE FILE IT OPENS STANDING ON, when something pointed at one. That is a
  // chip on a work line in the conversation: she presses the file the agent
  // said it edited and the code opens at that file rather than at the top of
  // a change of eighteen. Null opens at the top, which is every other way in.
  startAt?: string | null;
  // When that pointing happened, so pressing the same chip twice lands twice.
  startAtFrom?: number;
  // THE FILE SHE IS STANDING ON, HANDED BACK UP TO THE PANE.The mark that
  // does it lives in the pane's own header, one level above this, so the
  // only thing this has to say is which file it would open.
  onFileAt: (path: string | null) => void;
  onNotice: (text: string) => void;
}) {
  const files = useMemo(() => filesInTreeOrder(change.files ?? []), [change.files]);
  const rows = useMemo(() => treeRows(files), [files]);
  const [shut, setShut] = useState<Set<string>>(() => new Set());
  const shown = useMemo(() => visibleRows(rows, shut), [rows, shut]);
  const fileRows = useMemo(() => shown.filter((r) => r.kind === 'file'), [shown]);
  const [at, setAt] = useState(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const heads = useRef(new Map<string, HTMLDivElement | null>());
  const treeRef = useRef<HTMLDivElement | null>(null);
  const treeRowRefs = useRef(new Map<string, HTMLButtonElement | null>());
  // Which of the two things moved the tree: her scrolling, or her walking. The
  // scroll-to-the-top effect below reads it and stands down for the first.
  const fromScroll = useRef(false);
  // THE FILE SHE ASKED TO BE TAKEN TO, while the column is still settling under
  // the jump. Non-null means a move she asked for is in flight, and the scroll
  // handler leaves `at` alone until it lands, or her own scroll cancels it.
  // Without this the pane repoints itself mid-jump and she arrives somewhere
  // she did not ask for.
  const holding = useRef<string | null>(null);
  // THE SELECTION SHE IS MAKING WITH THE KEYBOARD, as two points in the list of
  // drawn lines. It has to be carried rather than read back off the DOM,
  // because the moment a selection leaves the line it started in the editing
  // host is blurred and the browser no longer has a caret to grow from.
  const keySel = useRef<{ anchor: Head; head: Head } | null>(null);
  // Where her last plain click landed, which is what a shifted click extends
  // FROM. The browser keeps this itself inside one editing host and loses it
  // between two, which is why a shift-click across lines took only one.
  const clickAnchor = useRef<{ line: HTMLElement; col: number } | null>(null);

  // WHERE SHE STANDS IS A FILE OF THE WHOLE CHANGE, NOT A ROW OF THE TREE.
  // It was a position in the visible tree, so folding a folder made the same
  // position name another file and the code jumped there: 2,739 to 20,787,
  // measured 2026-10-04. `files` never changes when the tree folds.
  const current = files[Math.min(at, Math.max(0, files.length - 1))];
  // A press on a file always jumps, the one she is on included, which bare
  // `at` cannot say when it does not change.
  const [jump, setJump] = useState(0);
  const goTo = (path: string) => {
    const i = files.findIndex((f) => f.path === path);
    if (i < 0) return;
    fromScroll.current = false;
    setAt(i);
    setJump((n) => n + 1);
  };

  // HOW MANY FILES HAVE THEIR CODE DRAWN. A big change opens on its first
  // screenful and the rest is drawn in the idle moments straight after, so
  // opening the largest real change no longer freezes the window for every
  // row of it (`firstBatch` in code-artifact.ts has the numbers). Every file's
  // header is drawn from the start, so the tree, the jumps and the sticky
  // names work while the rest arrives. An ordinary change is drawn whole in
  // the first frame and none of this runs.
  const [drawn, setDrawn] = useState<ReadonlySet<number>>(() => {
    const at0 = Math.max(0, files.findIndex((f) => f.path === startAt));
    return new Set(Array.from({ length: firstBatch(files, 0) }, (_, i) => i).concat(at0));
  });
  const hereIndex = at;
  useEffect(() => {
    if (drawn.size >= files.length) return;
    // NEAREST TO HER FIRST. The file she is on is urgent; anything else waits
    // for a moment her hand is still, because a batch forced in mid-scroll is a
    // dropped frame. Drawing everything above a far file in one go is what
    // stalled a fast scroll for 754ms, measured, so it is never done.
    const plan = fillNext(files, drawn, Math.max(0, hereIndex), BATCH_ROWS);
    const urgent = plan.includes(Math.max(0, hereIndex));
    const next = () => setDrawn((was) => new Set([...was, ...plan]));
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(next, urgent ? { timeout: 60 } : undefined);
      return () => w.cancelIdleCallback?.(h);
    }
    const t = setTimeout(next, 0);
    return () => clearTimeout(t);
  }, [drawn, files, hereIndex]);

  /* * ------------------------- typing into the change -------------------------

     Her keystrokes live in a REF and not in state, on purpose. A line is a
     contentEditable and its text is already in the DOM; putting it in state as
     well would re-render the very element she has a cursor in. The ref is read
     once, when she saves.

     `dirtyAt` is the only thing state has to know: something is unsaved. It
     moves on blur rather than on every keystroke, so no re-render ever lands
     mid-word. -------------------------------------------------------------
  */
  // AND THEY OUTLIVE THE PANE BEING CLOSED, which is round four's fix.
  //
  // MEASURED 2026-08-27 on the real pane: typing a word into a line, pressing
  // escape twice to come out of the change, and opening the same change again
  // showed the ORIGINAL line. The typed words were gone and nothing had said so — no
  // warning on the way out, no mark, no notice. The ref below lives inside the
  // component, so closing the pane unmounted it and took her typing with it.
  //
  // So the ref is seeded from, and written through to, a map that lives outside
  // the component, keyed by which change it is. It is deliberately NOT written
  // to disk: an edit kept across a restart would be measured against a file
  // that has moved on, and applySplices would refuse it with a reason she could
  // no longer place. It lasts as long as the app is running, which is as long
  // as she can remember typing it.
  const edits = useRef(keepFor(product, src));
  // A SNAPSHOT OF WHAT WAS ALREADY WAITING WHEN THIS PANE OPENED, which is the
  // only thing the rows are drawn from. `edits` itself changes under her hands
  // as she types; reading that while she types would rewrite the line she has a
  // caret in, which is the one thing CodeLine's memo exists to prevent.
  const seeded = useRef(new Map([...edits.current].map(([f, byHunk]) => [f, new Map([...byHunk].map(([h, m]) => [h, new Map(m)]))])));
  const [dirtyAt, setDirtyAt] = useState(0);
  const [saving, setSaving] = useState(false);

  const noteEdit = useCallback((file: string, hunk: number, row: number, text: string) => {
    const was = unsavedIn(edits.current).length;
    const byFile = edits.current.get(file) ?? new Map<number, Map<number, string>>();
    const byHunk = byFile.get(hunk) ?? new Map<number, string>();
    byHunk.set(row, text);
    byFile.set(hunk, byHunk);
    edits.current.set(file, byFile);
    // ON THE FIRST CHARACTER, NOT ON BLUR.Half of why is that the mark
    // used to wait until she clicked out of the line, so the whole time
    // she was typing the screen said nothing had changed. This moves the
    // stamp only when the SET of unsaved files changes, so it is one
    // re-render per file and never one per keystroke, and the lines
    // themselves are memoised past it anyway (CodeLine) so her cursor is
    // not touched.
    if (unsavedIn(edits.current).length !== was) setDirtyAt((n) => n + 1);
  }, []);

  const settle = useCallback(() => setDirtyAt((n) => n + 1), []);

  const dirtyFiles = () => unsavedIn(edits.current);

  /**
   * WHAT ⌘S DOES. Every file the user typed in, one at a time, and it says what
   * happened to each. Nothing is written unless her lines can be found in the
   * file exactly as the change left them, which is decided in code-edit.ts and
   * not here.
   */
  const saveAll = useCallback(async () => {
    const targets = dirtyFiles();
    if (!targets.length || saving) return;
    setSaving(true);
    const done: string[] = [];
    try {
      for (const filePath of targets) {
        const file = files.find((f) => f.path === filePath);
        const byHunk = edits.current.get(filePath);
        if (!file || !byHunk) continue;

        const read = await api.codeFile({ product, src: src, path: filePath });
        if (!read.ok || typeof read.text !== 'string') {
          onNotice(read.error ?? `${filePath} could not be opened, so nothing was saved.`);
          continue;
        }
        const splices = [...byHunk.entries()]
          .filter(([, m]) => m.size > 0)
          .map(([hunk, m]) => ({ hunk, rows: (file.hunks[hunk]?.rows ?? []) as EditRow[], edits: m }));
        const spliced = applySplices(read.text, splices);
        if (!spliced.ok) { onNotice(spliced.error); continue; }
        if (spliced.text === read.text) { edits.current.delete(filePath); continue; }

        const wrote = await api.saveCodeFile({
          product, src: src, path: filePath, text: spliced.text, mtime: read.mtime ?? 0,
        });
        if (!wrote.ok) { onNotice(wrote.error ?? `${filePath} could not be saved.`); continue; }
        // Only now is her version the truth, so the rows the pane was drawn
        // from move with it and a second ⌘S is not a second write of the same
        // thing onto lines that no longer match.
        for (const [hunk, m] of byHunk.entries()) {
          const rows = file.hunks[hunk]?.rows;
          if (!rows) continue;
          for (const [row, text] of m.entries()) if (rows[row]) rows[row][1] = text;
        }
        edits.current.delete(filePath);
        done.push(savedLine(filePath, spliced.lines));
      }
    } finally {
      setSaving(false);
      setDirtyAt((n) => n + 1);
    }
    if (done.length) onNotice(done.join(' '));
  }, [files, product, change, saving, onNotice]);

  // THE KEYS THIS PANE ANSWERS, and it is a short list on purpose. J and K used
  // to walk the files from anywhere and no longer do anything at all
  // (code-keys.ts says why they are still swallowed).
  //
  // AND THE ARROWS, WHICH WERE DEAD.Measured before this handler existed:
  // ArrowUp, ArrowDown, ArrowRight, PageUp and PageDown did nothing anywhere in
  // this pane. What an arrow MEANS is decided in code-keys.ts and the three
  // answers are there; this only asks where her keyboard is and does what it is
  // told.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘S FIRST, AND BEFORE THE GUARD BELOW, because the whole point of it is
      // that she is standing in a line she has been typing in. Every other
      // keystroke here stays out of a field, which is why J does not walk the
      // files while she is writing the letter j into one.
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        (e.target as HTMLElement)?.blur?.();
        void saveAll();
        return;
      }
      const el = e.target as HTMLElement | null;
      const tag = String(el?.tagName ?? '').toUpperCase();

      // ── SELECTING WITH THE KEYBOARD, WHICH ALSO HAS TO CROSS THE LINES ────
      // MEASURED 2026-08-27 (round four): shift and two downs from the end of a
      // line reached ZERO lines of the change, and shift with up reached the
      // one line she was already in, so a block could not be taken out of a
      // change without a mouse at all. Same wall as rounds one to three: a line
      // is its own editing host and a native shifted arrow has nothing outside
      // it to extend into. So the head of the selection is carried here and
      // applied with setBaseAndExtent, which is the one call that does cross a
      // host — it is what round three's drag already uses.
      //
      // A PLAIN KEY OR A FRESH PRESS OF THE MOUSE ENDS IT, below, so nothing
      // she does next is measured against a selection she thought was gone.
      if (e.shiftKey && !e.metaKey && !e.altKey && !e.ctrlKey && extendsSelection(e.key)) {
        const lines = allLines();
        const live = keySel.current;
        const startEl = live ? lines[live.head.line] : (el?.closest?.('.code-line') as HTMLElement | null);
        const startIn = live ? live.head.line : lines.indexOf(startEl as HTMLElement);
        if (startEl && startIn >= 0) {
          const anchor = live
            ? live.anchor
            : { line: startIn, col: el?.isContentEditable ? caretColumn(startEl) : 0 };
          const from = live ? live.head : { line: startIn, col: caretColumn(startEl) };
          const to = extendHead(e.key, from, lines.map((l) => (l.textContent ?? '').length));
          if (to) {
            e.preventDefault();
            keySel.current = { anchor, head: to };
            // ONCE IT LEAVES THE LINE, HAND THE KEYBOARD BACK. The line she
            // started in is an editing host and still has focus, so a keystroke
            // would land inside it while six lines are selected. Round three
            // does exactly this the moment a drag crosses out of a line.
            if (to.line !== anchor.line) (document.activeElement as HTMLElement | null)?.blur?.();
            const a = pointAt(lines[anchor.line], anchor.col);
            const b = pointAt(lines[to.line], to.col);
            window.getSelection()?.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
            lines[to.line].scrollIntoView({ block: 'nearest' });
            return;
          }
        }
      }
      // ── AN EDIT ACROSS LINES IS REFUSED, NOT HALF DONE ───────────────────
      // MEASURED 2026-08-27 (round five): four lines selected, one Backspace,
      // and one of the four changed. The other three sat there looking
      // selected and untouched, and the change drew the same 833 lines after
      // as before, so nothing said the press had only reached a quarter of
      // what she was pointing at. code-keys.ts says why the answer is to
      // refuse rather than to implement it: these are diff rows, and joining
      // the first line of a block to the last has no meaning across a removed
      // line or a hunk boundary.
      //
      // THE SELECTION IS LEFT STANDING so ⌘C still takes the block, which is
      // what round four built the selection for in the first place.
      if (selectedLineCount() > 1
        && editsAcrossLines(e.key, { meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey })) {
        e.preventDefault();
        return;
      }

      // Anything else means the selection she was making is finished with.
      if (!e.shiftKey) keySel.current = null;

      // ── HER CARET, CROSSING OUT OF A ONE-LINE DOCUMENT ────────────────────
      // A line of the change is its own contentEditable, so down from the
      // caret is genuinely nowhere and the browser is right to do nothing.
      // Only this component knows the next line is the next sibling.
      const line = el?.closest?.('.code-line') as HTMLElement | null;
      if (line && el?.isContentEditable) {
        const text = line.textContent ?? '';
        const step = caretStep(e.key, { col: caretColumn(line), len: text.length }, { shift: e.shiftKey, meta: e.metaKey });
        if (!step) return;
        const lines = editableLines();
        const here = lines.indexOf(line);
        const next = lines[here + step.move];
        // At the very first or very last editable line there is nowhere to go,
        // and the honest thing is to leave the caret where it is rather than
        // wrap her round to the other end of the change.
        if (here < 0 || !next) { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); return; }
        e.preventDefault();
        // Her keystrokes in the line she is leaving are already in the ref;
        // settle stamps the unsaved mark the way a blur would.
        settle();
        placeCaret(next, step.col === Infinity ? (next.textContent ?? '').length : step.col);
        return;
      }

      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if (e.ctrlKey || e.altKey) return;

      // ── THE FILE TREE, WHEN HER KEYBOARD IS ON IT ─────────────────────────
      // She clicked a file, so the arrows walk the files the way they walk any
      // other sidebar. That is the whole of it now: J and K used to do the same
      // thing from anywhere in the pane and were taken off it.
      const onTree = !!el?.closest?.('.code-tree');
      if (onTree && !e.metaKey) {
        const to = stepInTree(e.key, current?.path ?? null, fileRows.map((r) => (r as { path: string }).path), files.map((f) => f.path));
        if (to != null) {
          e.preventDefault();
          goTo(to);
          return;
        }
      }

      // ── OTHERWISE THE ARROWS SCROLL THE CODE ──────────────────────────────
      // `.code-body` is a plain div, so nothing ever focuses it and the browser
      // had no scroller to hand the arrows to. This gives it one.
      const body = bodyRef.current;
      if (body) {
        const row = body.querySelector('.code-row');
        const to = codeScroll(e.key, {
          row: row ? Math.round(row.getBoundingClientRect().height) : 19,
          view: body.clientHeight,
          top: body.scrollTop,
          max: body.scrollHeight - body.clientHeight,
        }, { meta: e.metaKey });
        if (to != null) { e.preventDefault(); body.scrollTop = to; return; }
      }

      if (e.metaKey) return;
      // J AND K ARE GONE FROM HERE, and nothing takes their place.
      //
      // They are still owned by the change (CHANGE_OWNS in code-keys.ts) so the
      // app below stands down for them, and code-keys.ts says why: the app's J
      // means "next task", so handing the key back would turn a stray press
      // into the change closing and another card coming up — round two's fault
      // wearing the costume of a removal. Owned and inert is the honest end of
      // a feature that was removed.
      //
      // Two meanings on one key is the fault renderer/src/keys.ts was written
      // about, and this one cost the user the meaning used all day.
      //
      // MEASURED 2026-08-24, with a change open and her keyboard on the
      // message: E opened the file and the card was NOT archived. Not merely
      // both-at-once — the archive never ran at all. Both handlers are window
      // listeners; this one fired first, and the app's own never fired for E,
      // though it fired for every other letter in the same state a moment
      // earlier. So the card silently stayed in her inbox.
      //
      // NOTHING IS LOST BY DELETING IT. The pane already draws the control that
      // does this, on the file this line would have opened: openOutside in
      // DocPane.tsx, on the icon settled on 2026-08-23, pointed at the same
      // `fileAt` this component reports up. The key was a second door onto a
      // door she already has.
    };
    // THE SAME REFUSAL, ONE LAYER DOWN, because a keystroke is not the only
    // way text arrives. A paste, a drop and the dictation she uses all reach
    // the line through beforeinput without a key ever being pressed, and each
    // of them would land in the first line of the block and leave the rest.
    // Two listeners rather than one rule in two shapes: keydown is where the
    // key can still be refused before the browser acts on it, and this is the
    // net under everything that never was a key.
    const onInput = (e: Event) => {
      const type = (e as InputEvent).inputType ?? '';
      if (!inputChangesText(type)) return;
      if (selectedLineCount() > 1) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeinput', onInput, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeinput', onInput, true);
    };
  }, [fileRows, files, current?.path, at, saveAll, settle]);

  /*
   * ------------- SELECTING SOME OF THE CHANGE, AND COPYING IT ---------------
     Two faults, one gesture, both measured on the real pane 2026-08-27 and both
     in code-copy.ts in full. Dragging down seven lines selected ONE, because a
     browser will not let a mouse selection leave the editing host it started in
     and every line here is its own. And what did reach the clipboard carried the
     diff's gutter: a bare "+" on a line of its own between every pair of code
     lines, which `user-select: none` does not stop.

     So the drag is taken over the moment it leaves the line it started in, and
     the copy is built rather than left to the browser. Both are narrow on
     purpose. Inside one line nothing here runs at all: an ordinary drag, a
     double click on a word and a click into the middle of a line are the
     browser's, they were already right, and they stay its business. ------- */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // `line` is the line the press landed IN, and is null when it landed in the
    // margin beside one. That difference is the whole of when to take over:
    // from inside a line, only once the drag crosses out of it; from the
    // margin, at once, because there was never a line to stay in.
    let anchor: { node: Node; offset: number; line: HTMLElement | null } | null = null;
    let took = false;

    const caretAt = (x: number, y: number) => {
      const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
      return doc.caretRangeFromPoint ? doc.caretRangeFromPoint(x, y) : null;
    };

    const onDown = (e: MouseEvent) => {
      anchor = null;
      took = false;
      // A second or third click is the browser selecting a word or a line, and
      // it does that correctly. Only a fresh press starts a drag we might take.
      if (e.button !== 0 || e.detail > 1) return;
      const el = e.target as HTMLElement | null;
      const line = el?.closest?.('.code-line') as HTMLElement | null;

      // ── SHIFT AND CLICK, WHICH IS THE OTHER WAY A HAND TAKES A BLOCK ──────
      // Measured 2026-08-27 (round four): clicking line one and shift-clicking
      // line seven selected ONE line. Round three took over the DRAG and left
      // this alone, and it fails for the same reason — the browser will not
      // grow a selection out of the editing host its anchor sits in. Extending
      // from the click before it is the whole fix, and it is the same
      // setBaseAndExtent the drag and the keyboard use.
      if (e.shiftKey && clickAnchor.current && line) {
        const r = caretAt(e.clientX, e.clientY);
        const from = clickAnchor.current;
        if (r && from.line !== line) {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur?.();
          const a = pointAt(from.line, from.col);
          window.getSelection()?.setBaseAndExtent(a.node, a.offset, r.startContainer, r.startOffset);
          keySel.current = null;
          return;
        }
      }

      if (line) {
        const r = caretAt(e.clientX, e.clientY);
        if (r) anchor = { node: r.startContainer, offset: r.startOffset, line };
        // Remembered for a shifted click, and for nothing else. It is where
        // this press landed, in characters, so it survives the blur that a
        // crossing selection does to the line.
        clickAnchor.current = { line, col: r ? offsetIn(line, r.startContainer, r.startOffset) : 0 };
        keySel.current = null;
        return;
      }
      clickAnchor.current = null;
      keySel.current = null;
      // PRESSED IN THE MARGIN, on the `+` or `−` beside a line. That is not a
      // miss: it is where a hand goes to take a whole block, and it selected
      // one line too (measured on the real pane, 2026-08-27, before and after
      // the drag was taken over for the text). Grabbing the margin means the
      // whole of that line, so the drag starts at its front.
      const row = el?.closest?.('.code-row') as HTMLElement | null;
      const first = row?.querySelector('.code-line') as HTMLElement | null;
      if (first) {
        anchor = { node: first, offset: 0, line: null };
        clickAnchor.current = { line: first, col: 0 };
      }
    };

    const onMove = (e: MouseEvent) => {
      if (!anchor || !(e.buttons & 1)) return;
      const under = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.('.code-line') as HTMLElement | null;
      if (!under || under === anchor.line) return;
      const r = caretAt(e.clientX, e.clientY);
      const sel = window.getSelection();
      if (!r || !sel) return;
      // THE FIRST TIME IT CROSSES OUT OF THE LINE, hand the keyboard back. The
      // line she started in is an editing host and it still has focus, so a
      // keystroke would land inside it while seven lines are selected.
      if (!took) { took = true; (document.activeElement as HTMLElement | null)?.blur?.(); }
      sel.setBaseAndExtent(anchor.node, anchor.offset, r.startContainer, r.startOffset);
      e.preventDefault();
    };

    const onUp = () => { anchor = null; };

    const onCopy = (e: ClipboardEvent) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      // ONE ROW IS THE BROWSER'S. It has no gutter in it and no header, so
      // there is nothing here to improve and every reason not to interfere.
      // The count is of every row touched, removed ones too: see linesToCopy.
      const touched = allLines().filter((el) => range.intersectsNode(el));
      const plan = linesToCopy(touched.map((el) => !!el.closest('.code-row')?.classList.contains('cr-minus')));
      if (!plan) return;
      const lines = plan.map((i) => touched[i]);
      const first = lines[0];
      const last = lines[lines.length - 1];
      const texts = lines.map((el) => el.textContent ?? '');
      let from = first.contains(range.startContainer) ? offsetIn(first, range.startContainer, range.startOffset) : 0;
      let to = last.contains(range.endContainer) ? offsetIn(last, range.endContainer, range.endOffset) : texts[texts.length - 1].length;
      // A range that stops exactly at the head of a line still counts that line
      // as touched, and pasting a blank line she did not select is a small lie.
      if (texts.length > 1 && to === 0) { texts.pop(); to = texts[texts.length - 1].length; }
      if (texts.length > 1 && from >= texts[0].length) { texts.shift(); from = 0; }
      e.clipboardData?.setData('text/plain', copiedText(texts, from, to));
      e.preventDefault();
    };

    body.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('copy', onCopy, true);
    return () => {
      body.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('copy', onCopy, true);
    };
  }, []);

  useEffect(() => { onFileAt(current?.path ?? null); }, [current?.path]);

  // WHERE IT OPENS, WHEN SHE ARRIVED BY PRESSING A FILE. The tree is built
  // before this runs, so the file she named is found in the same list J and K
  // walk and simply becomes the one she is standing on; the scroll below then
  // brings it to the top the way it does for any other move. A file that is not
  // in the change leaves her at the top, which is where the change opens
  // anyway — but nothing should ever send one, because the chip is only drawn
  // when the change holds the file (fileInChange, shared/work-lines.mjs).
  useEffect(() => {
    if (startAt) goTo(startAt);
  }, [startAt, startAtFrom, files]);

  // The file she walked to comes to the top of the running column — UNLESS the
  // tree only moved because she scrolled there herself, in which case pulling
  // the column to the head of that file would yank the screen out from under
  // her hand. `fromScroll` is which of the two happened.
  useEffect(() => {
    if (!current) return;
    const cameFromScroll = fromScroll.current;
    if (cameFromScroll) fromScroll.current = false;
    if (!cameFromScroll) {
      // NOTHING OUTSIDE THE RUNNING COLUMN MOVES. This was `scrollIntoView`,
      // which walks EVERY scrollable ancestor it can find and scrolls each one,
      // so walking the files was also dragging the card behind the pane up and
      // down. Setting one scrollTop moves one thing.
      //
      // The measurement is taken off the file's BLOCK and not its header,
      // because the header is `position: sticky`: once the column has scrolled
      // at all, the header's own rectangle is pinned to the top of the pane and
      // reads as already-where-it-should-be, so the distance comes out zero.
      //
      // AND IT KEEPS PUTTING IT THERE UNTIL THE COLUMN STOPS MOVING, which is
      // the fix of 2026-09-20.
      //
      // REPRODUCED before it was touched, on a real seventeen-file change:
      // clicking main.mjs left the tree correctly marking main.mjs while
      // working-from-your-phone.html was the file actually at the top of the
      // screen. One jump in four landed on the wrong file.
      //
      // The cause is `content-visibility: auto` on every hunk. A hunk nobody has
      // looked at stands at a guessed height, so the distance measured here is
      // measured against a column that is about to change length: the scroll
      // lands, the browser then draws what it just brought near the window, the
      // real heights replace the guesses, and everything below slides. One
      // setScrollTop cannot survive that, and nothing was re-asserting it.
      //
      // So it asks again on each of the next frames until the file's block has
      // sat at the top for three in a row, and gives up after twenty so a column
      // that genuinely cannot settle does not spin.
      const body = bodyRef.current;
      const want = current.path;
      if (body && heads.current.get(want)) {
        holding.current = want;
        let frames = 0;
        let still = 0;
        const put = () => {
          const block = heads.current.get(want)?.parentElement;
          if (!body || !block || holding.current !== want) { holding.current = null; return; }
          const delta = block.getBoundingClientRect().top - body.getBoundingClientRect().top;
          if (Math.abs(delta) <= 1) still += 1;
          else {
            still = 0;
            const max = Math.max(0, body.scrollHeight - body.clientHeight);
            body.scrollTop = Math.max(0, Math.min(max, body.scrollTop + delta));
          }
          if (still >= 3 || (frames += 1) > 20) { holding.current = null; return; }
          requestAnimationFrame(put);
        };
        requestAnimationFrame(put);
      }
    }
    // AND THE ROW SHE IS STANDING ON STAYS ON SCREEN IN THE TREE. Eighteen files
    // and their folders are taller than the tree, so from about the eighth file
    // down the only mark saying where she was had scrolled out of sight, and
    // walking read as the code moving for no reason. This runs whether she got
    // there by key or by scrolling, because the question it answers — where am
    // I — is the same one either way.
    const tree = treeRef.current;
    const row = treeRowRefs.current.get(current.path);
    if (tree && row) {
      const r = row.getBoundingClientRect();
      const t = tree.getBoundingClientRect();
      if (r.top < t.top) tree.scrollTop += r.top - t.top;
      else if (r.bottom > t.bottom) tree.scrollTop += r.bottom - t.bottom;
    }
  }, [current?.path, jump]);

  // THE TREE FOLLOWS HER EYE, and before this it simply did not. Measured on
  // the real pane: scrolled 12,240px down into renderer/src/fixtures.ts, the
  // tree still highlighted the FIRST file of the change. That is not only a
  // wrong highlight.
  //
  // AND IT NO LONGER MEASURES THE WHOLE CHANGE ONCE A FRAME TO DO IT. This
  // asked every file header in the change where it was, on every animation
  // frame of every scroll: eighteen getBoundingClientRect calls a frame, each
  // one a forced layout on a column of 33,539 elements. In the sampling
  // profiler on a real 2,562-row change, `getBoundingClientRect` was the
  // single largest named cost of a scroll.
  //
  // Where a file starts only changes when the column changes SHAPE, which is
  // not something scrolling does. So it is measured once and held, and taken
  // again only when the column's own length moves under it; the scroll handler
  // below says why that is the whole of the staleness.
  //
  // THE MEASUREMENT IS TAKEN OFF THE BLOCK AND NOT THE HEADER, for the reason
  // the effect above already gives: the header is `position: sticky`, so once
  // its file is crossing the top of the pane its own rectangle reads as pinned
  // there rather than where the file begins. Off the block the number is the
  // same whatever the scroll position, which is what makes it safe to hold.
  const offsets = useRef<number[]>([]);
  const measureFiles = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const top = body.getBoundingClientRect().top;
    offsets.current = files.map((f) => {
      const block = heads.current.get(f.path)?.parentElement;
      return block ? block.getBoundingClientRect().top - top + body.scrollTop : Number.POSITIVE_INFINITY;
    });
  }, [files]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let frame = 0;
    let tall = -1;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // THE ONE CASE THE HELD NUMBERS GO STALE, and it is a real one rather
        // than a defensive one: a hunk the browser was skipping stands at a
        // guessed height until it is drawn, so files below it move. Every such
        // correction changes the length of the column, so asking the column how
        // long it is catches all of them. It is one read rather than eighteen,
        // and it is a number the browser has already worked out to be able to
        // scroll at all. A ResizeObserver was tried here first and cost more
        // layout than it saved, because each of its callbacks forces its own.
        if (body.scrollHeight !== tall) { tall = body.scrollHeight; measureFiles(); }
        // A JUMP SHE ASKED FOR IS NOT A SCROLL SHE MADE. While the effect above
        // is still putting a chosen file at the top, every frame of that lands
        // here as a scroll event, and repointing `at` off it is what took her to
        // a file she had not picked. The jump says where she is; this stands
        // down until it lands.
        if (holding.current) return;
        const n = fileOnScreen(offsets.current, body.scrollTop);
        setAt((was) => {
          if (was === n) return was;
          fromScroll.current = true;
          return n;
        });
      });
    };
    // HER OWN HAND CANCELS THE JUMP AT ONCE, so she is never held anywhere. A
    // wheel, a trackpad, a drag on the bar or an arrow key all mean she has
    // taken over, and the file she was being carried to stops mattering
    // mid-flight rather than fighting her for the next few frames.
    const release = () => { holding.current = null; };
    body.addEventListener('scroll', onScroll, { passive: true });
    body.addEventListener('wheel', release, { passive: true });
    body.addEventListener('touchstart', release, { passive: true });
    body.addEventListener('mousedown', release);
    window.addEventListener('keydown', release);
    return () => {
      body.removeEventListener('scroll', onScroll);
      body.removeEventListener('wheel', release);
      body.removeEventListener('touchstart', release);
      body.removeEventListener('mousedown', release);
      window.removeEventListener('keydown', release);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [files, measureFiles]);

  const took = tookLabel(change);
  // Recomputed off the ref every time the dirty stamp moves, which is on blur
  // and after a save. A dot beside a file is the whole of the unsaved state:
  // these rows carry no controls by design and this is not one.
  const unsaved = useMemo(() => new Set(dirtyFiles()), [dirtyAt, saving]);

  return (
    <div className="code-artifact">
      {/* THE FILE PICKER, WHICH STANDS IN FOR THE TREE WHEN THE PANE IS NARROW.
          w-481e93b9eb: the chevron sat in the wrong place, and the cause is that
          the chevron was not ours. The select
          was left at `appearance: auto`, so Chromium drew its own arrow to its own
          metrics: a heavy filled glyph, jammed about 9px from the border and
          sitting a couple of points below the middle, while every other chevron in
          this app is the 13px, 1.5 stroke one `.code-caret` draws in the file tree.

          So the box is ours now and the mark inside it is the SAME path the tree
          uses, laid on the one number the control already has: the picker is inset
          12px from the code column on both sides, so the chevron is inset 12px from
          the picker. It is `aria-hidden` and takes no pointer, because the select
          underneath it is still the whole control. */}
      <div className="code-file-pick">
        <select className="code-file-picker" aria-label="File to review" value={current?.path ?? files[0]?.path ?? ''} onChange={e => goTo(e.target.value)}>{files.map(file => <option key={file.path} value={file.path}>{file.path}{unsaved.has(file.path) ? ' · Unsaved' : ''}</option>)}</select>
        <svg className="code-pick-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </div>
      <div className="code-tree">
        <div className="code-tree-head">
          <span className="code-tree-count">{changeSummary(change)}</span>
          {took && <span className="code-tree-took">in {took}</span>}
        </div>
        <div className="code-tree-rows" ref={treeRef}>
          {shown.map((row) => (row.kind === 'folder' ? (
            <button
              type="button"
              key={row.key}
              className={`code-node code-folder${shut.has(row.key) ? ' is-shut' : ''}`}
              style={{ paddingLeft: 12 + row.depth * 13 }}
              onClick={() => {
                const next = new Set(shut);
                if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
                // FOLDING MOVES NOTHING BUT THE TREE. `at` indexes every file of
                // the change, which folding does not touch, so she stays on the
                // file she was reading whether the folder is hers or not. It
                // used to index the drawn rows, and folding her own folder
                // threw the code from 2,739 to 20,787 (2026-10-04).
                setShut(next);
              }}
            >
              <svg className="code-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
              <span className="code-node-name">{row.label}</span>
              <span className="code-node-n">{row.files}</span>
            </button>
          ) : (
            <button
              type="button"
              key={row.key}
              ref={(el) => { treeRowRefs.current.set(row.path, el); }}
              className={`code-node code-file${current?.path === row.path ? ' is-at' : ''}`}
              style={{ paddingLeft: 12 + row.depth * 13 }}
              title={row.path}
              // Pressing a file is her ASKING to be taken there, so the column
              // does move to it — the opposite of the scroll case above.
              onClick={() => goTo(row.path)}
            >
              <span className="code-node-name">{row.label}</span>
              {unsaved.has(row.path)
                ? <span className="code-unsaved" title="Not saved yet. Press ⌘S.">•</span>
                : <Counts plus={row.plus} minus={row.minus} />}
            </button>
          )))}
        </div>
        {/* THE KEYS THEMSELVES ARE A SHORTER LIST NOW. The text came off,
            and then the keys it advertised, because J and K should not walk
            between files and the pane only needs to work at a basic level, so
            what is left is the arrows, ⌘S and esc — nothing that has to be
            read off a strip to be found. What was here was four lines of
            chrome on the surface
            she opens to read code, and one of them was a lie: E was unbound
            on 2026-08-24 (w-671391746a, it was stealing archive) and the
            legend went on advertising it for two days.

            NOTHING REPLACES IT. Do not put these back as a hover, a menu or a
            "?" — the strip is not the discoverability problem. Getting INTO
            this pane is, and that is the open question on w-c1d09f0638.
         */}
      </div>

      <div className="code-body" ref={bodyRef}>
        {files.map((file: ChangedFile, fileIndex: number) => (
          <section className="code-file-block" key={file.path}>
            <div
              className={`code-file-head${current?.path === file.path ? ' is-at' : ''}`}
              ref={(el) => { heads.current.set(file.path, el); }}
            >
              <span className="code-file-name">{file.path.split('/').pop()}</span>
              <span className="code-file-where">{file.path.split('/').slice(0, -1).join('/')}</span>
              <Counts plus={file.plus} minus={file.minus} />
              {/* It carries the word and not only a dot, because a dot alone goes
                 unnoticed. It is drawn only while that file has something unsaved, so
                 the approved row is unchanged the rest of the time.
               */}
              {unsaved.has(file.path) && (
                <span className="code-file-unsaved" title="Not saved yet. Press ⌘S.">Unsaved</span>
              )}
              {/* NOTHING ELSE ON THIS ROW. Both of the things that were here were
                 removed on purpose.
               */}
            </div>
            {/* THE AGENT'S OWN SENTENCE IS NOT DRAWN OVER THE CHANGE, on purpose.
               Do not put it back.
             */}
            {drawn.has(fileIndex) ? (
              <FileHunks
                file={file}
                pending={seeded.current.get(file.path) ?? null}
                onEdit={noteEdit}
                onDone={settle}
              />
            ) : (
              <div className="code-unfilled" style={{ height: sliceGuessPx(file.hunks.reduce((n, h) => n + h.rows.length, 0)) }} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
