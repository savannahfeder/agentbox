// THE BAR ABOVE THE FRAMED APP while the walkthrough runs: the setup's step
// dashes, how far through you are, and Skip. ./tour-frame.css insets the app.
import type { Lesson } from '../tour';
import { walkPlace } from '../setup-split';
import './tour-frame.css';

export function TourFrame({ done, now, onSkip }: { done: readonly Lesson[]; now: Lesson | null; onSkip: () => void }) {
  const { at, of } = walkPlace(done, now);
  return (
    <div className="tour-frame" role="navigation" aria-label="Walkthrough">
      <div className="tf-steps">
        {Array.from({ length: of }, (_, i) => <i key={i} className={i < at - 1 ? 'tf-was' : i === at - 1 ? 'tf-is' : ''} />)}
        <span>Walkthrough {at} of {of}</span>
      </div>
      <button type="button" className="tf-skip" onClick={onSkip}>Skip walkthrough</button>
    </div>
  );
}
