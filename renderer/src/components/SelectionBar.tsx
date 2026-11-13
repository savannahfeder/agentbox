// Words selected on a document or a script stay selected, and this small bar
// over them offers a comment. Selecting alone never starts one.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { barSpot, boxPickedIn, pickedIn, quoteFrom } from '../selection-bar';

type Box = { top: number; bottom: number; left: number; right: number };

const CommentGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" />
  </svg>
);

/** The same bar over words selected inside a page's own frame, which says what they are (shared/frame-selected-words.mts). */
export function FrameWordsBar({ frame, onComment }: { frame: HTMLIFrameElement | null; onComment: (quote: string) => void }) {
  const bar = useRef<HTMLDivElement | null>(null);
  const [picked, setPicked] = useState<{ words: string; first: Box; all: Box } | null>(null);
  const [copied, setCopied] = useState(false);
  const [moves, setMoves] = useState(0);
  useEffect(() => {
    setPicked(null);
    if (!frame) return undefined;
    const hear = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || e.data?.type !== 'agentbox-selected-words') return;
      const { words, first, all } = e.data;
      setCopied(false);
      setPicked(typeof words === 'string' && words.trim() && first && all ? { words, first, all } : null);
    };
    const down = (e: MouseEvent) => { if (!bar.current?.contains(e.target as Node)) setPicked(null); };
    const moved = () => setMoves((n) => n + 1);
    window.addEventListener('message', hear);
    document.addEventListener('mousedown', down, true);
    window.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    return () => {
      window.removeEventListener('message', hear);
      document.removeEventListener('mousedown', down, true);
      window.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', moved);
    };
  }, [frame]);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || !picked || !frame) return;
    const r = frame.getBoundingClientRect();
    const onScreen = (b: Box) => ({ top: b.top + r.top, bottom: b.bottom + r.top, left: b.left + r.left, right: b.right + r.left });
    const top = frame.closest('.preview-frame')?.getBoundingClientRect().top ?? 0;
    const spot = barSpot(onScreen(picked.first), onScreen(picked.all), { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight, top });
    el.style.left = `${spot.left}px`;
    el.style.top = `${spot.top}px`;
  }, [picked, copied, moves, frame]);

  if (!picked) return null;
  const comment = () => {
    onComment(quoteFrom(picked.words));
    // The page is a sandboxed frame with an opaque origin, which no target but '*' can name; the message carries nothing.
    // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
    frame?.contentWindow?.postMessage({ type: 'agentbox-clear-selection' }, '*');
    setPicked(null);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(picked.words); setCopied(true); } catch { /* clipboard blocked */ }
  };
  return createPortal(<div ref={bar} className="link-pop selection-bar" role="toolbar" aria-label="Selected words" onMouseDown={(e) => e.preventDefault()}>
    <button type="button" className="link-pop-btn selection-bar-comment" onClick={comment}><CommentGlyph />Comment</button>
    <button type="button" className="link-pop-btn" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
  </div>, document.body);
}

// A box draws no ranges of its own, so the picked words are found by laying the
// same text out in a copy of the box at the same place.
function boxLines(el: HTMLTextAreaElement): { first: Box; all: Box } {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const copy = document.createElement('div');
  for (const k of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'whiteSpace', 'overflowWrap', 'wordBreak', 'textAlign'] as const) copy.style[k] = s[k];
  Object.assign(copy.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top - el.scrollTop}px`, width: `${r.width}px`, visibility: 'hidden', whiteSpace: 'pre-wrap' });
  const words = document.createElement('span');
  words.textContent = el.value.slice(el.selectionStart, el.selectionEnd);
  copy.append(el.value.slice(0, el.selectionStart), words);
  document.body.append(copy);
  const lines = [...words.getClientRects()].filter((x) => x.width > 0);
  const all = words.getBoundingClientRect();
  copy.remove();
  return { first: lines[0] ?? all, all };
}

const pickedBox = (page: HTMLElement | null) => {
  const el = document.activeElement;
  return el instanceof HTMLTextAreaElement && boxPickedIn(page, el) ? el : null;
};

/** `at` is where the words are, for a page that says more about a place than its words (a table's cell). */
export function SelectionBar({ page, onComment }: { page: RefObject<HTMLElement | null>; onComment: (quote: string, at: Element | null) => void }) {
  const bar = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<{ first: Box; all: Box } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      const box = pickedBox(page.current);
      if (box) { setAt(boxLines(box)); return; }
      const sel = window.getSelection();
      if (!pickedIn(page.current, sel) || !sel) { setAt(null); return; }
      const range = sel.getRangeAt(0);
      const lines = [...range.getClientRects()].filter((r) => r.width > 0);
      const all = range.getBoundingClientRect();
      setAt({ first: lines[0] ?? all, all });
    };
    const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(read); };
    // Hidden while a drag is under way, and shown when the hand lets go.
    const down = (e: MouseEvent) => { if (!bar.current?.contains(e.target as Node)) { setAt(null); setCopied(false); } };
    const gone = () => { if (!pickedIn(page.current, window.getSelection()) && !pickedBox(page.current)) setAt(null); };
    const moved = () => setAt((was) => { if (was) later(); return was; });
    document.addEventListener('mousedown', down, true);
    document.addEventListener('mouseup', later);
    document.addEventListener('keyup', later);
    document.addEventListener('selectionchange', gone);
    window.addEventListener('scroll', moved, true);
    window.addEventListener('resize', moved);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('mouseup', later);
      document.removeEventListener('keyup', later);
      document.removeEventListener('selectionchange', gone);
      window.removeEventListener('scroll', moved, true);
      window.removeEventListener('resize', moved);
    };
  }, [page]);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || !at) return;
    const top = page.current?.closest('.artifact-view')?.querySelector('.av-body')?.getBoundingClientRect().top ?? 0;
    const left = page.current?.closest('.doc-card')?.getBoundingClientRect().left ?? 0;
    const spot = barSpot(at.first, at.all, { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight, top, left });
    el.style.left = `${spot.left}px`;
    el.style.top = `${spot.top}px`;
  }, [at, copied]);

  if (!at) return null;
  const picked = () => {
    const sel = window.getSelection();
    const words = pickedIn(page.current, sel);
    if (words) return { words, at: sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement ?? null };
    const box = pickedBox(page.current);
    const inBox = boxPickedIn(page.current, document.activeElement);
    return box && inBox ? { words: inBox, at: box as Element } : null;
  };
  const comment = () => {
    const got = picked();
    if (!got) return;
    const { words, at } = got;
    onComment(quoteFrom(words), at);
    window.getSelection()?.empty();
    setAt(null);
  };
  const copy = async () => {
    const words = picked()?.words;
    if (!words) return;
    try { await navigator.clipboard.writeText(words); setCopied(true); } catch { /* clipboard blocked */ }
  };
  // On the body: the page scrolls inside a size container, which would hold a fixed bar to itself.
  return createPortal(<div ref={bar} className="link-pop selection-bar" role="toolbar" aria-label="Selected words" onMouseDown={(e) => e.preventDefault()}>
    <button type="button" className="link-pop-btn selection-bar-comment" onClick={comment}><CommentGlyph />Comment</button>
    <button type="button" className="link-pop-btn" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
  </div>, document.body);
}
