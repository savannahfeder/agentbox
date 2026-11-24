// THE COLUMN BESIDE THE FRAMED APP while the walkthrough runs: how far through
// you are, a way back when you have left its pages, and Skip at the foot. It
// says nothing the tips say. ./tour-frame.css insets the app beside it.
import { useEffect, useState } from 'react';
import type { Lesson } from '../tour';
import { walkPlace } from '../setup-split';
import { Name } from '../../../shared/product-name.mjs';
import { Mark } from './SetupSplit';
import './tour-frame.css';

const AWAY_MS = 300;

export function TourFrame({ done, now, finished = false, away = false, onBack, onSkip }: {
  done: readonly Lesson[];
  now: Lesson | null;
  finished?: boolean;
  /** On a page the walkthrough has no tip on (tour.ts awayFromWalk). */
  away?: boolean;
  onBack: () => void;
  onSkip: () => void;
}) {
  const { at, of } = walkPlace(done, now);
  // Closing the practice thread reads as leaving it for one render, so Back waits until you have stayed away.
  const [stayed, setStayed] = useState(away);
  useEffect(() => {
    if (!away) { setStayed(false); return undefined; }
    const t = setTimeout(() => setStayed(true), AWAY_MS);
    return () => clearTimeout(t);
  }, [away]);
  return (
    <aside className={`tour-frame${finished ? ' tf-done' : ''}`} aria-label="Walkthrough">
      <div className="tf-brand"><Mark />{Name}</div>
      <div className="tf-body">
        <div className="tf-steps" aria-hidden="true">
          {Array.from({ length: of }, (_, i) => <i key={i} className={finished || i === at - 1 ? 'tf-is' : i < at - 1 ? 'tf-was' : ''} />)}
        </div>
        <h2 className="tf-place"><b>Walkthrough</b>{finished ? 'Done' : `${at} of ${of}`}</h2>
        {away && stayed && !finished && <button type="button" className="tf-back" onClick={onBack}>Back to the walkthrough</button>}
      </div>
      <button type="button" className="tf-skip" onClick={onSkip}>{finished ? <>Close <kbd className="tf-key">↵</kbd></> : 'Skip walkthrough'}</button>
    </aside>
  );
}
