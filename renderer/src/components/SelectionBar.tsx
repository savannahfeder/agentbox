// Words selected on a document or a script stay selected, and this small bar
// over them offers a comment. Selecting alone never starts one.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { barSpot, pickedIn, quoteFrom } from '../selection-bar';

type Box = { top: number; bottom: number; left: number; right: number };

const CommentGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" />
  </svg>
);

export function SelectionBar({ page, onComment }: { page: RefObject<HTMLElement | null>; onComment: (quote: string) => void }) {
  const bar = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<{ first: Box; all: Box } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
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
    const gone = () => { if (!pickedIn(page.current, window.getSelection())) setAt(null); };
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
    const spot = barSpot(at.first, at.all, { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight, top });
    el.style.left = `${spot.left}px`;
    el.style.top = `${spot.top}px`;
  }, [at, copied]);

  if (!at) return null;
  const comment = () => {
    const words = pickedIn(page.current, window.getSelection());
    if (!words) return;
    onComment(quoteFrom(words));
    window.getSelection()?.empty();
    setAt(null);
  };
  const copy = async () => {
    const words = pickedIn(page.current, window.getSelection());
    if (!words) return;
    try { await navigator.clipboard.writeText(words); setCopied(true); } catch { /* clipboard blocked */ }
  };
  // On the body: the page scrolls inside a size container, which would hold a fixed bar to itself.
  return createPortal(<div ref={bar} className="link-pop selection-bar" role="toolbar" aria-label="Selected words" onMouseDown={(e) => e.preventDefault()}>
    <button type="button" className="link-pop-btn selection-bar-comment" onClick={comment}><CommentGlyph />Comment</button>
    <button type="button" className="link-pop-btn" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
  </div>, document.body);
}
