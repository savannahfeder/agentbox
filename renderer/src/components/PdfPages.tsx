// A deck, drawn page by page. Hands the page in view to whoever holds it, and
// takes its bytes from anywhere, so it knows nothing about threads or files.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { stripFor } from '../artifact-pins';
import { FilePager } from './FilePager';
import { spotIn } from './PinMarks';
import './file-views.css';

/** A slide in the strip, as wide as the deck view draws its own. */
const THUMB = 104;

export type Pdf = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: unknown; transform?: number[] }) => { promise: Promise<void>; cancel: () => void };
};

type Opened = { promise: Promise<unknown>; destroy: () => Promise<void> };

export async function openPdf(data: Uint8Array): Promise<Opened> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({ data }) as unknown as Opened;
}

export function Page({ pdf, n, width, onCanvas, onSpot, over }: {
  pdf: Pdf; n: number; width: number; onCanvas?: (n: number, el: HTMLElement) => void;
  onSpot?: (n: number, spot: { x: number; y: number }) => void;
  /** Drawn over the page, such as its pins. */
  over?: ReactNode;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (box.current) onCanvas?.(n, box.current);
  }, [n, onCanvas]);
  useEffect(() => {
    let live = true;
    let job: { cancel: () => void } | null = null;
    void pdf.getPage(n).then((page) => {
      const el = canvas.current;
      const ctx = el?.getContext('2d');
      if (!live || !el || !ctx || width <= 0) return;
      const scale = width / page.getViewport({ scale: 1 }).width;
      const shown = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(shown.width * dpr);
      el.height = Math.round(shown.height * dpr);
      el.style.width = `${shown.width}px`;
      el.style.height = `${shown.height}px`;
      const task = page.render({ canvasContext: ctx, canvas: el, viewport: shown, transform: [dpr, 0, 0, dpr, 0, 0] });
      job = task;
      task.promise.catch(() => { /* a cancelled draw; the next one takes over */ });
    });
    return () => { live = false; job?.cancel(); };
  }, [pdf, n, width]);
  return <div className={`pdf-page${onSpot ? ' can-pin' : ''}`} ref={box} data-page={n}
    onClick={onSpot ? (e) => { if (!(e.target as HTMLElement).closest('.av-pin')) onSpot?.(n, spotIn(e.currentTarget, e)); } : undefined}>
    <canvas ref={canvas} aria-label={`Page ${n}`} />
    {over}
  </div>;
}

export function PdfPages({ load, name, onPage, onShape, goTo, fit = false, word = 'Page', commented, children, onSpot, pins }: {
  word?: string;
  /** A click on a page, as a spot on it. */
  onSpot?: (n: number, spot: { x: number; y: number }) => void;
  /** What is drawn over page `n` at its size on screen. */
  pins?: (n: number, size: { w: number; h: number }) => ReactNode;
  /** How many open comments each page has, marked in the strip. */
  commented?: Map<number, number>;
  /** Each page whole on screen, as a slide is reviewed, not as wide as the pane. */
  fit?: boolean;
  load: () => Promise<Uint8Array>;
  name: string;
  onPage?: (page: number) => void;
  /** Wider than tall, which is what makes a page a slide. */
  onShape?: (landscape: boolean) => void;
  /** Go to this page; `at` makes pressing the same comment twice go twice. */
  goTo?: { n: number; at: number } | null;
  // Drawn over the pages, for whatever a later layer wants to pin to them.
  children?: ReactNode;
}) {
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState(1);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [aspect, setAspect] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);
  const pages = useRef(new Map<number, HTMLElement>());

  useEffect(() => {
    let live = true;
    let task: Opened | null = null;
    setPdf(null); setFailed(false); setAt(1);
    load().then(openPdf).then(async (opened) => {
      if (!live) { void opened.destroy(); return; }
      task = opened;
      const doc = (await opened.promise) as Pdf;
      if (live) setPdf(doc);
      const first = await doc.getPage(1);
      const shape = first.getViewport({ scale: 1 });
      if (live) { setAspect(shape.width / shape.height); onShape?.(shape.width > shape.height); }
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; void task?.destroy(); };
  }, [load]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      setHeight(el.clientHeight);
      setWidth(fit && aspect
        ? Math.max(0, Math.min(el.clientWidth - 104, (el.clientHeight - 112) * aspect))
        : Math.max(0, el.clientWidth - 48));
    };
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, [pdf, fit, aspect]);

  const go = (n: number) => {
    if (!pdf) return;
    const page = Math.min(pdf.numPages, Math.max(1, n));
    pages.current.get(page)?.scrollIntoView({ block: fit ? 'center' : 'start' });
    setAt(page);
    onPage?.(page);
  };

  useEffect(() => {
    if (goTo && pdf) requestAnimationFrame(() => go(goTo.n));
  }, [goTo?.at, !!pdf, width > 0]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + el.clientHeight / 3;
    for (const [n, page] of pages.current) {
      const box = page.getBoundingClientRect();
      if (box.top <= top && box.bottom >= top) { if (n !== at) { setAt(n); onPage?.(n); } return; }
    }
  };

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(at + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(at - 1); }
  };

  useEffect(() => { strip.current?.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [at]);

  if (failed) return <div className="doc-missing">{name} could not be drawn. The file may be damaged.</div>;
  const strips = !!pdf && aspect > 0 && stripFor({ fit, landscape: aspect > 1, count: pdf.numPages });
  // A standing page is held to the height a slide's thumbnail has.
  const thumb = aspect > 1 ? THUMB : Math.round((THUMB / (16 / 9)) * aspect);
  return <div className="pdf-view" tabIndex={0} onKeyDown={keys} aria-label={name}>
    <div className="pdf-stage">
      <FilePager at={at} count={pdf ? pdf.numPages : null} word={word} onGo={go} />
      <div className={`pdf-pages${fit ? ' is-fit' : ''}`} ref={scroller} onScroll={onScroll}
        // A slide fills the screen on its own: the air around it is whatever the page leaves.
        style={fit && aspect && width ? { '--pdf-gap': `${Math.max(24, (height - width / aspect) / 2)}px` } as React.CSSProperties : undefined}>
        {pdf && Array.from({ length: pdf.numPages }, (_, i) => (
          <Page key={i + 1} pdf={pdf} n={i + 1} width={width} onCanvas={(n, el) => { pages.current.set(n, el); }}
            onSpot={onSpot} over={aspect ? pins?.(i + 1, { w: width, h: width / aspect }) : null} />
        ))}
        {children}
      </div>
    </div>
    {strips && (
      <div ref={strip} className="deck-strip" aria-label={`Every ${word.toLowerCase()}`}>
        {Array.from({ length: pdf.numPages }, (_, i) => (
          <button key={i} type="button" className={`deck-thumb${i + 1 === at ? ' is-on' : ''}`} aria-label={`${word} ${i + 1}`} aria-current={i + 1 === at ? 'page' : undefined} onClick={() => go(i + 1)}>
            <span className="deck-slide is-small pdf-thumb" style={{ width: thumb, height: thumb / aspect }}><Page pdf={pdf} n={i + 1} width={thumb} /></span>
            <span className="deck-thumb-n">{i + 1}{commented?.has(i + 1) && <i aria-label={`${commented.get(i + 1)} open`} />}</span>
          </button>
        ))}
      </div>
    )}
  </div>;
}
