import { useState } from 'react';
import { comesBackTo } from '../../../shared/sign-in-ask.mts';
import { logoOf, DARK_INK } from '../connections/logos';
import { Name } from '../../../shared/product-name.mjs';
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
  // DESIGN ROUND ONLY: which of the five save controls to draw. Removed once one is picked.
  const look = cloud ? (typeof localStorage !== 'undefined' && localStorage.getItem('zero.signInSaveLook')) || '' : '';
  const [save, setSave] = useState(true);
  const [asking, setAsking] = useState(false);
  const lock = <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>;
  const cloudMark = <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M4.5 12.5h7a3 3 0 00.4-6A4 4 0 004.3 7.6 2.5 2.5 0 004.5 12.5z" /></svg>;
  if (look === 'after' && asking) {
    return <div className="need need-sign-in" data-need="sign-in">
      <div className="need-body">
        <span className={`need-mark${DARK_INK.has(id) ? ' need-mark-ink' : ''}`} aria-hidden="true">{logo ? <img src={logo} alt="" draggable={false} /> : key}</span>
        <div className="need-col">
          <div className="need-title">Save {ask.service} for every cloud thread?</div>
          <div className="need-why">Then no other thread asks you to sign in again. You can remove it in Connections.</div>
          <div className="need-acts">
            <button type="button" className="need-btn need-main">Save it</button>
            <button type="button" className="need-btn">Only this thread</button>
          </div>
        </div>
      </div>
    </div>;
  }
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
        <div className="need-title-row">
          <div className="need-title">Sign in to {ask.service}</div>
          {look === 'switch' && <label className="need-switch"><span>Save for every thread</span>
            <button type="button" role="switch" aria-checked={save} className={`need-switch-track${save ? ' on' : ''}`} onClick={() => setSave(!save)}><span /></button></label>}
        </div>
        {ask.why && <div className="need-why">{sentence(ask.why)}</div>}
        {look === 'facts' && <div className="need-facts need-facts-save">
          <div>{lock}<span>{save ? `Kept encrypted in your ${Name} Cloud` : 'Only this thread will use it'}</span></div>
          {save && <div>{cloudMark}<span>Every cloud thread can use it from now on</span><button type="button" className="need-link need-facts-off" onClick={() => setSave(false)}>Don't save</button></div>}
        </div>}
        {ask.code && <div className="need-code-box">
          <span className="need-code-label">Enter this code</span>
          <span className="need-code-value">{ask.code}</span>
          <button type="button" className="need-link" onClick={() => copy(ask.code!)}>Copy</button>
        </div>}
        <div className="need-acts">
          <button type="button" className="need-btn need-main" disabled={busy} onClick={() => open(ask.url)}>Open {ask.service}<span className="need-btn-arrow">{arrow}</span></button>
          <button type="button" className="need-btn" disabled={busy} onClick={() => { if (look === 'after') setAsking(true); else void send({ said: 'signed-in' }); }}>I've signed in</button>
          <button type="button" className="need-link need-skip" disabled={busy} onClick={() => void send({ said: 'skipped' })}>Not now</button>
        </div>
        {look === 'check' && <label className="need-check"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /><span className="need-check-box" aria-hidden="true">{save && <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 6.2l2.3 2.3 4.7-5" /></svg>}</span>Save this sign-in for every cloud thread</label>}
        {look === 'line' && <div className="need-save-line">{save ? 'Every cloud thread will use this sign-in.' : 'Only this thread will use this sign-in.'}
          <button type="button" className="need-link" onClick={() => setSave(!save)}>{save ? 'Only this thread' : 'Save for every thread'}</button></div>}
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
