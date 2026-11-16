// Pro's free week, offered to someone with no cloud plan, in the words of the
// setup's Pro page (../setup-split.ts PRO_PITCH).
import { PRO_PITCH } from '../setup-split';

export type TrialState = 'idle' | 'opening' | 'waiting';

const label = (state: TrialState) => (state === 'opening' ? 'Opening Stripe…' : state === 'waiting' ? 'Open Stripe again' : PRO_PITCH.cta);

/** The free week beside the paid month, and the button that starts it. */
export function ProTrialOffer({ state, onStart }: { state: TrialState; onStart: () => void }) {
  return (
    <div className="pt">
      <div className="pt-pricing">
        <div><span className="pt-label">{PRO_PITCH.trial.label}</span><b className="pt-price">{PRO_PITCH.trial.price}</b><span className="pt-line">{PRO_PITCH.trial.line}</span></div>
        <div><span className="pt-label">{PRO_PITCH.paid.label}</span><b className="pt-price">{PRO_PITCH.paid.price}<small>{PRO_PITCH.paid.per}</small></b><span className="pt-line">{PRO_PITCH.paid.line}</span></div>
      </div>
      <div className="pt-acts">
        <button type="button" className="set-ghost" disabled={state === 'opening'} onClick={onStart}>{label(state)}</button>
        <span className="pt-terms">{PRO_PITCH.terms}</span>
      </div>
    </div>
  );
}
