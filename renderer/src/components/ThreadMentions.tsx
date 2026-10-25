// The # list in a text box, and the chip a picked thread wears there. The rules
// are ../thread-mentions.ts; the New thread card and the reply box each wire
// this hook to their own text field.
import { useContext, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { WorkItem } from '../types';
import { agoQuiet } from '../format';
import {
  encodeThreadMentions, findThreadMentions, threadName, threadQuery, threadRows, withThreadNames,
} from '../thread-mentions';
import { MentionIcon } from './Mention';
import { TicketItems } from './TicketReference';
import '../team/chat.css';
import './thread-mentions.css';

// What the mirror copies off the text field so its words land where the field's do.
const TYPE = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'tabSize',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'] as const;

/**
 * `rise` opens the list upward off the box, as the reply box's other menus
 * do at the foot of the window; otherwise it drops under the line being typed.
 */
export function useThreadMentions({ text, setText, input, here, threads, rise = false }: {
  text: string; setText: (next: string) => void; input: RefObject<HTMLTextAreaElement>;
  here?: string; threads?: readonly WorkItem[]; rise?: boolean;
}) {
  const fromApp = useContext(TicketItems);
  const all = threads ?? fromApp;
  const [caret, setCaret] = useState(0);
  const [menuAt, setMenuAt] = useState(0);
  const [shut, setShut] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [drop, setDrop] = useState<{ left: number; top: number } | null>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);

  const mentions = useMemo(() => findThreadMentions(text, all, picked), [text, all, picked]);
  const query = threadQuery(text, caret);
  const onMention = !!query && mentions.some((m) => m.start === query.start || (caret > m.start && caret <= m.end));
  const rows = useMemo(
    () => (!query || onMention || shut === text ? [] : threadRows(all, query.query, { here })),
    [query?.start, query?.query, onMention, shut, text, all, here],
  );
  const open = rows.length > 0;
  const cursor = Math.min(menuAt, Math.max(0, rows.length - 1));
  const many = new Set(rows.map((r) => r.product)).size > 1;

  // The mirror sits exactly behind the field: same box, same type, same scroll.
  useLayoutEffect(() => {
    const el = input.current;
    const m = mirror.current;
    if (!el || !m) return;
    const cs = getComputedStyle(el);
    for (const p of TYPE) m.style[p] = cs[p];
    m.style.top = `${el.offsetTop}px`;
    m.style.left = `${el.offsetLeft}px`;
    m.style.width = `${el.clientWidth + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)}px`;
    m.style.height = `${el.offsetHeight}px`;
    m.scrollTop = el.scrollTop;
    if (rise || !open || !marker.current) { if (drop) setDrop(null); return; }
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    const width = (el.offsetParent as HTMLElement | null)?.clientWidth ?? el.offsetWidth;
    // A row's icon sits 15px in (border, padding, the row's own), under the #.
    const left = Math.max(8, Math.min(m.offsetLeft + marker.current.offsetLeft - 15, width - 448));
    const top = m.offsetTop + marker.current.offsetTop - m.scrollTop + line + 6;
    if (!drop || drop.left !== left || drop.top !== top) setDrop({ left, top });
  });

  // The caret goes after the name in the same commit as the words, so a letter
  // typed straight after Enter cannot land in front of it.
  const caretTo = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = caretTo.current;
    if (at === null || !input.current) return;
    caretTo.current = null;
    input.current.focus();
    input.current.setSelectionRange(at, at);
    setCaret(at);
  });
  const pick = (row: WorkItem) => {
    if (!query) return;
    const before = text.slice(0, query.start);
    const words = `#${threadName(row)} `;
    setPicked((had) => [...had.filter((id) => id !== row.id), row.id]);
    caretTo.current = before.length + words.length;
    setText(before + words + text.slice(caret).replace(/^ /, ''));
    setMenuAt(0);
  };

  /** True when the key was the list's. */
  const keyDown = (e: KeyboardEvent<HTMLElement>): boolean => {
    if (!open) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMenuAt((cursor + 1) % rows.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setMenuAt((cursor - 1 + rows.length) % rows.length); return true; }
    if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') { e.preventDefault(); pick(rows[cursor]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setShut(text); return true; }
    return false;
  };
  const track = (el: HTMLTextAreaElement) => {
    setCaret(el.selectionStart);
    if (mirror.current) mirror.current.scrollTop = el.scrollTop;
  };

  const menu = open && (
    <div className={`mention-menu thread-menu${rise ? '' : ' drop'}`} role="listbox" aria-label="Threads"
      style={!rise && drop ? { left: drop.left, top: drop.top, bottom: 'auto' } : undefined}>
      <div className="mention-head">Threads</div>
      {rows.map((r, i) => (
        <button key={r.id} type="button" role="option" aria-selected={i === cursor} className={`mention-row${i === cursor ? ' cursor' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); pick(r); }} onMouseEnter={() => setMenuAt(i)}>
          <MentionIcon kind="thread" />
          <span className="mention-name">{threadName(r)}</span>
          <span className="mention-hint">{[many ? r.productName : null, r.status === 'done' ? 'Done' : null, agoQuiet(r.updatedAt)].filter(Boolean).join(' · ')}</span>
        </button>
      ))}
    </div>
  );

  // Behind the field: the same words, clear except where a thread is named,
  // plus the point the list hangs from while it is open.
  const pieces: ReactNode[] = [];
  let from = 0;
  const cuts = [...mentions.map((m) => ({ at: m.start, m })), ...(open && query ? [{ at: query.start, m: null }] : [])].sort((a, b) => a.at - b.at);
  for (const c of cuts) {
    pieces.push(text.slice(from, Math.max(from, c.at)));
    from = Math.max(from, c.at);
    if (c.m) { pieces.push(<span key={`m${c.m.start}`} className="mention-chip thread-chip">{text.slice(c.m.start, c.m.end)}</span>); from = c.m.end; }
    else pieces.push(<span key="at" ref={marker} />);
  }
  pieces.push(text.slice(from), '​');
  const layered = mentions.length > 0 || open;
  const chips = layered && <div className="thread-mirror" ref={mirror} aria-hidden="true">{pieces}</div>;

  return {
    mentions,
    open,
    menu,
    chips,
    /** The class the field takes so its words sit over the chips. */
    over: layered ? 'over-threads' : '',
    keyDown,
    track,
    /** The words as they are sent. */
    encode: (words: string) => encodeThreadMentions(words, findThreadMentions(words, all, picked)),
    /** The words with each thread down to its name, for a title. */
    plain: (words: string) => withThreadNames(words, findThreadMentions(words, all, picked)),
  };
}
