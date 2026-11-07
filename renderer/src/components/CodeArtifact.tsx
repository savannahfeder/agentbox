// The change an agent made, drawn as a file in the document pane beside
// markdown and html. Everything around it (crumb, way out, divider, split)
// belongs to the pane. The scope matches what Cursor, the Codex app and the
// Claude Code desktop app offer, and goes no further: no side-by-side columns
// and no commands at the diff.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { chord } from '../this-keyboard';
import {
  BATCH_ROWS, changeSummary, filesInTreeOrder, fillNext, foldsFor, firstBatch, hiddenLines, hunkView, hunkViewAt, linesSkipped, marked, rowSlices, sliceGuessPx, standingLabel, stepInTree, toggled, tokenize, tookLabel, treeRows, visibleRows, wordChanges,
  type Change, type ChangedFile, type Hunk,
} from '../code-artifact';
import { copiedText, linesToCopy } from '../code-copy';
import { applySplices, savedLine, unsavedIn, type Row as EditRow } from '../code-edit';
import { caretStep, codeScroll, editsAcrossLines, extendHead, extendsSelection, fileOnScreen, inputChangesText, nextChange, type Head } from '../code-keys';

// A line is a span of coloured spans, so the DOM gives the caret as a text node
// and an offset, not a column. The helpers below convert between the two. The
// rules for the arrow keys are in code-keys.ts, where they can be tested.

/** Every editable line of the change, in the order drawn. */
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
  // `nearest` scrolls only when the line is off the edge, so walking down the
  // middle of a screenful does not jump.
  el.scrollIntoView({ block: 'nearest' });
}

// Unsaved edits, one map per change, held outside every component so closing
// the pane keeps them. They last as long as the app runs and never touch disk.
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
 * How many drawn lines the selection touches, removed lines included. Two or
 * more is a selection an edit cannot serve, because the browser's delete and
 * insert stop at the end of one contentEditable (see `editsAcrossLines` in
 * code-keys.ts).
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

/** The syntax colours, drawn as classes so the stylesheet owns every value. An
 * uncoloured token is bare text, one element fewer per word on a big change. */
function Code({ line, span }: { line: string; span?: [number, number] | null }) {
  // Words that changed against the paired line get one more wrapper over their
  // colour (`wordChanges` in code-artifact.ts).
  const toks = useMemo(() => marked(tokenize(line), span ?? null), [line, span?.[0], span?.[1]]);
  return (
    <>{toks.map((t, i) => (t.hl
      ? <span key={i} className={t.c ? `w-chg t-${t.c}` : 'w-chg'}>{t.s}</span>
      : t.c ? <span key={i} className={`t-${t.c}`}>{t.s}</span> : t.s))}</>
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

// One line of the change. The memo is needed for correctness, not speed: an
// edited line is a contentEditable whose text lives in the DOM, and if React
// reconciled its children it would put the original line back over the
// keystrokes. A removed line is not editable because it has no place on disk.
const CodeLine = memo(function CodeLine({ mark, line, span, num, editable, onEdit, onDone }: {
  mark: string;
  line: string;
  // The changed words against its paired line, or null.
  span?: [number, number] | null;
  // The line number in the file, or null when the change came from the
  // conversation and the number is unknown. Null draws an empty gutter.
  num: number | null;
  editable: boolean;
  onEdit: (text: string) => void;
  onDone: () => void;
}) {
  return (
    <div className={`code-row${mark === '+' ? ' cr-plus' : mark === '-' ? ' cr-minus' : ''}${editable ? ' cr-live' : ''}`}>
      {/* The number stays outside `.code-line`, like `.code-mark`. The
          clipboard (code-copy.ts), a save (code-edit.ts) and the arrow keys all
          read the text of `.code-line`, and a number inside it would be pasted
          and counted as columns. */}
      <span className="code-num" aria-hidden="true">{num ?? ''}</span>
      <span className="code-mark" aria-hidden="true">{mark === '=' ? '' : mark === '+' ? '+' : '−'}</span>
      <span
        className="code-line"
        contentEditable={editable || undefined}
        suppressContentEditableWarning={editable}
        spellCheck={false}
        onInput={editable ? (e) => onEdit(e.currentTarget.textContent ?? '') : undefined}
        onBlur={editable ? onDone : undefined}
        // A row is one line of the file, so Enter is refused: inside a
        // contentEditable it would put a second line in the row. Escape blurs
        // the line, which saves it (onBlur is onDone) and hands the keyboard
        // back, because the app's own key guard ignores keys typed into a
        // contentEditable. The next Escape closes the change.
        onKeyDown={editable ? (e) => {
          if (e.key === 'Enter') e.preventDefault();
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); }
        } : undefined}
        onPaste={editable ? (e) => {
          // For the same reason, paste arrives as plain text with its newlines
          // flattened.
          e.preventDefault();
          const flat = e.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ');
          document.execCommand('insertText', false, flat);
        } : undefined}
      >
        <Code line={line} span={span} />
      </span>
    </div>
  );
}, (a, b) => a.mark === b.mark && a.line === b.line && a.num === b.num && a.editable === b.editable
  && a.span?.[0] === b.span?.[0] && a.span?.[1] === b.span?.[1]);
// The two callbacks are left out of the comparison on purpose. They are fresh
// closures on every parent render, and what they close over (the row's index
// and the parent's handler) is stable for the life of one row.

function HunkRows({ hunk, editable, pending, onEdit, onDone }: {
  hunk: Hunk;
  editable: boolean;
  // Unsaved text in this hunk, by row. Usually null.
  pending?: Map<number, string> | null;
  // (row index inside the hunk, the line as it now reads)
  onEdit: (at: number, text: string) => void;
  onDone: () => void;
}) {
  const { rows } = useMemo(() => hunkView(hunk.rows), [hunk.rows]);
  const at = useMemo(() => hunkViewAt(hunk.rows), [hunk.rows]);
  const words = useMemo(() => wordChanges(hunk.rows), [hunk.rows]);
  const draw = (mark: string, text: string, i: number) => {
    // Unsaved text wins over the file's, so reopening the change shows it.
    const line = (mark === '-' ? undefined : pending?.get(at[i])) ?? text;
    // An edited line is no longer the line the span was found in.
    const span = line === text ? words[at[i]] : null;
    // A removed line is numbered in the old file, everything else in the new
    // one, as in every diff tool.
    const pair = hunk.nums?.[at[i]];
    const num = (mark === '-' ? pair?.[0] : pair?.[1]) ?? null;
    return (
      <CodeLine
        key={`${at[i]}:${text}`}
        mark={mark}
        line={line}
        span={span}
        num={num}
        editable={editable && mark !== '-'}
        onEdit={(next) => onEdit(at[i], next)}
        onDone={onDone}
      />
    );
  };
  // The stylesheet sets `content-visibility: auto` per slice, so a long hunk is
  // laid out a slice at a time; the guess is a skipped slice's height
  // (`rowSlices` in code-artifact.ts).
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

type Gap = { from: number; lines: string[] };

// One file's hunks, behind a memo so that scrolling, which moves `at` and
// re-renders CodeArtifact, does not rebuild every row. Every prop is stable on
// purpose: `file` comes from a useMemo, `pending` from a ref, and the handlers
// are useCallbacks with no dependencies. A fresh closure in any of them breaks
// the memo.

const FileHunks = memo(function FileHunks({ file, pending, onEdit, onDone, readFile, onNotice, gaps }: {
  // Gaps opened in this file, held by the pane so folding the file does not
  // close them. The same Map for the life of the pane.
  gaps: Map<number, Gap>;
  file: ChangedFile;
  // Unsaved text in this file, by hunk. Usually null.
  pending?: Map<number, Map<number, string>> | null;
  onEdit: (file: string, hunk: number, row: number, text: string) => void;
  onDone: () => void;
  // Reads the file as it is on disk now, to open a gap.
  readFile: (path: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  onNotice: (text: string) => void;
}) {
  // Opened gaps, by the index of the hunk below each one.
  const [opened, setOpened] = useState<Map<number, Gap>>(() => new Map(gaps));
  const openGap = async (i: number) => {
    const read = await readFile(file.path);
    if (!read.ok || typeof read.text !== 'string') { onNotice(read.error ?? `${file.path} could not be read.`); return; }
    const r = hiddenLines(read.text, file.hunks[i - 1], file.hunks[i]);
    if (!r.ok) { onNotice(r.error); return; }
    gaps.set(i, { from: r.from, lines: r.lines });
    setOpened(new Map(gaps));
  };
  return (
    <>
      {file.hunks.map((hunk, i) => (
        <div className="code-hunk-block" key={i}>
          {/* The skipped lines between two hunks, drawn only when git gave line
             numbers. Opened lines are read only, because the agent did not
             change them. */}
          {i > 0 && opened.has(i) ? (
            <div className="code-gap-lines">
              {opened.get(i)!.lines.map((text, k) => (
                <CodeLine key={k} mark="=" line={text} num={opened.get(i)!.from + k} editable={false} onEdit={() => {}} onDone={() => {}} />
              ))}
            </div>
          ) : i > 0 && linesSkipped(file.hunks[i - 1], hunk) !== null && (
            <button type="button" className="code-skip" title="Show these lines" onClick={() => { void openGap(i); }}>
              <span>{linesSkipped(file.hunks[i - 1], hunk)} lines not shown</span>
            </button>
          )}
          <HunkRows
            hunk={hunk}
            editable
            // Only text kept from an earlier opening. Handing a live
            // contentEditable its own keystrokes moves the caret to the front
            // of the word.
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
  // The change artifact's own path, which a save hands main to find the file.
  src: string;
  change: Change;
  // The file to open at, set by a file chip in the conversation. Null opens at
  // the top.
  startAt?: string | null;
  // When the chip was pressed, so pressing the same chip twice lands twice.
  startAtFrom?: number;
  // The current file, for the mark in the pane's header that opens it.
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
  // Whether the tree last moved because of a scroll or a key. The
  // scroll-to-the-top effect below stands down for a scroll.
  const fromScroll = useRef(false);
  // The file a jump is heading to while the column settles. While it is set,
  // the scroll handler leaves `at` alone until the jump lands or the user
  // scrolls.
  const holding = useRef<string | null>(null);
  // A keyboard selection, as two points in the drawn lines. It is carried here
  // because once a selection leaves its starting line the editing host blurs
  // and the browser has no caret to grow from.
  const keySel = useRef<{ anchor: Head; head: Head } | null>(null);
  // Where the last plain click landed, for a shift-click to extend from. The
  // browser keeps this inside one editing host and loses it between two.
  const clickAnchor = useRef<{ line: HTMLElement; col: number } | null>(null);

  // `at` indexes `files`, not the visible tree, so folding a folder never
  // changes which file it names.
  const current = files[Math.min(at, Math.max(0, files.length - 1))];
  // Bumped on every press so a press on the current file still jumps.
  const [jump, setJump] = useState(0);
  const seenJump = useRef(0);
  // Files folded shut from their header
  // (tests/a-file-folds-shut-from-its-header.test.mjs). Folding the file in
  // view keeps its header where it was.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set(foldsFor(product, src)));
  const foldFile = (path: string, block: HTMLElement | null) => {
    const body = bodyRef.current;
    const above = body && block ? block.getBoundingClientRect().top - body.getBoundingClientRect().top : 0;
    // A file opening again is drawn from the current edits, not the snapshot
    // taken when the pane opened, or it would show old words that ⌘S would not
    // save.
    if (folded.has(path)) {
      const now = edits.current.get(path);
      seeded.current.set(path, new Map([...(now ?? new Map())].map(([h, m]) => [h, new Map(m)])));
    }
    const remembered = foldsFor(product, src);
    if (remembered.has(path)) remembered.delete(path); else remembered.add(path);
    setFolded((was) => toggled(was, path));
    if (body && block && above < 0) {
      requestAnimationFrame(() => {
        body.scrollTop += block.getBoundingClientRect().top - body.getBoundingClientRect().top;
      });
    }
  };
  const goTo = (path: string) => {
    const i = files.findIndex((f) => f.path === path);
    if (i < 0) return;
    fromScroll.current = false;
    setAt(i);
    setJump((n) => n + 1);
  };

  // Which files have their code drawn. A big change opens on its first
  // screenful and draws the rest in idle moments (`firstBatch` in
  // code-artifact.ts). Every file's header is drawn from the start, so the
  // tree, the jumps and the sticky names work meanwhile.
  const [drawn, setDrawn] = useState<ReadonlySet<number>>(() => {
    const at0 = Math.max(0, files.findIndex((f) => f.path === startAt));
    return new Set(Array.from({ length: firstBatch(files, 0) }, (_, i) => i).concat(at0));
  });
  const hereIndex = at;
  useEffect(() => {
    if (drawn.size >= files.length) return;
    // Nearest first. The current file is urgent; the rest waits for idle,
    // because a batch forced in mid-scroll drops a frame. Never draw
    // everything above a far file in one go: that stalls a fast scroll.
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

  // Keystrokes live in a ref, not in state, because the text is already in the
  // contentEditable and a re-render would rewrite the line under the caret. The
  // ref is the change's map in KEPT, so it outlives the pane. It is never
  // written to disk: after a restart the file may have moved on, and
  // applySplices would refuse the edit.
  const edits = useRef(keepFor(product, src));
  // What was waiting when the pane opened. Rows are drawn from this, never from
  // `edits` as it changes, for the reason above.
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
    // The unsaved mark shows on the first character. The stamp moves only when
    // the set of unsaved files changes, so it is one re-render per file, not
    // per keystroke.
    if (unsavedIn(edits.current).length !== was) setDirtyAt((n) => n + 1);
  }, []);

  const settle = useCallback(() => setDirtyAt((n) => n + 1), []);

  // Read through a ref so FileHunks gets a stable callback; the parent's
  // onNotice is a fresh closure on every render.
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;
  const notice = useCallback((text: string) => noticeRef.current(text), []);
  const readFile = useCallback((path: string) => api.codeFile({ product, src, path }), [product, src]);
  const gapStore = useRef(new Map<string, Map<number, Gap>>());
  const gapsFor = (path: string) => {
    let m = gapStore.current.get(path);
    if (!m) { m = new Map(); gapStore.current.set(path, m); }
    return m;
  };

  const dirtyFiles = () => unsavedIn(edits.current);

  /**
   * ⌘S. Saves every file with edits, one at a time, and reports each. A file is
   * written only if its lines are found exactly as the change left them, which
   * code-edit.ts decides.
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
        // The drawn rows take the saved text, so a second ⌘S does not try to
        // write onto lines that no longer match.
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

  // The keys this pane answers. What each key means is decided in code-keys.ts;
  // this only asks where the focus is and acts on the answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘S comes before the field guard below, because it is pressed from
      // inside a line being edited.
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        (e.target as HTMLElement)?.blur?.();
        void saveAll();
        return;
      }
      const el = e.target as HTMLElement | null;
      const tag = String(el?.tagName ?? '').toUpperCase();

      // Shifted arrows. Each line is its own editing host, so a native shifted
      // arrow cannot extend past it. The head is carried in `keySel` and applied
      // with setBaseAndExtent, which can cross hosts. A plain key or a fresh
      // mouse press ends the selection.
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
            // Once the selection leaves its line, blur that line, or the next
            // keystroke would land inside it while many lines are selected.
            if (to.line !== anchor.line) (document.activeElement as HTMLElement | null)?.blur?.();
            const a = pointAt(lines[anchor.line], anchor.col);
            const b = pointAt(lines[to.line], to.col);
            window.getSelection()?.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
            lines[to.line].scrollIntoView({ block: 'nearest' });
            return;
          }
        }
      }
      // An edit across lines is refused rather than half done; code-keys.ts
      // says why. The selection is left standing so ⌘C still copies it.
      if (selectedLineCount() > 1
        && editsAcrossLines(e.key, { meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey })) {
        e.preventDefault();
        return;
      }

      if (!e.shiftKey) keySel.current = null;

      // Moving the caret between lines. Each line is its own contentEditable,
      // so the browser has nowhere to move it.
      const line = el?.closest?.('.code-line') as HTMLElement | null;
      if (line && el?.isContentEditable) {
        const text = line.textContent ?? '';
        const step = caretStep(e.key, { col: caretColumn(line), len: text.length }, { shift: e.shiftKey, meta: e.metaKey });
        if (!step) return;
        const lines = editableLines();
        const here = lines.indexOf(line);
        const next = lines[here + step.move];
        // At the first or last editable line the caret stays put; it does not
        // wrap.
        if (here < 0 || !next) { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); return; }
        e.preventDefault();
        // Stamp the unsaved mark the way a blur would.
        settle();
        placeCaret(next, step.col === Infinity ? (next.textContent ?? '').length : step.col);
        return;
      }

      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if (e.ctrlKey || e.altKey) return;

      // ] and [ step to the next and previous change, landing just under the
      // file's sticky name. A file not drawn yet counts as one change, so ]
      // never skips it; a folded file has none.
      if ((e.key === ']' || e.key === '[') && !e.metaKey) {
        const body = bodyRef.current;
        if (body) {
          e.preventDefault();
          const top = body.getBoundingClientRect().top;
          const headH = (body.querySelector('.code-file-head') as HTMLElement | null)?.offsetHeight ?? 0;
          // The hunk's own rows, not its block: opened lines sit at the top of
          // the block, and aiming there landed ] on unchanged code.
          const starts = [...body.querySelectorAll<HTMLElement>('.code-hunk, .code-unfilled')]
            .map((b) => b.getBoundingClientRect().top - top + body.scrollTop - headH);
          const to = nextChange(starts, body.scrollTop, e.key === ']' ? 1 : -1);
          if (to != null) body.scrollTop = Math.max(0, to);
        }
        return;
      }

      // With focus in the file tree, the arrows walk the files.
      const onTree = !!el?.closest?.('.code-tree');
      if (onTree && !e.metaKey) {
        const to = stepInTree(e.key, current?.path ?? null, fileRows.map((r) => (r as { path: string }).path), files.map((f) => f.path));
        if (to != null) {
          e.preventDefault();
          goTo(to);
          return;
        }
      }

      // Otherwise the arrows scroll the code. `.code-body` is a plain div that
      // never takes focus, so the browser would not scroll it.
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
      // J and K do nothing here on purpose. CHANGE_OWNS in code-keys.ts still
      // claims them, so the app's own J does not fire under an open change.
    };
    // The same refusal for text that arrives without a key: paste, drop and
    // dictation all come through beforeinput.
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

  // Selecting across lines and copying. The browser will not let a mouse
  // selection leave the editing host it started in, and every line is its own
  // host. Its copy would also carry the diff's gutter, which `user-select: none`
  // does not stop. So a drag is taken over once it leaves its starting line, and
  // the copy is built here (code-copy.ts). Inside one line the browser handles
  // everything.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // `line` is null when the press landed in the margin. From inside a line the
    // drag is taken over once it crosses out; from the margin, at once.
    let anchor: { node: Node; offset: number; line: HTMLElement | null } | null = null;
    let took = false;

    const caretAt = (x: number, y: number) => {
      const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
      return doc.caretRangeFromPoint ? doc.caretRangeFromPoint(x, y) : null;
    };

    const onDown = (e: MouseEvent) => {
      anchor = null;
      took = false;
      // A double or triple click is the browser selecting a word or a line.
      if (e.button !== 0 || e.detail > 1) return;
      const el = e.target as HTMLElement | null;
      const line = el?.closest?.('.code-line') as HTMLElement | null;

      // Shift-click across lines, extended from the previous click for the same
      // reason as the drag.
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
        // Kept in characters for a later shift-click, so it survives the blur a
        // crossing selection causes.
        clickAnchor.current = { line, col: r ? offsetIn(line, r.startContainer, r.startOffset) : 0 };
        keySel.current = null;
        return;
      }
      clickAnchor.current = null;
      keySel.current = null;
      // A press in the margin, on the `+` or `−`, means the whole line, so the
      // drag starts at its front.
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
      // On the first crossing, blur the starting line, or a keystroke would land
      // inside it while many lines are selected.
      if (!took) { took = true; (document.activeElement as HTMLElement | null)?.blur?.(); }
      sel.setBaseAndExtent(anchor.node, anchor.offset, r.startContainer, r.startOffset);
      e.preventDefault();
    };

    const onUp = () => { anchor = null; };

    const onCopy = (e: ClipboardEvent) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      // A copy inside one row is left to the browser. Every row touched is
      // counted, removed ones too (see linesToCopy).
      const touched = allLines().filter((el) => range.intersectsNode(el));
      const plan = linesToCopy(touched.map((el) => !!el.closest('.code-row')?.classList.contains('cr-minus')));
      if (!plan) return;
      const lines = plan.map((i) => touched[i]);
      const first = lines[0];
      const last = lines[lines.length - 1];
      const texts = lines.map((el) => el.textContent ?? '');
      let from = first.contains(range.startContainer) ? offsetIn(first, range.startContainer, range.startOffset) : 0;
      let to = last.contains(range.endContainer) ? offsetIn(last, range.endContainer, range.endOffset) : texts[texts.length - 1].length;
      // A range that ends at the very start of a line, or starts at the very end
      // of one, still touches it; that line was not selected.
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

  // Opening at a file named by a chip. The chip is drawn only when the change
  // holds the file (fileInChange, shared/work-lines.mjs).
  useEffect(() => {
    if (startAt) goTo(startAt);
  }, [startAt, startAtFrom, files]);

  // A file the user walked to comes to the top of the column, unless the tree
  // moved because the user scrolled there, when pulling the column would yank
  // the screen.
  useEffect(() => {
    if (!current) return;
    // A jump is known by its own counter, because a scroll's state update
    // queued in the same render can set `fromScroll` again after goTo cleared
    // it.
    const asked = jump !== seenJump.current;
    seenJump.current = jump;
    const cameFromScroll = fromScroll.current && !asked;
    fromScroll.current = false;
    if (!cameFromScroll) {
      // Set one scrollTop rather than call scrollIntoView, which scrolls every
      // scrollable ancestor and dragged the card behind the pane. Measure the
      // file's block, not its header: the header is `position: sticky`, so its
      // rectangle reads as already at the top. Hunks use `content-visibility:
      // auto`, so real heights replace guessed ones after the scroll lands and
      // the file slides. Re-assert each frame until the block has sat at the
      // top for three frames, giving up after twenty.
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
    // Keep the current row visible in the tree, whether the user got there by
    // key or by scrolling.
    const tree = treeRef.current;
    const row = treeRowRefs.current.get(current.path);
    if (tree && row) {
      const r = row.getBoundingClientRect();
      const t = tree.getBoundingClientRect();
      if (r.top < t.top) tree.scrollTop += r.top - t.top;
      else if (r.bottom > t.bottom) tree.scrollTop += r.bottom - t.bottom;
    }
  }, [current?.path, jump]);

  // Where each file's block starts, so the tree can follow the scroll. Measured
  // once and held, because a getBoundingClientRect per file per frame forces
  // layout on every scroll. Taken off the block, not the sticky header, so the
  // number does not depend on the scroll position.
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
        // The held offsets go stale only when a skipped hunk is drawn at its
        // real height, and that always changes the column's length. A
        // ResizeObserver cost more layout than it saved.
        if (body.scrollHeight !== tall) { tall = body.scrollHeight; measureFiles(); }
        // While a jump is landing, its own scroll events must not repoint `at`.
        if (holding.current) return;
        const n = fileOnScreen(offsets.current, body.scrollTop);
        setAt((was) => {
          if (was === n) return was;
          fromScroll.current = true;
          return n;
        });
      });
    };
    // Any wheel, touch, press or key from the user cancels a jump at once.
    const release = () => { holding.current = null; };
    // Except the key that started the jump, which reaches this listener too.
    // A key the pane acted on is marked handled.
    const releaseKey = (e: KeyboardEvent) => { if (!e.defaultPrevented) holding.current = null; };
    body.addEventListener('scroll', onScroll, { passive: true });
    body.addEventListener('wheel', release, { passive: true });
    body.addEventListener('touchstart', release, { passive: true });
    body.addEventListener('mousedown', release);
    window.addEventListener('keydown', releaseKey);
    return () => {
      body.removeEventListener('scroll', onScroll);
      body.removeEventListener('wheel', release);
      body.removeEventListener('touchstart', release);
      body.removeEventListener('mousedown', release);
      window.removeEventListener('keydown', releaseKey);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [files, measureFiles]);

  const took = tookLabel(change);
  const stands = standingLabel(change);
  const unsaved = useMemo(() => new Set(dirtyFiles()), [dirtyAt, saving]);

  return (
    <div className="code-artifact">
      {/* The file picker stands in for the tree when the pane is narrow. The
          chevron is drawn here, not by Chromium, so it matches the tree's; the
          select underneath is still the whole control
          (tests/the-file-picker-draws-its-own-chevron.test.mjs). */}
      <div className="code-file-pick">
        <select className="code-file-picker" aria-label="File to review" value={current?.path ?? files[0]?.path ?? ''} onChange={e => goTo(e.target.value)}>{files.map(file => <option key={file.path} value={file.path}>{file.path}{unsaved.has(file.path) ? ' · Unsaved' : ''}</option>)}</select>
        <svg className="code-pick-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </div>
      <div className="code-tree">
        <div className="code-tree-head">
          <span className="code-tree-count">{changeSummary(change)}</span>
          {stands && <span className="code-tree-stands">{stands}</span>}
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
                // Folding moves only the tree, because `at` indexes `files`
                // (tests/folding-the-tree-never-moves-the-code.test.mjs).
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
              className={`code-node code-file${current?.path === row.path ? ' is-at' : ''}${folded.has(row.path) ? ' is-folded' : ''}`}
              style={{ paddingLeft: 12 + row.depth * 13 }}
              title={row.path}
              onClick={() => goTo(row.path)}
            >
              <span className="code-node-name">{row.label}</span>
              {unsaved.has(row.path)
                ? <span className="code-unsaved" title={`Not saved yet. Press ${chord('⌘S')}.`}>•</span>
                : <Counts plus={row.plus} minus={row.minus} />}
            </button>
          )))}
        </div>
        {/* No key legend, here or as a hover, menu or "?"
            (tests/the-code-pane-prints-no-key-legend.test.mjs). */}
      </div>

      <div className="code-body" ref={bodyRef}>
        {files.map((file: ChangedFile, fileIndex: number) => (
          <section className="code-file-block" key={file.path}>
            <div
              className={`code-file-head${current?.path === file.path ? ' is-at' : ''}${folded.has(file.path) ? ' is-folded' : ''}`}
              ref={(el) => { heads.current.set(file.path, el); }}
              title={folded.has(file.path) ? 'Show this file' : 'Fold this file'}
              onClick={(e) => foldFile(file.path, (e.currentTarget.parentElement as HTMLElement | null))}
            >
              <svg className="code-fold-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
              <span className="code-file-name">{file.path.split('/').pop()}</span>
              <span className="code-file-where">{file.path.split('/').slice(0, -1).join('/')}</span>
              <Counts plus={file.plus} minus={file.minus} />
              {/* The word, not only a dot, because a dot alone goes unnoticed. */}
              {unsaved.has(file.path) && (
                <span className="code-file-unsaved" title={`Not saved yet. Press ${chord('⌘S')}.`}>Unsaved</span>
              )}
              {/* Nothing else goes on this row. */}
            </div>
            {/* The agent's own sentence is not drawn over the change. */}
            {!folded.has(file.path) && (drawn.has(fileIndex) ? (
              <FileHunks
                file={file}
                pending={seeded.current.get(file.path) ?? null}
                onEdit={noteEdit}
                onDone={settle}
                readFile={readFile}
                onNotice={notice}
                gaps={gapsFor(file.path)}
              />
            ) : (
              <div className="code-unfilled" style={{ height: sliceGuessPx(file.hunks.reduce((n, h) => n + h.rows.length, 0)) }} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
