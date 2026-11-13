// THE TEAMMATE AUTO OFFERS FOR THIS KIND OF WORK, as a card under the newest
// answer (designs/w-bb45118b10/teammate-card-1-hire-card-v2.png). Its words are
// in ../teammate-offer.ts.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { drawSky, skyTheme } from '../home/sky';
import { useHomeSettings } from '../home/home-settings';
import { aRole, chooseFold, foldChosen, markSeen, offerCard, seenBefore, startsFolded } from '../teammate-offer';
import type { WorkItem } from '../types';
import './teammate-offer.css';

const Tick = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>;
const Chevron = ({ up }: { up: boolean }) => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} /></svg>;

/** The window's sky, cropped the way the inbox wears it. A plain look still gets the default sky. */
function Sky() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { skyTheme: worn } = useHomeSettings();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dark = document.documentElement.dataset.theme !== 'light';
    const art = (skyTheme(worn) ?? skyTheme(dark ? 'ember' : 'sage'))!.art;
    const paint = () => drawSky(canvas, art, { from: 0, span: 6, dpr: Math.min(2, window.devicePixelRatio || 1) });
    paint();
    let width = canvas.clientWidth;
    const watch = new ResizeObserver(() => { if (canvas.clientWidth !== width) { width = canvas.clientWidth; paint(); } });
    watch.observe(canvas);
    return () => watch.disconnect();
  }, [worn]);
  return <div className="to-sky" aria-hidden="true"><canvas ref={ref} /></div>;
}

/** Marks the card seen once most of it has been on screen for a moment, so the next visit opens it folded. */
function useSeen(item: WorkItem, live: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !live || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const watch = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) timer ??= setTimeout(() => { markSeen(item); watch.disconnect(); }, 1500);
      else if (timer) { clearTimeout(timer); timer = null; }
    }, { threshold: 0.5 });
    watch.observe(el);
    return () => { watch.disconnect(); if (timer) clearTimeout(timer); };
  }, [item.product, item.id, live]);
  return ref;
}

export function TeammateOffer({ item }: { item: WorkItem }) {
  const [pressed, setPressed] = useState<'made' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Decided once per visit, so the card never folds itself while you read it.
  const [folded, setFolded] = useState(() => startsFolded({ choice: foldChosen(item), seen: seenBefore(item) }));
  const offer = item.routed?.offer;
  const answered = pressed ?? offer?.answered;
  const seenRef = useSeen(item, !!offer && !answered && !folded);
  if (!offer) return null;
  const card = offerCard(offer);
  if (answered === 'made') {
    return <p className="to-made"><span className="to-face to-face-small">{card.letter}</span>You made {aRole(offer.role)} for work like this.</p>;
  }
  if (answered === 'no' && !error) return null;
  const answer = (make: boolean) => {
    setError(null);
    setPressed(make ? 'made' : 'no');
    api.answerRouteOffer({ product: item.product, id: item.id, make }).catch((e) => { setPressed(null); setError(String(e?.message ?? e)); });
  };
  const fold = (to: boolean) => { setFolded(to); chooseFold(item, to); };
  if (folded) {
    return <button type="button" className="to-bar" onClick={() => fold(false)} aria-expanded="false">
      <span className="to-face to-face-small">{card.letter}</span>
      <span className="to-bar-head">{card.headline}</span>
      <span className="to-fold"><Chevron up={false} /></span>
    </button>;
  }
  return <section ref={seenRef} className="to-card" aria-label={card.headline}>
    <Sky />
    <button type="button" className="to-fold to-fold-open" onClick={() => fold(true)} aria-expanded="true" aria-label="Fold this away" title="Fold this away"><Chevron up /></button>
    <span className="to-face">{card.letter}</span>
    <div className="to-body">
      {/* Divs, not h3/ul: the answer's own heading and list styles would win. */}
      <div className="to-head" role="heading" aria-level={3}>{card.headline}</div>
      <div className="to-why">{card.why}</div>
      <div className="to-gains" role="list">
        {card.gains.map((g) => <div key={g} className="to-gain" role="listitem"><span className="to-tick"><Tick /></span>{g}</div>)}
      </div>
      <div className="to-acts">
        <button type="button" className="to-make" onClick={() => answer(true)}>{card.make}</button>
        <button type="button" className="to-no" onClick={() => answer(false)}>Not now</button>
      </div>
      {error && <p className="to-error">{error}</p>}
    </div>
  </section>;
}
