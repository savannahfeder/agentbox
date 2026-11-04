// The face of a file's tile, drawn from the file itself: a deck's first slide,
// a PDF's first page, a film's opening frame, a picture. Each says how long it
// is (`onSize`) so the tile can put it under the face.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readDeck, type Deck } from '../../../shared/pptx-slides.mjs';
import { coverFit, coverPageWidth } from '../artifact-pins';
import { useFilmPoster } from '../film-poster';
import { fetchableFileUrl } from '../phone-files';
import { pictureUrl } from '../picture';
import { inflate, SlideFace } from './DeckSlides';
import { openPdf, Page, type Pdf } from './PdfPages';

const COVER_WIDTH = 220;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function bytesOf(opened: string) {
  const res = await fetch(fetchableFileUrl(pictureUrl(opened)));
  if (!res.ok) throw new Error(`${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function DeckCover({ opened, onSize }: { opened: string; onSize: (words: string) => void }) {
  const [deck, setDeck] = useState<Deck | null>(null);
  useEffect(() => {
    let live = true;
    bytesOf(opened).then((b) => readDeck(b, inflate)).then((d) => {
      if (!live) return;
      setDeck(d);
      onSize(plural(d.slides.length, 'slide'));
    }).catch(() => {});
    return () => { live = false; };
  }, [opened]);
  return deck ? <SlideFace deck={deck} n={1} width={COVER_WIDTH} className="deck-slide is-small" /> : null;
}

function PdfCover({ opened, onSize }: { opened: string; onSize: (words: string) => void }) {
  const [pdf, setPdf] = useState<Pdf | null>(null);
  useEffect(() => {
    let live = true;
    let task: Awaited<ReturnType<typeof openPdf>> | null = null;
    bytesOf(opened).then(openPdf).then(async (t) => {
      task = t;
      const doc = (await t.promise) as Pdf;
      if (!live) return;
      setPdf(doc);
      onSize(plural(doc.numPages, 'page'));
    }).catch(() => {});
    return () => { live = false; void task?.destroy(); };
  }, [opened]);
  const [aspect, setAspect] = useState(0);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const here = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    let live = true;
    void pdf?.getPage(1).then((p) => { const v = p.getViewport({ scale: 1 }); if (live) setAspect(v.width / v.height); });
    return () => { live = false; };
  }, [pdf]);
  useLayoutEffect(() => {
    const face = here.current?.parentElement;
    if (face) setBox({ w: face.clientWidth, h: face.clientHeight });
  }, []);
  const width = aspect ? coverPageWidth(box, aspect) : 0;
  return <span ref={here} className="file-cover-page">{pdf && width > 0 && <Page pdf={pdf} n={1} width={width} />}</span>;
}

function FilmCover({ opened, onSize }: { opened: string; onSize: (words: string) => void }) {
  const poster = useFilmPoster(pictureUrl(opened));
  useEffect(() => { if (poster?.length) onSize(clock(poster.length)); }, [poster?.length]);
  return <>
    {poster?.image && <img className="file-cover-film" src={poster.image} alt="" draggable={false} />}
    {/* Frames that could not be read: a moment in, since the very first is so often blank. */}
    {poster && !poster.image && <video className="file-cover-film" src={`${pictureUrl(opened)}#t=1`} preload="metadata" muted playsInline tabIndex={-1}
      onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) onSize(clock(e.currentTarget.duration)); }} />}
    <span className="file-cover-play" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" /></svg>
    </span>
  </>;
}

export type CoverKind = 'deck' | 'pdf' | 'film' | 'image';

export function FileCover({ kind, opened, onSize, onBroken }: { kind: CoverKind; opened: string; onSize: (words: string) => void; onBroken?: () => void }) {
  if (kind === 'deck') return <DeckCover opened={opened} onSize={onSize} />;
  if (kind === 'pdf') return <PdfCover opened={opened} onSize={onSize} />;
  if (kind === 'film') return <FilmCover opened={opened} onSize={onSize} />;
  return <PictureCover opened={opened} onBroken={onBroken} />;
}

function PictureCover({ opened, onBroken }: { opened: string; onBroken?: () => void }) {
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  return <img className="file-cover-picture" src={pictureUrl(opened)} alt="" crossOrigin="anonymous" draggable={false} onError={onBroken} style={fit === 'contain' ? { objectFit: 'contain', objectPosition: 'center' } : undefined}
    onLoad={(e) => {
      const el = e.currentTarget;
      setFit(coverFit({ w: el.naturalWidth, h: el.naturalHeight }, { w: el.clientWidth, h: el.clientHeight }));
    }} />;
}
