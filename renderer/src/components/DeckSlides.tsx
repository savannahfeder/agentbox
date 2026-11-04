// A PowerPoint deck, one slide at a time: its words and pictures where the file
// puts them (shared/pptx-slides.mjs). Hands the slide in view to whoever holds it.
// Every slide also sits small in a strip under it, to see the whole deck and jump.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { readDeck, type Deck } from '../../../shared/pptx-slides.mjs';
import { FilePager } from './FilePager';
import { spotIn } from './PinMarks';
import './file-views.css';

export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function SlidePicture({ deck, file, style }: { deck: Deck; file: string; style: React.CSSProperties }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    void deck.picture(file).then((b) => {
      if (!live || !b) return;
      made = URL.createObjectURL(new Blob([b as BlobPart]));
      setUrl(made);
    });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [deck, file]);
  return url ? <img className="deck-picture" src={url} alt="" style={style} /> : null;
}

const place = (box: { x: number; y: number; w: number; h: number } | null | undefined): React.CSSProperties => (box
  ? { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }
  : { position: 'static' });

/** One slide drawn at a width; the same drawing serves the stage and the strip. */
export function SlideFace({ deck, n, width, className = 'deck-slide' }: { deck: Deck; n: number; width: number; className?: string }) {
  const ratio = deck.size.w / deck.size.h;
  const scale = width / 960;
  const parts = deck.slides[n - 1] ?? [];
  return <div className={className} style={{ width, height: width / ratio }}>
    {parts.map((part, i) => (part.kind === 'picture'
      ? <SlidePicture key={i} deck={deck} file={part.file} style={place(part.box)} />
      : <div key={i} className={`deck-words${part.title ? ' is-title' : ''}`} style={{ ...place(part.box), fontSize: `${(part.title ? 30 : 18) * scale}px` }}>
        {part.paragraphs.map((p, k) => <p key={k} style={p.pt ? { fontSize: `${p.pt * (deck.size.w / 12700 / 960) * scale}px` } : undefined}>{p.text}</p>)}
      </div>))}
  </div>;
}

const THUMB = 104;

export function DeckSlides({ load, name, onPage, goTo, commented, onSpot, pins }: {
  /** How many open comments each slide has, marked in the strip. */
  commented?: Map<number, number>;
  /** A click on the slide in view, as a spot on it. */
  onSpot?: (n: number, spot: { x: number; y: number }) => void;
  /** What is drawn over slide `n` at its size on screen. */
  pins?: (n: number, size: { w: number; h: number }) => ReactNode;
  load: () => Promise<Uint8Array>;
  name: string;
  onPage?: (n: number) => void;
  goTo?: { n: number; at: number } | null;
}) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState(1);
  const [fit, setFit] = useState({ w: 0, h: 0 });
  const stage = useRef<HTMLDivElement | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let live = true;
    setDeck(null); setFailed(false); setAt(1);
    load().then((b) => readDeck(b, inflate)).then((d) => { if (live) setDeck(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [load]);
  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const measure = () => setFit({ w: el.clientWidth - 112, h: el.clientHeight - 88 });
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, [deck]);
  const go = (n: number) => {
    if (!deck) return;
    const to = Math.min(deck.slides.length, Math.max(1, n));
    setAt(to);
    onPage?.(to);
  };
  useEffect(() => { if (goTo && deck) go(goTo.n); }, [goTo?.at, !!deck]);
  useEffect(() => { strip.current?.querySelector('.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [at]);
  if (failed) return <div className="doc-missing">{name} could not be read.</div>;
  const count = deck?.slides.length ?? 0;
  const ratio = deck ? deck.size.w / deck.size.h : 16 / 9;
  const width = Math.max(0, Math.min(fit.w, fit.h * ratio));
  return <div className="pdf-view deck-view" tabIndex={0} aria-label={name}
    onKeyDown={(e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(at + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(at - 1); }
    }}>
    <div ref={stage} className="deck-stage">
      {deck && deck.slides[at - 1] && (
        <div className={`deck-pin-box${onSpot ? ' can-pin' : ''}`} style={{ width, height: width / ratio }}
          onClick={onSpot ? (e) => { if (!(e.target as HTMLElement).closest('.av-pin')) onSpot?.(at, spotIn(e.currentTarget, e)); } : undefined}>
          <SlideFace deck={deck} n={at} width={width} />
          {pins?.(at, { w: width, h: width / ratio })}
        </div>
      )}
      <FilePager at={at} count={deck ? count : null} word="Slide" onGo={go} />
    </div>
    {deck && count > 1 && (
      <div ref={strip} className="deck-strip" aria-label="Every slide">
        {deck.slides.map((_, i) => (
          <button key={i} type="button" className={`deck-thumb${i + 1 === at ? ' is-on' : ''}`} aria-label={`Slide ${i + 1}`} aria-current={i + 1 === at ? 'page' : undefined} onClick={() => go(i + 1)}>
            <SlideFace deck={deck} n={i + 1} width={THUMB} className="deck-slide is-small" />
            <span className="deck-thumb-n">{i + 1}{commented?.has(i + 1) && <i aria-label={`${commented.get(i + 1)} open`} />}</span>
          </button>
        ))}
      </div>
    )}
  </div>;
}
