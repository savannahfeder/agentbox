// THE BAR ABOVE THE FRAMED APP while the walkthrough runs: the setup's step
// dashes, how far through you are, and Skip. ./tour-frame.css insets the app.
import type { Lesson } from '../tour';
import { walkPlace } from '../setup-split';
import './tour-frame.css';

export function TourFrame({ done, now, pages = false, finished = false, onSkip }: { done: readonly Lesson[]; now: Lesson | null; pages?: boolean; finished?: boolean; onSkip: () => void }) {
  const { at, of } = walkPlace(done, now, pages);
  return (
    <div className={`tour-frame${finished ? ' tf-done' : ''}`} role="navigation" aria-label="Walkthrough">
      <div className="tf-steps">
        {Array.from({ length: of }, (_, i) => <i key={i} className={finished || i === at - 1 ? 'tf-is' : i < at - 1 ? 'tf-was' : ''} />)}
        <span>{finished ? 'Walkthrough done' : `Walkthrough ${at} of ${of}`}</span>
      </div>
      <button type="button" className="tf-skip" onClick={onSkip}>{finished ? 'Close' : 'Skip walkthrough'}</button>
    </div>
  );
}
