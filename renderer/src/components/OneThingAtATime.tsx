// The one-at-a-time page's own pieces (w-65bcefb857). The page is how the thread
// page draws a thread in Needs you; these are the parts it adds: the name and
// summary on top, the answer under its headline, and the place in the queue
// with the arrows beside the menu.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { splitHeadline, type Spot } from '../one-thing-at-a-time';
import { ArtifactControlGlyph } from './ArtifactControlGlyph';
import { DocumentPreview } from './DocumentPreview';
import { HtmlPreview } from './HtmlPreview';
import '../one-thing-at-a-time.css';
import { TeammateMark } from '../teammates/TeammatesRail';
import { clock, dayHeading } from '../thread-history';
import type { Teammate } from '../types';

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
  const summary = useRef<HTMLDivElement>(null);
  const opening = useRef(false);
  const toggleHistory = () => {
    opening.current = !open;
    onToggle();
  };
  useLayoutEffect(() => {
    if (!open || !opening.current) return;
    opening.current = false;
    const box = summary.current?.closest('.focus-scroll');
    if (box) box.scrollTop = box.scrollHeight;
  }, [open]);
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
    <div className="one-sum" ref={summary}>
      {title && <h2 className="one-title">{title}</h2>}
      {toggle && (
        <div className="one-head">
          <button type="button" className="one-earlier" onClick={toggleHistory}>{toggle}</button>
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

export function QueueAnswer({ text, md, name = '', by = null }: {
  text: string;
  md: (text: string) => ReactNode;
  name?: string;
  /** The teammate that wrote it, which signs it. */
  by?: { t: Pick<Teammate, 'letter' | 'name'>; at: number } | null;
}) {
  const { headline, rest } = splitHeadline(text);
  const shown = headline && !sameLine(headline, name) ? headline : null;
  return (
    <div className="outcome one-answer">
      {by && <div className="one-by"><TeammateMark t={by.t} size="hd" /><span>{by.t.name}</span><em>{`${dayHeading(by.at)} ${clock(by.at)}`}</em></div>}
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
export function QueueFile({ product, path, md, onOpen, onSide }: { product: string; path: string; md: (text: string) => ReactNode; onOpen: () => void; onSide?: () => void }) {
  const page = /\.html?$/i.test(path);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [folded, setFolded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(undefined); setText(undefined);
    setFolded(false); setExpanded(false);
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
  if (text === null) return null;
  return (
    <section className={`${page ? 'one-file one-page' : 'one-file one-note'}${folded ? ' one-folded' : expanded ? ' one-expanded' : ''}`}>
      <FilePreviewHeader path={path} folded={folded} expanded={expanded}
        onFold={() => { setExpanded(false); setFolded((f) => !f); }}
        onCondense={() => setExpanded(false)} onOpen={onOpen} onSide={onSide} />
      {!folded && page && url && <HtmlPreview key={`${product}:${path}`} url={url} path={path} expanded={expanded} onExpandedChange={setExpanded} />}
      {!folded && !page && text != null && <DocumentPreview key={`${product}:${path}`} expanded={expanded} onExpandedChange={setExpanded}><div className="markdown one-notebody">{md(text)}</div></DocumentPreview>}
    </section>
  );
}

export function FilePreviewHeader({ path, folded, expanded, onFold, onCondense, onOpen, onSide }: {
  path: string; folded: boolean; expanded: boolean;
  onFold: () => void; onCondense: () => void; onOpen: () => void; onSide?: () => void;
}) {
  const name = useRef<HTMLButtonElement>(null);
  return (
    <div className="one-filehead" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}>
      <button ref={name} type="button" className="one-filefold" aria-expanded={!folded} onClick={onFold}>
        {chevron(!folded)}<span className="one-filename">{path.split('/').pop()}</span>
      </button>
      <div className="one-fileactions">
        {expanded && !folded && <button type="button" className="one-filecondense"
          onClick={() => { onCondense(); name.current?.focus({ preventScroll: true }); }}>Show preview</button>}
        {onSide && <button type="button" className="one-fileopen" aria-label="Open on the side" title="Open on the side" onClick={onSide}>
          <ArtifactControlGlyph><rect x="3" y="4" width="14" height="12" rx=".5" /><path d="M11 4v12" /></ArtifactControlGlyph>
        </button>}
        {/* The same corners the open file's own full screen mark draws (FocusControl). */}
        <button type="button" className="one-fileopen" aria-label="Open full screen" title="Open full screen" onClick={onOpen}>
          <ArtifactControlGlyph><path d="M7 3H3v4m10-4h4v4M3 13v4h4m6 0h4v-4" /></ArtifactControlGlyph>
        </button>
      </div>
    </div>
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
