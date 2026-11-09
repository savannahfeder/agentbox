import { useState } from 'react';
import { comesBackTo } from '../../../shared/sign-in-ask.mts';
import { logoOf, DARK_INK } from '../connections/logos';
import './need-card.css';

export interface SignInAsk { id: string; service: string; url: string; code?: string; why?: string }
export type SignInSaid = { said: 'signed-in' | 'skipped' } | { said: 'landed'; url: string };

const arrow = <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 11l6-6M6 5h5v5" /></svg>;
const key = <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="14" r="4" /><path d="M11 11l8-8M16 6l2 2M14 8l2 2" /></svg>;

const logoId = (service: string) => service.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? '' : '.'}`;

/** A service's own sign-in link, put here by an agent that waits for it (shared/sign-in-ask.mjs). */
export function SignInCard({ ask, cloud, open, answer, copy }: {
  ask: SignInAsk;
  // The agent runs on another machine, so a sign-in that sends the browser to localhost lands here.
  cloud: boolean;
  open: (href: string) => void;
  answer: (said: SignInSaid) => Promise<string | null>;
  copy: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [landed, setLanded] = useState('');
  const id = logoId(ask.service);
  const logo = logoOf(id);
  const back = cloud && !!comesBackTo(ask.url);
  const send = async (s: SignInSaid) => {
    setBusy(true); setSaid(null);
    const out = await answer(s);
    setBusy(false);
    if (out) setSaid(out);
  };
  return <div className="need need-sign-in" data-need="sign-in" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
    <div className="need-body">
      <span className={`need-mark${DARK_INK.has(id) ? ' need-mark-ink' : ''}`} aria-hidden="true">{logo ? <img src={logo} alt="" draggable={false} /> : key}</span>
      <div className="need-col">
        <div className="need-title">Sign in to {ask.service}</div>
        {ask.why && <div className="need-why">{sentence(ask.why)}</div>}
        {ask.code && <div className="need-code-box">
          <span className="need-code-label">Enter this code</span>
          <span className="need-code-value">{ask.code}</span>
          <button type="button" className="need-link" onClick={() => copy(ask.code!)}>Copy</button>
        </div>}
        <div className="need-acts">
          <button type="button" className="need-btn need-main" disabled={busy} onClick={() => open(ask.url)}>Open {ask.service}<span className="need-btn-arrow">{arrow}</span></button>
          <button type="button" className="need-btn" disabled={busy} onClick={() => void send({ said: 'signed-in' })}>I've signed in</button>
          <button type="button" className="need-link need-skip" disabled={busy} onClick={() => void send({ said: 'skipped' })}>Not now</button>
        </div>
        {back && !pasting && <button type="button" className="need-link need-also" onClick={() => setPasting(true)}>Page did not load after signing in?</button>}
        {pasting && <form className="need-form" onSubmit={(e) => { e.preventDefault(); if (landed.trim() && !busy) void send({ said: 'landed', url: landed.trim() }); }}>
          <div className="need-row">
            <input className="need-input" autoFocus spellCheck={false} autoComplete="off" aria-label="The address the browser ended on" placeholder="Paste the address from the browser"
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); } }}
              value={landed} onChange={(e) => { setLanded(e.target.value); setSaid(null); }} />
            <button type="submit" className="need-btn need-main" disabled={busy || !landed.trim()}>Send</button>
          </div>
        </form>}
        {said && <p className="need-said" role="status">{said}</p>}
      </div>
    </div>
  </div>;
}
