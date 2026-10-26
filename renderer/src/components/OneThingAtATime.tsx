// The one-at-a-time page's own pieces (w-65bcefb857). The page is how the thread
// page draws a thread in Needs you; these are the parts it adds: the name and
// summary on top, the answer under its headline, and the place in the queue
// with the arrows beside the menu.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { onPhone } from '../phone-screen';
import { splitHeadline, type Spot } from '../one-thing-at-a-time';
import '../one-thing-at-a-time.css';

/** What this page reads in place rather than as a tile: a page an agent made, or a note. */
export const readsInPlace = (path: string) => /\.(html?|md|markdown)$/i.test(path);

export function QueueSummary({ title, context, earlier, steps = false, open, onToggle }: {
  title?: string;
  context: string | null | undefined;
  /** Messages behind the fold. */
  earlier: number;
  /** Whether the fold holds the agent's steps even with no earlier message. */
  steps?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const toggle = earlier > 0
    ? (open ? 'Hide earlier messages' : `Show ${earlier} earlier ${earlier === 1 ? 'message' : 'messages'}`)
    : steps ? (open ? 'Hide what the agent did' : 'Show what the agent did') : null;
  // Cut is only known once laid out, at this width.
  const cols = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState(false);
  const [whole, setWhole] = useState(false);
  useLayoutEffect(() => {
    const el = cols.current;
    if (!el || whole) return undefined;
    const measure = () => { const c = el.querySelector('.one-col'); setCut(!!c && c.scrollHeight > c.clientHeight + 1); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [context, whole]);
  const opens = cut || whole;
  const flip = () => setWhole((w) => !w);
  return (
    <div className="one-sum">
      {title && <h2 className="one-title">{title}</h2>}
      {toggle && (
        <div className="one-head">
          <button type="button" className="one-earlier" onClick={onToggle}>{toggle}</button>
        </div>
      )}
      {context && (
        <div
          ref={cols}
          className={`one-cols${whole ? ' one-whole' : cut ? ' one-cut' : ''}`}
          role={opens ? 'button' : undefined}
          tabIndex={opens ? 0 : undefined}
          aria-expanded={opens ? whole : undefined}
          onClick={opens ? flip : undefined}
          onKeyDown={opens ? (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); flip(); } } : undefined}
        >
          <div className="one-col">{context}</div>
        </div>
      )}
    </div>
  );
}

const sameLine = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

export function QueueAnswer({ text, md, name = '' }: { text: string; md: (text: string) => ReactNode; name?: string }) {
  const { headline, rest } = splitHeadline(text);
  // A teammate's thread is named after this same line, so it is not said twice.
  const shown = headline && !sameLine(headline, name) ? headline : null;
  return (
    <div className="outcome one-answer">
      {shown && <h1 className="one-q">{shown}</h1>}
      {rest.trim() && md(rest)}
    </div>
  );
}

/**
 * A page or a note the answer names, read in place under it at the page's full
 * width. The page is framed the way the side pane frames one (DocPane.tsx),
 * sandbox and all. A page with no address to frame (the browser copy gives
 * none) keeps its name and the way to open it; a note that cannot be read
 * draws nothing, and the answer still names it.
 */
export function QueueFile({ product, path, md, onOpen }: { product: string; path: string; md: (text: string) => ReactNode; onOpen: () => void }) {
  const page = /\.html?$/i.test(path);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setUrl(undefined); setText(undefined);
    if (page) {
      api.resolveDoc({ product, src: path })
        .then((r) => { if (live) setUrl(r.ok && r.url ? r.url : null); })
        .catch(() => { if (live) setUrl(null); });
    } else {
      api.readDoc({ product, src: path })
        .then((r) => { if (live) setText(r.ok ? r.text ?? '' : null); })
        .catch(() => { if (live) setText(null); });
    }
    return () => { live = false; };
  }, [product, path, page]);
  const [folded, setFolded] = useState(false);
  if (text === null) return null;
  return (
    <section className={`${page ? 'one-file one-page' : 'one-file one-note'}${folded ? ' one-folded' : ''}`}>
      <div className="one-filehead">
        <button type="button" className="one-filefold" aria-expanded={!folded} onClick={() => setFolded((f) => !f)}>
          {chevron(!folded)}<span className="one-filename">{path.split('/').pop()}</span>
        </button>
        <button type="button" className="one-fileopen" onClick={onOpen}>Open full screen</button>
      </div>
      {!folded && page && url && <iframe className="one-frame" src={url} title={path} sandbox={onPhone() ? 'allow-scripts' : 'allow-scripts allow-same-origin'} />}
      {!folded && !page && text != null && <div className="markdown one-notebody">{md(text)}</div>}
    </section>
  );
}

const chevron = (up: boolean) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
  </svg>
);

/** The small arrow in the corner of the choices at the foot, which folds them away. */
export function ChoicesFold({ onFold }: { onFold: () => void }) {
  return (
    <button type="button" className="one-choices-fold" aria-label="Fold the choices" onClick={onFold}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
    </button>
  );
}

/**
 * With the choices folded, the sign on the reply box that they are there: how
 * many, and an arrow to bring them back. It rides inside the box's button, as
 * the model's name does, so it stops the click from opening the reply.
 */
export function ChoicesShow({ count, onShow }: { count: number; onShow: () => void }) {
  return (
    <span className="one-choices-show" role="button" tabIndex={-1} aria-label={`Show the ${count} choices`} onClick={(e) => { e.stopPropagation(); onShow(); }}>
      <span className="one-choices-count">{count}</span>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10l4-4 4 4" /></svg>
    </span>
  );
}

export function QueueNav({ spot, onStep }: { spot: Spot; onStep: (dir: 1 | -1) => void }) {
  return (
    <span className="one-nav">
      <span className="one-pos">{spot.pos} of {spot.total}</span>
      <button type="button" className="ts-more one-step" data-hint="previous-thread" data-hint-align="right" aria-label="Previous thread (K)" disabled={spot.index <= 0} onClick={() => onStep(-1)}>{chevron(true)}</button>
      <button type="button" className="ts-more one-step" data-hint="next-thread" data-hint-align="right" aria-label="Next thread (J)" disabled={spot.pos >= spot.total} onClick={() => onStep(1)}>{chevron(false)}</button>
    </span>
  );
}
