// The file itself, whichever kind it is, with the comments drawn on it. One
// stage to a pane, so two versions side by side are two of these.
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { whereAFileLinkGoes } from '../file-links';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { findQuote, viewKind } from '../../../shared/artifact-marks.mjs';
import { api } from '../api';
import { canPaintQuotes, paintQuotes } from '../paint-quotes';
import { fetchableFileUrl } from '../phone-files';
import { pictureUrl } from '../picture';
import { MAX_ZOOM, lowestZoom } from '../picture-view';
import { filmMarks, filmPins, hasSpot, keepUnder, marksOnPages, nextZoom, pagePins, pageSpot, pictureFit, pinned, pinsToDraw, realZoom, roomInside, wheelZoom, zoomAnchor, zoomWords, type Found } from '../artifact-pins';

const pick = ({ paddingLeft, paddingRight, paddingTop, paddingBottom }: CSSStyleDeclaration) => ({ paddingLeft, paddingRight, paddingTop, paddingBottom });
import type { FileNote, NotePlace } from '../types';
import { quotesKey } from '../selection-bar';
import { CodeFile } from './CodeFile';
import { SelectionBar } from './SelectionBar';
import { DeckSlides } from './DeckSlides';
import { PinMarks, spotIn } from './PinMarks';
import { FilmPlayer } from './FilmPlayer';
import { PdfPages } from './PdfPages';
import { OPEN_WITHIN_MS, didNotOpen } from '../opening-wait';
import { OpeningWait } from './OpeningWait';
import { DocOutline } from './DocOutline';
import './doc-reading.css';

const MD_PLUGINS = [remarkGfm];

/** Opens a web link over the file. Set by the view the file is open in. */
export const StageLink = createContext<((url: string) => void) | null>(null);

// A bare <a> would walk the whole window off to that page.
function FileLink({ href = '', folder, children }: { href?: string; folder: string | null; children?: ReactNode }) {
  const openWeb = useContext(StageLink);
  return <a href={href} onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    const goes = whereAFileLinkGoes(href);
    if (goes === 'browser') {
      if (openWeb) openWeb(href);
      else void api.openArtifactExternally({ product: '', src: href });
    } else if (goes === 'outside' && folder) {
      const src = href.startsWith('/') ? href : decodeURIComponent(new URL(href, `file://${folder}/`).pathname);
      void api.openArtifactExternally({ product: '', src });
    }
  }}>{children}</a>;
}

/** A picture the document names beside itself is drawn from the document's own folder. */
const partsFor = (folder: string | null) => ({
  a: ({ href, children }: { href?: string; children?: ReactNode }) => <FileLink href={href} folder={folder}>{children}</FileLink>,
  img: ({ src, alt }: { src?: string; alt?: string }) => {
    const from = src ?? '';
    if (/^https?:/.test(from)) return <img src={from} alt={alt ?? ''} />;
    if (!folder || !from || /^[a-z][a-z0-9+.-]*:/i.test(from)) return <em>{alt || from}</em>;
    return <img src={pictureUrl(from.startsWith('/') ? from : new URL(from, `file://${folder}/`).pathname)} alt={alt ?? ''} crossOrigin="anonymous" />;
  },
});

export type StageGo = { place: NotePlace; at: number } | null;

export interface StageProps {
  /** Instead of "could not be found", where whose computer has it is known. */
  missingSays?: string;
  product: string;
  path: string;
  name: string;
  /** Who put this version on the thread, and when. */
  byline?: string | null;
  notes: FileNote[];
  /** Still open on an earlier version, drawn here too. */
  carried?: FileNote[];
  /** What became of looking for the file, so the view offers only what fits. */
  onFound?: (found: Found) => void;
  onOutside?: () => void;
  /** Draw resolved pins too. */
  showResolved?: boolean;
  /** A comment just resolved, whose pin stays greyed while its Undo is offered. */
  keep?: string | null;
  files?: StageFiles;
  /** The comment in hand, and the one picked in the list. */
  draft: NotePlace | null;
  activeId: string | null;
  go: StageGo;
  /** Bump to pause a film while a comment is typed. */
  hold: number;
  /** Absent on the older side of a comparison, which only shows. */
  onPlace?: (place: NotePlace | null) => void;
  onPick?: (id: string) => void;
  /** Where a film or deck now is, for the comment in hand. */
  onHere?: (place: NotePlace) => void;
  /** Comments whose quoted words are no longer in this version. */
  onQuotesGone?: (ids: string[]) => void;
}

/** A file that is not in a project, such as one in a group chat: where it is on disk, and its words. */
export interface StageFiles {
  find: (path: string) => Promise<string | null>;
  readText: (path: string) => Promise<string | null>;
}

/** The thread whose files the stage reads, so a name finds that thread's file first. */
export const StageThread = createContext<string | undefined>(undefined);

function useResolved(product: string, path: string, files?: StageFiles) {
  const thread = useContext(StageThread);
  const [state, setState] = useState<{ path: string; opened: string | null; coming: boolean; url: string | null } | null>(null);
  const [looks, setLooks] = useState(0);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (files) {
      void files.find(path).then((opened) => { if (live) setState({ path, opened, coming: false, url: null }); })
        .catch(() => { if (live) setState({ path, opened: null, coming: false, url: null }); });
      return () => { live = false; };
    }
    void api.resolveDoc({ product, src: path, thread }).then((r) => {
      if (!live) return;
      setState({ path, opened: r.ok && r.opened ? r.opened : null, coming: !!r.coming, url: r.ok && r.url ? r.url : null });
      if (r.coming) timer = setTimeout(() => setLooks((n) => n + 1), 3000);
    }).catch(() => { if (live) setState({ path, opened: null, coming: false, url: null }); });
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [product, path, looks]);
  return state?.path === path ? state : null;
}


const ZoomGlyph = ({ plus }: { plus?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d={plus ? 'M3.5 8h9M8 3.5v9' : 'M3.5 8h9'} />
  </svg>
);

function PictureStage({ url, name, notes, carried, draft, activeId, go, showResolved, keep, onPlace, onPick, onFound, onAgain }: {
  onAgain: () => void;
  url: string; name: string; notes: FileNote[]; carried: FileNote[]; draft: NotePlace | null; activeId: string | null; go: StageGo; showResolved?: boolean; keep?: string | null;
  onPlace?: (place: NotePlace | null) => void; onPick?: (id: string) => void; onFound?: (found: Found) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const picture = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zoomNow = useRef(1);
  zoomNow.current = zoom;
  const anchor = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const dragged = useRef(false);
  useEffect(() => { setFailed(false); setNatural({ w: 0, h: 0 }); setZoom(1); box.current?.scrollTo({ top: 0, left: 0 }); }, [url]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setSize(roomInside({ clientWidth: el.clientWidth, clientHeight: el.clientHeight, ...pick(getComputedStyle(el)) }));
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  const fitted = pictureFit(natural, size);
  const { scale: fit, tall } = fitted;
  const floor = lowestZoom(fitted);
  const fitNow = useRef(fit);
  fitNow.current = fit;
  const floorNow = useRef(floor);
  floorNow.current = floor;
  const shown = { w: natural.w * fit * zoom, h: natural.h * fit * zoom };
  // Where the pointer is over the box, so a key zooms about what is being looked at.
  const pointerAt = useRef<{ x: number; y: number } | null>(null);

  // The pin in hand, else the middle of what is in view; for a pinch, the spot under the pointer.
  const held = draft?.kind === 'pin' ? draft : [...notes, ...carried].find((n) => n.id === activeId && n.place.kind === 'pin')?.place;
  const spot = useRef<{ x: number; y: number } | null>(null);
  spot.current = held?.kind === 'pin' ? { x: held.x, y: held.y } : null;
  const zoomTo = useCallback((next: number, at?: { clientX: number; clientY: number } | 'pointer') => {
    const el = box.current;
    const pic = picture.current;
    if (!el || !pic || next === zoomNow.current) return;
    const r = pic.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const rel = { left: r.left - b.left, top: r.top - b.top, w: r.width, h: r.height };
    if (at && at !== 'pointer') {
      const x = at.clientX - b.left;
      const y = at.clientY - b.top;
      anchor.current = { fx: (x - rel.left) / (rel.w || 1), fy: (y - rel.top) / (rel.h || 1), x, y };
    } else {
      anchor.current = zoomAnchor(spot.current, { w: el.clientWidth, h: el.clientHeight }, rel, at === 'pointer' ? pointerAt.current : null);
    }
    setZoom(next);
  }, []);
  useLayoutEffect(() => {
    const el = box.current;
    const pic = picture.current;
    const a = anchor.current;
    anchor.current = null;
    if (!el || !pic || !a) return;
    const to = keepUnder(a, a, { left: pic.offsetLeft, top: pic.offsetTop }, { w: pic.offsetWidth, h: pic.offsetHeight });
    el.scrollLeft = to.left; el.scrollTop = to.top;
  }, [zoom]);

  // A pinch arrives as a wheel with ctrl held, and only a listener that is not
  // passive may keep the window itself from zooming.
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomTo(wheelZoom(zoomNow.current, e.deltaY, floorNow.current), e);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomTo]);

  useEffect(() => {
    if (!onPlace) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(TEXTAREA|INPUT)$/.test((e.target as HTMLElement | null)?.tagName ?? '')) return;
      const el = box.current;
      if (el && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp')) {
        const by = e.key.startsWith('Page') ? el.clientHeight * 0.9 : 80;
        e.preventDefault();
        el.scrollBy({ top: e.key.endsWith('Up') ? -by : by });
      } else if (e.key === '=' || e.key === '+') zoomTo(nextZoom(zoomNow.current, 1, floorNow.current), 'pointer');
      else if (e.key === '-') zoomTo(nextZoom(zoomNow.current, -1, floorNow.current), 'pointer');
      else if (e.key === '0') zoomTo(1, 'pointer');
      else if (e.key === '1') zoomTo(realZoom(fitNow.current), 'pointer');
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onPlace, zoomTo]);

  useEffect(() => {
    const el = box.current;
    const pic = picture.current;
    if (!go || go.place.kind !== 'pin' || !el || !pic || (zoom === 1 && !tall)) return;
    el.scrollTo({ left: pic.offsetLeft + go.place.x * pic.offsetWidth - el.clientWidth / 2, top: pic.offsetTop + go.place.y * pic.offsetHeight - el.clientHeight / 2, behavior: 'smooth' });
  }, [go?.at]);

  useEffect(() => { if (natural.w > 0) onFound?.('open'); }, [natural.w > 0]);
  const [late, setLate] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setLate(true), OPEN_WITHIN_MS); return () => clearTimeout(timer); }, [url]);

  if (late && natural.w === 0) {
    return <div className="doc-missing" role="alert"><span>{didNotOpen(name)}</span> <button type="button" className="av-btn" onClick={onAgain}>Try again</button></div>;
  }
  if (failed) return <div className="doc-missing">{name} could not be opened.</div>;
  const pins = pinsToDraw(notes, carried, activeId, { resolved: showResolved, keep });
  const pinNumber = notes.filter((n) => pinned(n.place)).length + 1;
  // From the fitted size, or a label near the edge jumps sides as the picture zooms.
  const atFit = { w: natural.w * fit, h: natural.h * fit };
  return <div className="av-picture-wrap">
    <div ref={box} className={`av-picture-box${zoom > 1 ? ' is-zoomed' : ''}${tall ? ' is-tall' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('.av-pin')) return;
        drag.current = { x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop };
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        const b = e.currentTarget.getBoundingClientRect();
        pointerAt.current = { x: e.clientX - b.left, y: e.clientY - b.top };
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!dragged.current && (zoom > 1 || tall) && Math.abs(dx) + Math.abs(dy) > 4) {
          dragged.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (dragged.current) { e.currentTarget.scrollLeft = d.left - dx; e.currentTarget.scrollTop = d.top - dy; }
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { pointerAt.current = null; }}
      onPointerCancel={() => { drag.current = null; }}>
      <div ref={picture} className={`av-picture${onPlace ? ' can-pin' : ''}`} style={{ width: shown.w || undefined, height: shown.h || undefined }}
        onClick={onPlace ? (e) => {
          if (dragged.current) { dragged.current = false; return; }
          if ((e.target as HTMLElement).closest('.av-pin')) return;
          onPlace({ kind: 'pin', ...spotIn(e.currentTarget, e) });
        } : undefined}>
        <img src={url} alt={name} crossOrigin="anonymous" draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={() => { setFailed(true); onFound?.('gone'); }} />
        {natural.w > 0 && <PinMarks pins={pins} draft={draft?.kind === 'pin' ? draft : null} draftLabel={String(pinNumber)} size={atFit} onPick={onPick} />}
      </div>
    </div>
    {natural.w > 0 && (
      <div className="av-zoom file-pager" role="group" aria-label="Zoom">
        <button type="button" className="file-pager-step" aria-label="Zoom out" title="Zoom out (-)" disabled={zoom <= floor + 0.001} onClick={() => zoomTo(nextZoom(zoom, -1, floor))}><ZoomGlyph /></button>
        <button type="button" className="file-pager-count av-zoom-fit" title="Fit (0), real size (1)" onClick={() => zoomTo(1)}>{zoomWords(fit, zoom)}</button>
        <button type="button" className="file-pager-step" aria-label="Zoom in" title="Zoom in (+)" disabled={zoom >= MAX_ZOOM} onClick={() => zoomTo(nextZoom(zoom, 1))}><ZoomGlyph plus /></button>
      </div>
    )}
  </div>;
}

// Parsing a long document takes tens of milliseconds, and the view around it redraws on every keystroke and update.
const MarkdownBody = memo(({ text, parts }: { text: string; parts: ReturnType<typeof partsFor> }) => (
  <ReactMarkdown remarkPlugins={MD_PLUGINS} components={parts}>{text}</ReactMarkdown>
));

function DocStage({ product, path, name, folder, byline, notes, draft, activeId, go, onPlace, onPick, onFound, onQuotesGone, readText, onAgain }: {
  onAgain: () => void;
  product: string; path: string; name: string; folder: string | null; byline?: string | null; notes: FileNote[]; draft: NotePlace | null; activeId: string | null; go: StageGo;
  onPlace?: (place: NotePlace | null) => void; onPick?: (id: string) => void; onFound?: (found: Found) => void;
  onQuotesGone?: (ids: string[]) => void;
  readText?: (path: string) => Promise<string | null>;
}) {
  const thread = useContext(StageThread);
  const parts = useMemo(() => partsFor(folder), [folder]);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const page = useRef<HTMLDivElement | null>(null);
  const ranges = useRef(new Map<string, Range>());
  useEffect(() => {
    let live = true;
    setText(null); setFailed(false);
    const reading = readText
      ? readText(path).then((text) => ({ ok: typeof text === 'string', text }))
      : api.readDoc({ product, src: path, thread });
    void reading.then((r) => {
      if (!live) return;
      if (r.ok && typeof r.text === 'string') setText(r.text); else setFailed(true);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [product, path]);
  useEffect(() => { if (failed) onFound?.('gone'); }, [failed]);
  const quotes = useMemo(() => notes.flatMap((n) => (n.place.kind === 'quote' && !n.resolved ? [{ id: n.id, text: n.place.text }] : [])), [notes]);
  const draftQuote = draft?.kind === 'quote' ? draft.text : null;
  // `notes` is a new list on every redraw; painting walks every word of the page.
  const quotesNow = quotesKey(quotes);
  useEffect(() => {
    ranges.current = paintQuotes(page.current, quotes, activeId, draftQuote);
    if (text !== null && canPaintQuotes()) onQuotesGone?.(quotes.filter((q) => !ranges.current.has(q.id)).map((q) => q.id));
    return () => {
      const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
      highlights?.delete('av-quote'); highlights?.delete('av-quote-on');
    };
  }, [text, quotesNow, activeId, draftQuote]);
  useEffect(() => {
    if (!go || go.place.kind !== 'quote') return;
    const hit = findQuote(page.current?.innerText ?? '', go.place.text);
    if (!hit) return;
    const range = [...ranges.current.values()].find((r) => r.toString().replace(/\s+/g, ' ').trim() === (go.place as { text: string }).text.replace(/\s+/g, ' ').trim());
    const rect = range?.getBoundingClientRect();
    const scroller = page.current?.closest('.av-doc-scroll');
    if (rect && scroller) scroller.scrollBy({ top: rect.top - scroller.getBoundingClientRect().top - scroller.clientHeight / 3 });
  }, [go?.at]);
  if (failed) return <div className="doc-missing">{name} could not be opened.</div>;
  if (text === null) return <OpeningWait name={name} kind="markdown" onAgain={onAgain} />;
  return <div className="av-doc-scroll doc-scroll" ref={setScroller}>
   <div className="doc-sheet">
   <div className="doc-column" ref={setColumn}>
    {byline && <p className="doc-byline">{byline}</p>}
    <div ref={page} className="av-doc doc-prose"
      onClick={(e) => {
        // The end of a drag over a comment's words is not a press on that comment.
        if (window.getSelection()?.isCollapsed === false) return;
        const caret = document.caretRangeFromPoint?.(e.clientX, e.clientY);
        if (!caret) return;
        for (const [id, range] of ranges.current) {
          if (range.isPointInRange(caret.startContainer, caret.startOffset)) { onPick?.(id); return; }
        }
      }}>
      <MarkdownBody text={text} parts={parts} />
    </div>
    {onPlace && <SelectionBar page={page} onComment={(quote) => onPlace({ kind: 'quote', text: quote })} />}
   </div>
   <DocOutline scroller={scroller} page={column} />
   </div>
  </div>;
}

const PinGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="7" r="2.2" /><path d="M8 9.2V14M3.5 7a4.5 4.5 0 0 1 9 0" />
  </svg>
);

/** The page's own address, asking it to say how tall it is. */
const wholePage = (url: string) => {
  const u = new URL(url);
  u.searchParams.set('agentbox-height', '1');
  return u.href;
};

/**
 * A page an agent made, in a frame of its own. Its clicks are its own, so a pin
 * goes on while Pin a spot is on. Under its own address the frame is as tall as
 * the page and the box scrolls, so a pin stays on its spot.
 */
function PageStage({ url, path, name, product, readText, onFound, notes, carried, draft, activeId, showResolved, keep, onPlace, onPick }: {
  url: string | null; path: string; name: string; product: string;
  readText?: (path: string) => Promise<string | null>; onFound?: (found: Found) => void;
  notes: FileNote[]; carried: FileNote[]; draft: NotePlace | null; activeId: string | null; showResolved?: boolean; keep?: string | null;
  onPlace?: (place: NotePlace | null) => void; onPick?: (id: string) => void;
}) {
  const thread = useContext(StageThread);
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [pinning, setPinning] = useState(false);
  const [height, setHeight] = useState<number | null>(null);
  const [sheet, setSheet] = useState({ w: 0, h: 0 });
  const frame = useRef<HTMLIFrameElement | null>(null);
  const holder = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (url) return undefined;
    let live = true;
    const reading = readText ? readText(path) : api.readDoc({ product, src: path, thread }).then((r) => (r.ok ? r.text ?? null : null));
    void reading.then((t) => { if (live) { setText(t); if (t === null) onFound?.('gone'); } }).catch(() => { if (live) { setText(null); onFound?.('gone'); } });
    return () => { live = false; };
  }, [url, path, product]);
  useEffect(() => {
    if (!url) return undefined;
    const hear = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.type !== 'agentbox-document-height') return;
      const h = e.data.height;
      if (typeof h === 'number' && Number.isFinite(h) && h > 0 && h <= 1_000_000) setHeight(Math.ceil(h));
    };
    window.addEventListener('message', hear);
    return () => window.removeEventListener('message', hear);
  }, [url]);
  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const measure = () => setSheet({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, [text, url]);
  if (!url && text === null) return <div className="doc-missing">{name} could not be opened.</div>;
  if (!url && text === undefined) return <OpeningWait name={name} kind={null} />;
  const pins = pinsToDraw(notes, carried, activeId, { resolved: showResolved, keep });
  return <div className="av-page-wrap">
    <div className={`av-page${height ? ' is-whole' : ''}${pinning ? ' is-pinning' : ''}`}>
    <div ref={holder} className="av-page-sheet" style={height ? { height } : undefined}>
      {/* Under its own address a page's origin is its own, and its pictures beside it load. */}
      {url
        ? <iframe ref={frame} title={name} src={wholePage(url)} sandbox="allow-scripts allow-same-origin" scrolling={height ? 'no' : 'auto'} />
        : <iframe ref={frame} title={name} srcDoc={text ?? ''} sandbox="allow-scripts" />}
      {pinning && onPlace && <div className="av-page-catch" onClick={(e) => onPlace({ kind: 'pin', ...spotIn(e.currentTarget, e) })} />}
      <div className="av-page-pins">
        <PinMarks pins={pins} draft={draft?.kind === 'pin' ? draft : null} draftLabel={String(notes.filter((n) => pinned(n.place)).length + 1)} size={sheet} onPick={onPick} />
      </div>
    </div>
    </div>
    {onPlace && (
      <div className="av-zoom file-pager" role="group" aria-label="Pins">
        <button type="button" className={`av-pin-mode${pinning ? ' is-on' : ''}`} aria-pressed={pinning} onClick={() => setPinning(!pinning)}
          title="Pin a spot on the page">
          <PinGlyph />{pinning ? 'Click a spot' : 'Pin a spot'}
        </button>
      </div>
    )}
  </div>;
}

/** A script with its colours and line numbers. Selected words take a comment, as in a document. */
function CodeStage({ product, path, name, notes, draft, activeId, onPlace, onFound, readText, onAgain }: {
  product: string; path: string; name: string; notes: FileNote[]; draft: NotePlace | null; activeId: string | null;
  onPlace?: (place: NotePlace | null) => void; onFound?: (found: Found) => void; readText?: (path: string) => Promise<string | null>; onAgain: () => void;
}) {
  const thread = useContext(StageThread);
  const [text, setText] = useState<string | null | undefined>(undefined);
  const page = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let live = true;
    setText(undefined);
    const reading = readText ? readText(path) : api.readDoc({ product, src: path, thread }).then((r) => (r.ok ? r.text ?? null : null));
    void reading.then((t) => { if (live) { setText(t); if (t === null) onFound?.('gone'); } }).catch(() => { if (live) { setText(null); onFound?.('gone'); } });
    return () => { live = false; };
  }, [product, path]);
  const quotes = useMemo(() => notes.flatMap((n) => (n.place.kind === 'quote' && !n.resolved ? [{ id: n.id, text: n.place.text }] : [])), [notes]);
  const draftQuote = draft?.kind === 'quote' ? draft.text : null;
  const quotesNow = quotesKey(quotes);
  useEffect(() => {
    paintQuotes(page.current, quotes, activeId, draftQuote);
    return () => {
      const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
      highlights?.delete('av-quote'); highlights?.delete('av-quote-on');
    };
  }, [text, quotesNow, activeId, draftQuote]);
  if (text === null) return <div className="doc-missing">{name} could not be opened.</div>;
  if (text === undefined) return <OpeningWait name={name} kind={null} onAgain={onAgain} />;
  return <div className="av-code-scroll"><div className="av-code-sheet">
    <CodeFile ref={page} text={text} />
    {onPlace && <SelectionBar page={page} onComment={(quote) => onPlace({ kind: 'quote', text: quote })} />}
  </div></div>;
}

// Keyed by its tries, so Try again starts every wait in it over.
export function ArtifactStage(props: StageProps) {
  const [tries, setTries] = useState(0);
  return <OpenedFile key={tries} {...props} onAgain={() => setTries((n) => n + 1)} />;
}

function OpenedFile({ product, path, name, byline, notes, carried = [], draft, activeId, go, hold, showResolved, keep, onPlace, onPick, onHere, onFound, onQuotesGone, onOutside, files, missingSays, onAgain }: StageProps & { onAgain: () => void }) {
  const found = useResolved(product, path, files);
  const kind = viewKind(path);
  const opened = found?.opened ?? null;
  const commented = useMemo(() => marksOnPages([...notes, ...carried]), [notes, carried]);
  const url = opened ? pictureUrl(opened) : null;
  const bytes = useCallback(async () => {
    const res = await fetch(fetchableFileUrl(url as string));
    if (!res.ok) throw new Error(`${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }, [url]);
  const [word, setWord] = useState<'Slide' | undefined>(undefined);
  const wordNow = useRef<'Slide' | undefined>(undefined);
  wordNow.current = word;
  const onShape = useCallback((wide: boolean) => setWord(wide || /deck|slides|pitch|presentation/i.test(name) ? 'Slide' : undefined), [name]);
  const onPage = useCallback((n: number) => onHere?.({ kind: 'page', n, ...(wordNow.current ? { word: wordNow.current } : {}) }), [onHere]);
  useEffect(() => { if (kind === 'pdf' || kind === 'deck') onHere?.({ kind: 'page', n: 1, ...(kind === 'deck' || word ? { word: 'Slide' as const } : {}) }); }, [word, url]);
  // A picture says it is open itself, once it has drawn.
  const state: Found = !found ? 'looking' : opened ? 'open' : found.coming ? 'coming' : 'gone';
  useEffect(() => { if (state !== 'open' || (kind !== 'image' && kind !== 'film')) onFound?.(state); }, [state, kind]);

  if (!found) return <OpeningWait name={name} kind={kind} onAgain={onAgain} />;
  if (!opened) {
    return <div className="doc-missing">{found.coming ? `${name} is on its way.` : missingSays ? `${name}: ${missingSays}` : `${name} could not be found.`}</div>;
  }
  if (kind === 'image') return <PictureStage url={url as string} name={name} notes={notes} carried={carried} draft={draft} activeId={activeId} go={go} showResolved={showResolved} keep={keep} onPlace={onPlace} onPick={onPick} onFound={onFound} onAgain={onAgain} />;
  if (kind === 'film') {
    return <FilmPlayer key={url} url={url as string} name={name} hold={hold} onAgain={onAgain}
      seek={go?.place.kind === 'time' ? { s: go.place.s, at: go.at } : null}
      marks={filmMarks(notes, carried, activeId)}
      pins={filmPins(notes, carried, activeId, { resolved: showResolved, keep })}
      draft={hasSpot(draft) ? { x: draft.x, y: draft.y, label: String(notes.filter((n) => hasSpot(n.place)).length + 1) } : null}
      onSpot={onPlace ? (spot) => onPlace({ kind: 'time', ...spot }) : undefined}
      onMark={onPick}
      onFound={onFound}
      onOutside={onOutside}
      onTime={(s) => onHere?.({ kind: 'time', s })} />;
  }
  // A slide or a page takes a spot as well as its number, numbered with the file's other pins.
  const pageWord = kind === 'deck' ? 'Slide' as const : word;
  const onPageSpot = onPlace ? (n: number, spot: { x: number; y: number }) => onPlace({ kind: 'page', n, ...(pageWord ? { word: pageWord } : {}), ...spot }) : undefined;
  const pinsOnPage = (n: number, size: { w: number; h: number }) => (
    <PinMarks pins={pagePins(notes, carried, activeId, n, { resolved: showResolved, keep })}
      draft={pageSpot(draft) && draft.n === n ? draft : null} draftLabel={String(notes.filter((x) => pinned(x.place)).length + 1)} size={size} onPick={onPick} />
  );
  if (kind === 'pdf') {
    return <PdfPages load={bytes} name={name} fit word={word ?? 'Page'} onShape={onShape} onPage={onPage} commented={commented}
      goTo={go?.place.kind === 'page' ? { n: go.place.n, at: go.at } : null} onSpot={onPageSpot} pins={pinsOnPage} />;
  }
  if (kind === 'deck') {
    return <DeckSlides load={bytes} name={name} onPage={(n) => onHere?.({ kind: 'page', n, word: 'Slide' })} commented={commented}
      goTo={go?.place.kind === 'page' ? { n: go.place.n, at: go.at } : null} onSpot={onPageSpot} pins={pinsOnPage} />;
  }
  if (kind === 'markdown') return <DocStage product={product} path={path} name={name} folder={opened.replace(/\/[^/]*$/, '')} byline={byline} notes={[...notes, ...carried]} draft={draft} activeId={activeId} go={go} onPlace={onPlace} onPick={onPick} onFound={onFound} onQuotesGone={onQuotesGone} readText={files?.readText} onAgain={onAgain} />;
  if (kind === 'page') {
    return <PageStage url={found.url} path={path} name={name} product={product} readText={files?.readText} onFound={onFound}
      notes={notes} carried={carried} draft={draft} activeId={activeId} showResolved={showResolved} keep={keep} onPlace={onPlace} onPick={onPick} />;
  }
  if (kind === 'code') return <CodeStage product={product} path={path} name={name} notes={[...notes, ...carried]} draft={draft} activeId={activeId} onPlace={onPlace} onFound={onFound} readText={files?.readText} onAgain={onAgain} />;
  return <div className="doc-missing">{name} cannot be shown here.</div>;
}
