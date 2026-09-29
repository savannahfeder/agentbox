// ⌘F. A small box in the corner that finds words on whatever screen is up.
//
// w-cc5bc203d0. Command-F did nothing inside an agent chat, so there was no way
// to find something already sent, and people expect it to work on every other
// page too. So it is not a chat feature: it reads the whole window, on every
// screen.
//
// It behaves the way the box in a browser does, because that is the one she
// already knows. Enter and ⌘G go to the next match, ⇧Enter and ⇧⌘G to the one
// before, both wrap, and Escape puts the keyboard back where it was.
//
// The words are found by find-in-page.ts and painted with the CSS highlight
// API, which marks text without touching the page's own elements, so nothing
// React drew is ever rewritten under it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { countLabel, matchesAcrossRuns, stepIndex, type TextRun } from '../find-in-page';

// Elements that sit inside a line of text rather than starting a new one. Two
// pieces of text under the same non-inline parent read as one line to her, so
// a phrase can run through bold, a link or code in the middle of a sentence.
const INLINE = new Set([
  'A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'CODE', 'DATA', 'DEL', 'DFN', 'EM', 'I', 'INS',
  'KBD', 'LABEL', 'MARK', 'Q', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR',
]);
const NEVER_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SVG']);

function blockOf(el: Element | null): Element | null {
  let e = el;
  while (e && INLINE.has(e.tagName)) e = e.parentElement;
  return e;
}

/** Every piece of text she can see, in reading order, and which line each is on. */
function textOnScreen(): { runs: TextRun[]; nodes: Text[] } {
  const runs: TextRun[] = [];
  const nodes: Text[] = [];
  const seen = new Map<Element, boolean>();
  const visible = (el: Element) => {
    let v = seen.get(el);
    if (v === undefined) {
      const check = (el as any).checkVisibility;
      v = typeof check === 'function' ? check.call(el, { visibilityProperty: true, checkVisibilityCSS: true }) : true;
      seen.set(el, v!);
    }
    return v!;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue) return NodeFilter.FILTER_REJECT;
      if (NEVER_TEXT.has(parent.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-find-bar]')) return NodeFilter.FILTER_REJECT;
      return visible(parent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    runs.push({ text: text.nodeValue ?? '', block: blockOf(text.parentElement) });
    nodes.push(text);
  }
  return { runs, nodes };
}

function findRanges(query: string): Range[] {
  const { runs, nodes } = textOnScreen();
  return matchesAcrossRuns(runs, query).map((m) => {
    const r = document.createRange();
    r.setStart(nodes[m.startRun], m.startOffset);
    r.setEnd(nodes[m.endRun], m.endOffset);
    return r;
  });
}

// The two paints, named in styles.css.
const ALL = 'find-match';
const CURRENT = 'find-current';

function paint(ranges: Range[], current: number) {
  const registry = (CSS as any).highlights;
  const Highlight = (window as any).Highlight;
  if (!registry || !Highlight) return;
  registry.set(ALL, new Highlight(...ranges));
  if (current >= 0 && ranges[current]) registry.set(CURRENT, new Highlight(ranges[current]));
  else registry.delete(CURRENT);
}

function unpaint() {
  const registry = (CSS as any).highlights;
  registry?.delete(ALL);
  registry?.delete(CURRENT);
}

const onScreen = (r: Range) => {
  const box = r.getBoundingClientRect();
  return box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
};

// Bring a match into view. Centred, the way a browser does, so the lines
// around it come with it; and only when it is not already showing, so walking
// through matches on one screen does not jolt the page.
function reveal(r: Range | undefined) {
  if (!r || onScreen(r)) return;
  const el = r.startContainer.parentElement;
  el?.scrollIntoView({ block: 'center', inline: 'nearest' });
}

export function FindBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(-1);
  const [count, setCount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const ranges = useRef<Range[]>([]);
  const at = useRef(-1);
  const back = useRef<Element | null>(null);
  const openRef = useRef(false);
  const queryRef = useRef('');

  const show = (list: Range[], index: number) => {
    ranges.current = list;
    at.current = index;
    setCount(list.length);
    setCurrent(index);
    paint(list, index);
  };

  // A fresh search starts on the first match she can already see, so a word
  // she is looking at is where it lands and the chat does not leap to the top.
  const search = useCallback((q: string) => {
    const list = q.trim() ? findRanges(q) : [];
    const firstShowing = list.findIndex(onScreen);
    const index = list.length === 0 ? -1 : firstShowing >= 0 ? firstShowing : 0;
    show(list, index);
    reveal(list[index]);
  }, []);

  const step = useCallback((direction: 1 | -1) => {
    // Found afresh each time: an agent may have written more since the last
    // press, and a Range into text React has since replaced points at nothing.
    const list = queryRef.current.trim() ? findRanges(queryRef.current) : [];
    const index = stepIndex(Math.min(at.current, list.length - 1), list.length, direction);
    show(list, index);
    reveal(list[index]);
  }, []);

  const close = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    unpaint();
    ranges.current = [];
    at.current = -1;
    const to = back.current as HTMLElement | null;
    back.current = null;
    if (to && to.isConnected && typeof to.focus === 'function') to.focus();
  }, []);

  // The key, from the main process, wherever the keyboard was.
  useEffect(() => {
    const off = (window as any).zero?.onFind?.((payload: { step?: number }) => {
      const s = Number(payload?.step) || 0;
      if (!openRef.current) {
        const active = document.activeElement;
        back.current = active && !active.closest('[data-find-bar]') ? active : null;
        openRef.current = true;
        setOpen(true);
      }
      requestAnimationFrame(() => {
        input.current?.focus();
        if (s === 0) input.current?.select();
        else step(s > 0 ? 1 : -1);
      });
    }) ?? (() => {});
    return off;
  }, [step]);

  // Typing. A short pause first, because a long chat is a lot of text to read
  // on every letter.
  useEffect(() => {
    queryRef.current = query;
    if (!open) return undefined;
    const t = setTimeout(() => search(query), 60);
    return () => clearTimeout(t);
  }, [query, open, search]);

  // THE SCREEN CHANGES UNDER IT. An agent writes, she opens another task. The
  // matches are found again, and the count with them, without moving the page.
  // Changes inside the box itself are ignored, or its own count would trigger
  // the next search forever.
  useEffect(() => {
    if (!open) return undefined;
    let t: ReturnType<typeof setTimeout> | null = null;
    const watch = new MutationObserver((records) => {
      const outside = records.some((r) => {
        const el = r.target.nodeType === Node.ELEMENT_NODE ? (r.target as Element) : r.target.parentElement;
        return !el?.closest('[data-find-bar]');
      });
      if (!outside || !queryRef.current.trim()) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const list = findRanges(queryRef.current);
        show(list, list.length === 0 ? -1 : Math.min(Math.max(at.current, 0), list.length - 1));
      }, 200);
    });
    watch.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { watch.disconnect(); if (t) clearTimeout(t); };
  }, [open]);

  useEffect(() => () => unpaint(), []);

  if (!open) return null;
  const label = countLabel(current, count, query);
  return (
    <div className="find-bar" data-find-bar role="search">
      <input
        ref={input}
        className="find-input"
        value={query}
        placeholder="Find"
        spellCheck={false}
        aria-label="Find on this screen"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            step(e.shiftKey ? -1 : 1);
          }
        }}
      />
      <span className={`find-count${count === 0 && query.trim() ? ' none' : ''}`}>{label}</span>
      <button type="button" className="find-step" aria-label="Previous match" disabled={count === 0} onClick={() => step(-1)}>↑</button>
      <button type="button" className="find-step" aria-label="Next match" disabled={count === 0} onClick={() => step(1)}>↓</button>
      <button type="button" className="find-step" aria-label="Close" onClick={close}>×</button>
    </div>
  );
}
