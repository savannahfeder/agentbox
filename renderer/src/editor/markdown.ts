/*
 * markdown.ts — markdown <-> ProseMirror JSON for the doc editor, ported from
   Crown's proven converter (lib/markdown.ts + exportDoc.ts) and extended for
   the shapes our docs actually use: headings, paragraphs (blank-line
   separated, single \n -> hardBreak), bullet/ordered lists (with nesting by
   indentation), task lists (- [ ] / - [x]), blockquotes (>), fenced code
   blocks, and inline bold/italic/strike/underline/code/links, including
   combinations (bold+italic, strike over bold, ...). Pure functions, no DOM —
   unit-testable.

   The invariant that matters: what the user sees is what lands on disk.
   Everything the editor can produce must serialize to markdown that parses
   back to the same document, or formatting silently mutates between visits. */

export function normalizeNewlines(md: string): string {
  return md.replace(/\r\n?/g, '\n');
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_ITEM_RE = /^(\s*)[-*](?:\s+(.*))?$/;
const ORDERED_ITEM_RE = /^(\s*)\d+\.\s+(.*)$/;
const TASK_TEXT_RE = /^\[( |x|X)\](?:\s+(.*))?$/;
const QUOTE_RE = /^>\s?(.*)$/;
const FENCE_RE = /^```(\w*)\s*$/;
const RULE_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/;
const TABLE_SEP_RE = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/;
// a line that is JUST an image: ![alt](src). A pasted or dropped image lands as
// its own block, which is the only image shape the doc editor produces.
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

// split a pipe row into cell strings, honoring escaped \| within a cell
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '\\' && inner[i + 1] === '|') { cur += '|'; i++; continue; }
    if (inner[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += inner[i];
  }
  cells.push(cur.trim());
  return cells;
}

type PmNode = Record<string, any>;

/*
 * ── inline: markdown text -> PM text nodes ──
   One alternation, leftmost match wins; delimited spans recurse so nested
   marks (bold inside strike, italic inside bold) come back as combined marks
   instead of literal ** and ~~ leaking into the text. Emphasis requires
   non-space flanking (so "2 * 3 * 4" stays plain) and _ requires word
   boundaries (so snake_case survives). Backslash escapes read as literals. */
const INLINE_RE = new RegExp(
  [
    /\\([\\`*_~[\]()#>|.!+-])/, //                          1: escape
    /`([^`]+?)`/, //                                        2: code (atomic)
    /<u>([\s\S]+?)<\/u>/, //                                3: underline
    /\[([^\]]+?)\]\(([^)\s]+?)\)/, //                       4,5: link
    /\*\*\*(?!\s)([^*]+?)(?<!\s)\*\*\*/, //                 6: bold+italic
    /\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*/, //                   7: bold
    /~~(?!\s)([^~]+?)(?<!\s)~~/, //                         8: strike
    /~(?!\s)([^~]+?)(?<!\s)~/, //                           9: strike (single ~, models write it)
    /\*(?!\s)([^*]+?)(?<!\s)\*/, //                         10: italic
    /(?<![A-Za-z0-9])_(?!\s)([^_]+?)(?<!\s)_(?![A-Za-z0-9])/, // 11: italic (_)
  ].map((r) => r.source).join('|'),
  'g',
);

const withMark = (nodes: PmNode[], mark: PmNode): PmNode[] =>
  nodes.map((n) => ({ ...n, marks: [...(n.marks || []), mark] }));

export function inlineToPm(text: string): PmNode[] {
  const out: PmNode[] = [];
  let buf = ''; // pending plain text (escapes unwrap into here)
  const flush = () => { if (buf) { out.push({ type: 'text', text: buf }); buf = ''; } };
  const re = new RegExp(INLINE_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    buf += text.slice(last, m.index);
    if (m[1] !== undefined) buf += m[1];
    else if (m[2] !== undefined) { flush(); out.push({ type: 'text', text: m[2], marks: [{ type: 'code' }] }); }
    else if (m[3] !== undefined) { flush(); out.push(...withMark(inlineToPm(m[3]), { type: 'underline' })); }
    else if (m[4] !== undefined) {
      const href = /^(https?:|mailto:|\/)/i.test(m[5]) ? m[5] : '#';
      flush(); out.push(...withMark(inlineToPm(m[4]), { type: 'link', attrs: { href } }));
    } else if (m[6] !== undefined) { flush(); out.push(...withMark(withMark(inlineToPm(m[6]), { type: 'bold' }), { type: 'italic' })); }
    else if (m[7] !== undefined) { flush(); out.push(...withMark(inlineToPm(m[7]), { type: 'bold' })); }
    else if (m[8] !== undefined || m[9] !== undefined) { flush(); out.push(...withMark(inlineToPm((m[8] ?? m[9]) as string), { type: 'strike' })); }
    else { flush(); out.push(...withMark(inlineToPm((m[10] ?? m[11]) as string), { type: 'italic' })); }
    last = re.lastIndex;
  }
  buf += text.slice(last);
  flush();
  return out;
}

/**
 * A PARAGRAPH'S LINES, OR A LIST ITEM'S, AS ONE RUN OF MARKUP.
 *
 * Parsed line by line, a mark that OPENS on one line and CLOSES on another is
 * never matched, and its asterisks stay on the screen as asterisks. That is not
 * a corner case in this store: a long bold bullet written across four lines is
 * how STATE.md is written, and 24 of its lines drew raw `**` in the pane before
 * this (measured 2026-08-21). Markdown itself reads those lines as one
 * paragraph, so this parses them as one and puts the line breaks back
 * afterwards.
 */
function inlineBlock(lines: string[]): PmNode[] {
  const out: PmNode[] = [];
  for (const n of inlineToPm(lines.join('\n'))) {
    if (n.type !== 'text' || !(n.text || '').includes('\n')) { out.push(n); continue; }
    (n.text as string).split('\n').forEach((part, i) => {
      if (i) out.push({ type: 'hardBreak' });
      if (part) out.push({ ...n, text: part });
    });
  }
  return out;
}

/* ── lists: indentation-aware block parsing ── */

type ListItemFlat = {
  indent: number;
  ordered: boolean;
  // The number actually written, for an ordered item. A list that starts at
  // three stays a list that starts at three.
  n?: number;
  checked?: boolean; // present -> task item
  text: string;
  extra: string[]; // continuation lines -> hardBreaks
};

function matchItem(line: string): ListItemFlat | null {
  const om = line.match(ORDERED_ITEM_RE);
  if (om) return { indent: om[1].length, ordered: true, n: Number.parseInt(om[0].trim(), 10) || 1, text: om[2].trim(), extra: [] };
  const bm = line.match(BULLET_ITEM_RE);
  if (!bm) return null;
  const rest = (bm[2] ?? '').trim();
  const tm = rest.match(TASK_TEXT_RE);
  if (tm) return { indent: bm[1].length, ordered: false, checked: tm[1].toLowerCase() === 'x', text: (tm[2] ?? '').trim(), extra: [] };
  return { indent: bm[1].length, ordered: false, text: rest, extra: [] };
}

// Collect one contiguous list block: item lines at any indent, blank lines
// between items (loose lists), and indented non-item lines as continuations
// of the item above them.
function collectListBlock(lines: string[], from: number, advance: (next: number) => void): ListItemFlat[] {
  const items: ListItemFlat[] = [];
  let i = from;
  while (i < lines.length) {
    const line = lines[i];
    const it = matchItem(line);
    if (it) { items.push(it); i++; continue; }
    if (line.trim() === '') {
      let j = i;
      while (j < lines.length && lines[j].trim() === '') j++;
      const next = j < lines.length ? lines[j] : '';
      if (j < lines.length && (matchItem(next) || (/^\s{2,}\S/.test(next) && items.length))) { i = j; continue; }
      break;
    }
    if (/^\s{2,}\S/.test(line) && items.length) { items[items.length - 1].extra.push(line.trim()); i++; continue; }
    break;
  }
  advance(i);
  return items;
}

// Flat items -> sibling list nodes, nesting children under the item above
// them when they sit at least two columns deeper.
function buildListTree(items: ListItemFlat[]): PmNode[] {
  let pos = 0;
  const level = (minIndent: number): PmNode[] => {
    const nodes: PmNode[] = [];
    let cur: PmNode | null = null;
    let curKind = '';
    const base = items[pos].indent;
    while (pos < items.length && items[pos].indent >= minIndent) {
      const it = items[pos];
      if (it.indent >= base + 2) {
        const children = level(base + 2);
        const lastItem = cur?.content[cur.content.length - 1];
        if (lastItem) lastItem.content.push(...children);
        else nodes.push(...children); // over-indented start: hoist rather than drop
        continue;
      }
      const kind = it.checked !== undefined ? 'taskList' : it.ordered ? 'orderedList' : 'bulletList';
      if (!cur || curKind !== kind) {
        // WHERE AN ORDERED LIST STARTS IS PART OF WHAT IT SAYS. `start` is in
        // TipTap's own orderedList schema, so it survives the editor as well as
        // this converter, and a list written as 4, 5, 6 does not come back as
        // 1, 2, 3. Measured on a large real document: renumbering was the only
        // place where the round trip changed a written character rather than
        // the whitespace around it. This product
        // has a standing rule against renumbering an option set, and an editor
        // that did it on a keystroke would break it silently.
        cur = kind === 'orderedList' && (it.n ?? 1) !== 1
          ? { type: kind, attrs: { start: it.n }, content: [] }
          : { type: kind, content: [] };
        curKind = kind;
        nodes.push(cur);
      }
      const inline: PmNode[] = inlineBlock([it.text, ...it.extra]);
      const para: PmNode = inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' };
      cur.content.push(
        it.checked !== undefined
          ? { type: 'taskItem', attrs: { checked: it.checked }, content: [para] }
          : { type: 'listItem', content: [para] },
      );
      pos++;
    }
    return nodes;
  };
  return level(0);
}

/* ── markdown -> PM doc JSON ── */
export function mdToPmDoc(md: string): PmNode {
  const lines = normalizeNewlines(md ?? '').split('\n');
  const out: PmNode[] = [];
  let i = 0;

  // THE BLANK LINES THE USER PRESSED ENTER FOR ARE PART OF THE TEXT.
  //
  // Two Enters in the sidebar note leave an empty paragraph between her
  // lines, and an empty paragraph used to serialize to nothing at all, so the
  // gap she put in was already gone the moment the note saved. The reload
  // only showed her.
  //
  // ONE blank line is the ordinary paragraph break and means no empty
  // paragraph. Every blank line after the first was typed on purpose. So a run of
  // k blank lines between two blocks carries k-1 empty paragraphs, and
  // `pmDocToMd` writes exactly that back. Nothing here needs a marker
  // character: the file stays plain markdown that reads the same in any other
  // editor, it just stops being flattened on the way through this one.
  //
  // A run at the very start of the document carries none, because a file that
  // opens with blank lines is a file an agent wrote loosely rather than a gap
  // she asked for, and `pmDocToMd` never writes one.
  let blankRun = 0;
  const spill = () => {
    if (out.length) for (let n = 1; n < blankRun; n++) out.push({ type: 'paragraph' });
    blankRun = 0;
  };
  // Every block goes through this so the gap before it is put back first.
  const push = (...nodes: PmNode[]) => { spill(); out.push(...nodes); };

  let paraBuf: string[] = [];
  const flushPara = () => {
    if (!paraBuf.length) return;
    // Groups of lines, with the length of each blank run between them.
    const parts: (string[] | number)[] = [];
    let cur: string[] = [];
    let run = 0;
    for (const ln of paraBuf) {
      if (ln.trim() === '') { run += 1; continue; }
      if (run) {
        if (cur.length) { parts.push(cur); cur = []; }
        parts.push(run);
        run = 0;
      }
      cur.push(ln);
    }
    if (cur.length) parts.push(cur);
    paraBuf = [];
    for (const part of parts) {
      if (typeof part === 'number') { blankRun = part; spill(); }
      else push({ type: 'paragraph', content: inlineBlock(part) });
    }
    // A trailing run belongs to the gap before whatever block comes next, and
    // if nothing comes next it is trailing whitespace and is dropped.
    blankRun = run;
  };

  while (i < lines.length) {
    const line = lines[i];

    const fm = line.match(FENCE_RE);
    if (fm) {
      flushPara();
      const lang = fm[1] || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
      i++; // past the closing fence (or EOF)
      push({
        type: 'codeBlock',
        attrs: { language: lang },
        content: body.length ? [{ type: 'text', text: body.join('\n') }] : undefined,
      });
      continue;
    }

    const hm = line.match(HEADING_RE);
    if (hm) {
      flushPara();
      push({ type: 'heading', attrs: { level: Math.min(3, hm[1].length) }, content: inlineToPm(hm[2].trim()) });
      i++;
      continue;
    }

    if (RULE_RE.test(line) && line.trim().startsWith('---')) {
      flushPara();
      push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    const im = line.match(IMAGE_RE);
    if (im) {
      flushPara();
      push({ type: 'image', attrs: { alt: im[1] || null, src: im[2] } });
      i++;
      continue;
    }

    if (matchItem(line)) {
      flushPara();
      const items = collectListBlock(lines, i, (n) => { i = n; });
      push(...buildListTree(items));
      continue;
    }

    if (QUOTE_RE.test(line)) {
      flushPara();
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) { quoted.push(lines[i].match(QUOTE_RE)![1]); i++; }
      const inner = mdToPmDoc(quoted.join('\n')).content as PmNode[];
      push({ type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph' }] });
      continue;
    }

    // GFM pipe table: | a | b | over |---|---| then data rows
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      flushPara();
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i]) && !TABLE_SEP_RE.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const cell = (type: 'tableHeader' | 'tableCell') => (text: string): PmNode => ({
        type, content: [{ type: 'paragraph', content: inlineToPm(text) }],
      });
      push({
        type: 'table',
        content: [
          { type: 'tableRow', content: header.map(cell('tableHeader')) },
          ...rows.map((r) => ({
            type: 'tableRow',
            // ragged rows pad to the header width so the doc stays rectangular
            content: header.map((_, c) => cell('tableCell')(r[c] ?? '')),
          })),
        ],
      });
      continue;
    }

    paraBuf.push(line);
    i++;
  }
  flushPara();

  return { type: 'doc', content: out.length ? out : [{ type: 'paragraph' }] };
}

/* ── PM doc JSON -> markdown (round-trip of the above) ── */

function wrapEmphasis(s: string, left: string, right = left): string {
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return m[2] ? `${m[1]}${left}${m[2]}${right}${m[3]}` : s;
}

// ONE MARK, ONE PAIR OF ASTERISKS, however many text nodes it spans.
//
// THE ONE CHANGE THIS PORT MAKES TO THE ORIGINAL CONVERTER, and it is here
// because the app's documents are not written in this editor: they are markdown an
// agent wrote, and agents write bold sentences with code spans inside them.
// ProseMirror splits such a sentence into three text nodes — bold, bold+code,
// bold — and wrapping each node on its own emitted
//
//   **NEVER** **\`git add -A\`****, A 2ND SESSION IS OFTEN IN** **\`dev.html\`****.**
//
// for a line that went in as
//
//   **NEVER \`git add -A\`, A 2ND SESSION IS OFTEN IN \`dev.html\`.**
//
// It renders the same and it is not the same file. Measured on her real
// STATE.md, 2026-08-21: two lines of 130 rewrote themselves that way on a
// round trip and both got LONGER, and STATE.md is the one document in this
// store with a hard 8000-character budget. So one character typed into it
// could have quietly pushed its tail past the cut where no agent can see it.
//
// The fix is to serialize a mark across the whole run of nodes that share it,
// outermost first, rather than per node.
//
// LINK IS INNERMOST, so a bold sentence with a link in it stays one bold
// sentence: `**Read [the doc](x) first.**` rather than `**Read** [**the
// doc**](x) **first.**`. The reverse ordering would spell a PARTLY bold link
// more tidily, and neither shape occurs anywhere in her 1,400 markdown files
// today (measured 2026-08-21: both orderings leave the same 641 byte-identical
// and the same 759 not), so this picks the one that matches how this product
// actually writes, which is a bold opening line with a path inside it.
const MARK_ORDER = ['underline', 'strike', 'bold', 'italic', 'link'] as const;

// What identifies a mark for grouping: a link is only the same mark as its
// neighbour when it points at the same place.
function markKey(node: PmNode, type: string): string | null {
  const mark = (node.marks || []).find((m: any) => m.type === type);
  if (!mark) return null;
  return type === 'link' ? `link:${(mark as any).attrs?.href ?? ''}` : type;
}

function wrapMark(type: string, body: string, href: string): string {
  if (type === 'italic') return wrapEmphasis(body, '*');
  if (type === 'bold') return wrapEmphasis(body, '**');
  if (type === 'strike') return wrapEmphasis(body, '~~');
  if (type === 'underline') return `<u>${body}</u>`;
  return `[${body}](${href})`;
}

function runMd(nodes: PmNode[], depth: number): string {
  if (depth >= MARK_ORDER.length) {
    // Innermost: code, per node, because a code span cannot span a run that
    // leaves and re-enters it.
    return nodes.map((n) => {
      if (n.type === 'hardBreak') return '\n';
      const s: string = n.text || '';
      return (n.marks || []).some((m: any) => m.type === 'code') ? '`' + s + '`' : s;
    }).join('');
  }
  const type = MARK_ORDER[depth];
  let out = '';
  for (let i = 0; i < nodes.length;) {
    if (nodes[i].type === 'hardBreak') { out += '\n'; i += 1; continue; }
    const key = markKey(nodes[i], type);
    let j = i + 1;
    // A LINE BREAK DOES NOT END A MARK. `**a\nb**` is one bold run in markdown
    // and it is how a long bold bullet is written here, so the break rides
    // inside the wrap rather than closing it and opening a second one.
    while (j < nodes.length && (nodes[j].type === 'hardBreak' || markKey(nodes[j], type) === key)) j += 1;
    // Except at the very end of the run: `**a**\n`, never `**a\n**`.
    while (j - 1 > i && nodes[j - 1].type === 'hardBreak') j -= 1;
    const run = nodes.slice(i, j);
    const body = runMd(run, depth + 1);
    out += key === null ? body : wrapMark(type, body, key.slice('link:'.length));
    i = j;
  }
  return out;
}

function inlineMd(content: PmNode[] | undefined): string {
  if (!Array.isArray(content)) return '';
  // A nested node breaks the run; a hard break does not, and runMd decides
  // whether each one falls inside a mark or between two of them.
  let out = '';
  let run: PmNode[] = [];
  const flush = () => { if (run.length) { out += runMd(run, 0); run = []; } };
  for (const n of content) {
    if (n.type !== 'text' && n.type !== 'hardBreak') { flush(); out += inlineMd(n.content); continue; }
    run.push(n);
  }
  flush();
  return out;
}

function fenceFor(code: string): string {
  const runs = code.match(/`{3,}/g);
  const longest = runs ? Math.max(...runs.map((r) => r.length)) : 0;
  return '`'.repeat(Math.max(3, longest + 1));
}

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);

// One list node -> markdown lines. Child lists indent by the parent marker's
// width; hardBreaks inside an item become continuation lines at that indent.
function listMd(node: PmNode, indent: string): string {
  const lines: string[] = [];
  (node.content || []).forEach((item: PmNode, idx: number) => {
    const marker =
      node.type === 'orderedList' ? `${(node.attrs?.start ?? 1) + idx}. `
        : node.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}] `
          : '- ';
    const cont = indent + ' '.repeat(marker.length);
    let opened = false;
    const open = (text: string) => { lines.push(indent + marker + text); opened = true; };
    for (const child of item.content || []) {
      if (LIST_TYPES.has(child.type)) {
        if (!opened) open('');
        lines.push(listMd(child, cont));
      } else {
        for (const part of inlineMd(child.content).split('\n')) {
          if (!opened) open(part);
          else if (part) lines.push(cont + part);
        }
      }
    }
    if (!opened) open('');
  });
  return lines.map((l) => l.replace(/\s+$/, '')).join('\n');
}

// Not a character that can be written: `out` holds rendered blocks and every
// real one is non-empty, so an empty string is free to mean "she left a line
// here". It never reaches the file.
const EMPTY_PARAGRAPH = '';

export function pmDocToMd(docJson: PmNode): string {
  const out: string[] = [];
  for (const node of docJson?.content || []) {
    if (node.type === 'heading') {
      const text = inlineMd(node.content);
      if (text.trim()) out.push(`${'#'.repeat(Math.min(6, node.attrs?.level || 1))} ${text}`);
    } else if (LIST_TYPES.has(node.type)) {
      const md = listMd(node, '');
      if (md.trim()) out.push(md);
    } else if (node.type === 'codeBlock') {
      const code = (node.content || []).map((t: PmNode) => t.text || '').join('');
      const fence = fenceFor(code);
      out.push(`${fence}${node.attrs?.language || ''}\n${code}\n${fence}`);
    } else if (node.type === 'blockquote') {
      const inner = pmDocToMd(node).trim();
      if (inner) out.push(inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'));
    } else if (node.type === 'horizontalRule') {
      out.push('---');
    } else if (node.type === 'image') {
      if (node.attrs?.src) out.push(`![${node.attrs.alt || ''}](${node.attrs.src})`);
    } else if (node.type === 'table') {
      const rows: PmNode[] = node.content || [];
      const cellText = (c: PmNode) => (c.content || []).map((p: PmNode) => inlineMd(p.content)).join(' ').replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
      const lines: string[] = [];
      rows.forEach((row: PmNode, r: number) => {
        const cells: PmNode[] = row.content || [];
        lines.push(`| ${cells.map(cellText).join(' | ')} |`);
        if (r === 0) lines.push(`|${cells.map(() => ' --- ').join('|')}|`);
      });
      if (lines.length) out.push(lines.join('\n'));
    } else {
      const text = inlineMd(node.content);
      if (text.trim()) out.push(text);
      // AN EMPTY PARAGRAPH IS A LINE SHE PRESSED ENTER FOR, not nothing. It
      // used to fall through this branch and disappear, which is the gap she
      // reported losing on reload. It is written as one more blank line in
      // the gap below, and `mdToPmDoc` reads it back.
      else if (node.type === 'paragraph') out.push(EMPTY_PARAGRAPH);
    }
  }
  // The blocks, one blank line apart, plus one extra blank line for each empty
  // paragraph standing between them. Empty paragraphs at either end are the
  // trailing whitespace of a file rather than something she can see, so they
  // are dropped, which is also what makes the round trip settle after one pass.
  let md = '';
  let gap = 0;
  for (const block of out) {
    if (block === EMPTY_PARAGRAPH) { if (md) gap += 1; continue; }
    if (md) md += '\n\n' + '\n'.repeat(gap);
    md += block;
    gap = 0;
  }
  return md + (md ? '\n' : '');
}
