// Pro's button where inviting would be: a team without Pro neither invites nor
// shares (20261121130000_team_features_need_pro.sql). It starts the setup's
// Pro, Stripe's checkout in the browser, and the invite box takes its place
// once the team pays.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { startProTrial } from '../pro-trial';
import { proButton } from '../setup-split';
import { TermsLinks } from '../terms-links';
import type { CloudPlan } from '../types';
import './start-team.css';

export function StartPro({ hasTeam, name, className, autoFocus = false, onStarted }: { hasTeam: boolean; name: string | null | undefined; className: string; autoFocus?: boolean; onStarted?: () => void }) {
  const [plan, setPlan] = useState<CloudPlan | null>(null);
  useEffect(() => {
    let live = true;
    void api.cloudAccountPlan().then((p) => { if (live) setPlan(p); });
    return () => { live = false; };
  }, [hasTeam]);
  const [state, setState] = useState<'idle' | 'opening' | 'waiting'>('idle');
  const [error, setError] = useState<string | null>(null);
  // With no cloud key here the press makes one, and the cloud makes one only
  // for someone who agreed to its terms, which nobody who stayed on Free in the
  // setup has. So the terms are named under the button, and pressing it agrees.
  const [termsAsked, setTermsAsked] = useState(false);
  const agrees = plan?.signedIn === false || termsAsked;
  const start = async () => {
    setState('opening'); setError(null);
    const out = await startProTrial({ hasTeam, name, acceptTerms: agrees });
    if (!out.ok) { setState('idle'); if (out.terms) setTermsAsked(true); else setError(out.message); return; }
    setState('waiting');
    onStarted?.();
  };
  return <>
    <button type="button" className={className} autoFocus={autoFocus} disabled={state === 'opening'} onClick={() => void start()}>
      {state === 'opening' ? 'Opening Stripe…' : state === 'waiting' ? 'Open Stripe again' : proButton(hasTeam, plan)}
    </button>
    {state === 'waiting' && <span className="st-problem" role="status">Finish in your browser.</span>}
    {error && <span className="st-problem" role="status">{error}</span>}
    {agrees && state !== 'waiting' && <span className="st-terms">By starting Pro, you agree to <TermsLinks />.</span>}
  </>;
}
