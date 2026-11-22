// The cloud's plans as cards side by side: Settings › Plan and Billing and the setup
// screen's first step draw the same three, so a plan looks the same wherever
// it is chosen.
import { planCards, usageLine, usedPercent, type PaidPlan } from '../cloud-upgrade';
import type { CloudPlan } from '../types';

export function CloudPlanCards({ plan, onChoose, opening = null, waiting = null, proLabel = null }: {
  plan: CloudPlan | null;
  /** Pro's button, when Pro is the team's and its free days are the team's (Settings). */
  proLabel?: string | null;
  onChoose: (id: PaidPlan) => void;
  /** The plan whose checkout is being made. */
  opening?: PaidPlan | null;
  /** The plan whose checkout is open in the browser. */
  waiting?: PaidPlan | null;
}) {
  return (
    <div className="set-group cloud-plans" data-find="cloud-plans">
      {planCards(plan).map((c) => (
        <div key={c.id} className={`cloud-plan${c.current ? ' mine' : ''}${waiting === c.id && !c.current ? ' waiting' : ''}`}>
          <div className="cloud-plan-head"><span>{c.name}</span>{c.current && <span className="cloud-plan-mine">Your plan</span>}</div>
          <div className="cloud-plan-price">{c.price}<span> a month</span></div>
          <div className="cloud-plan-line">{c.hours}</div>
          {/* A trial's hours are on the meter above; the month's start with the plan. */}
          {c.current && plan?.trial ? null : c.current && plan ? (
            <div className="cloud-plan-use">
              <span>{usageLine(plan)}</span>
              <span className="cloud-plan-bar"><i style={{ width: `${usedPercent(plan)}%` }} /></span>
            </div>
          ) : c.button && (
            <button type="button" className="set-ghost cloud-plan-go" disabled={!!opening} onClick={() => onChoose(c.id)}>
              {opening === c.id ? 'Opening Stripe…' : waiting === c.id ? 'Open Stripe again' : (c.id === 'pro' && proLabel) || c.button}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
