// SETTING UP THE CLOUD, ON ITS OWN SCREEN (renderer/src/cloud-setup.ts).
//
// The cloud menu only invites; this is where it happens, on the first-run
// walk's screen and card (components/PlanSetup.tsx, `.fr-screen .ps-over`).
// Three views, and only one thing to do on each:
//   home     the accounts she added, and a button to add a Claude or a Codex
//            account; Done once one can run;
//   sign-in  one account signing in: Claude's code comes back from the
//            clipboard by itself, Codex's code is shown to type on OpenAI's
//            page; every wait wears a moving mark;
//   where    where new threads should start.
// The sign-in itself happens in the cloud (main/cloud/logins.mjs).
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { AppMark } from './AppMark';
import { EngineLogo } from './EngineLogos';
import { AskList } from './PlanSetup';
import { Cap } from './Onboarding';
import { NAME } from '../../../shared/product-name.mjs';
import { accountLabel, engineWord, pageToOpen, type CloudAccount, type CloudMode, type CloudSignIn, type CloudStatus } from '../cloud-menu';
import { SETUP, WHERE_ROWS, activeSignIn, addingRows, doneAsksWhere, mayFinish, signInView } from '../cloud-setup';
import { CloudPlanCards } from './CloudPlanCards';
import { setupStep } from '../cloud-setup-step';
import type { PaidPlan } from '../cloud-upgrade';
import type { CloudPlan } from '../types';

const Plus = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>;
const Chevron = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" /></svg>;
const Busy = () => <span className="cs-busy" aria-hidden="true" />;

const send = (engine: 'claude' | 'codex', action: 'start' | 'code' | 'cancel' | 'remove', key?: string | null, code?: string) =>
  api.cloudSignIn({ action, engine, key: key ?? null, code });

// ONE SIGN-IN. Claude's code is read from the clipboard when she comes back
// to the app (and every two seconds while it is in front), and sent the
// moment it is there; the field is for pasting by hand if that fails.
function SignIn({ s, existing, as = null }: { s: CloudSignIn; existing: boolean; as?: string | null }) {
  const view = signInView(s);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const sent = useRef<string | null>(null);
  const submit = (c: string) => {
    const v = c.trim();
    if (!v || sent.current === v) return;
    sent.current = v;
    void send(s.engine, 'code', s.key, v);
  };
  useEffect(() => {
    if (s.state !== 'needs-code') return;
    sent.current = null;
    // A code already on the clipboard when this sign-in began is from an
    // earlier one, and Claude refuses it: only one copied since is taken.
    let before: string | null | undefined;
    const look = async () => {
      const c = await api.cloudClipboardCode();
      if (before === undefined) { before = c; return; }
      if (c && c !== before && document.hasFocus()) submit(c);
    };
    void look();
    const timer = setInterval(look, 2000);
    window.addEventListener('focus', look);
    return () => { clearInterval(timer); window.removeEventListener('focus', look); };
  }, [s.state, s.attempt]);

  return <div className="fr-stack fr-stack-folders">
    <span className="cs-signin-mark"><EngineLogo engine={s.engine} size={30} /></span>
    <h1 className="fr-page">{SETUP.signInHead(s.engine, as)}</h1>
    <p className={`fr-lede${s.state === 'failed' ? ' cs-trouble' : ''}`}>{view.busy && <Busy />}{view.lead}</p>
    {view.paste && <form className="fr-card cs-paste-card" onSubmit={(e) => { e.preventDefault(); submit(code); }}>
      <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={SETUP.pastePlaceholder} aria-label="Claude’s sign-in code" spellCheck={false} />
      <button type="submit" className="fr-submit" disabled={!code.trim()}>{SETUP.pasteGo} <Cap cap="↵" /></button>
    </form>}
    {view.codeToType && <div className="cs-code">
      <code>{view.codeToType}</code>
      <button type="button" className="cs-quiet" onClick={() => { void navigator.clipboard?.writeText(view.codeToType!); setCopied(true); }}>{copied ? SETUP.copied : SETUP.copy}</button>
    </div>}
    <div className="ps-acts ps-acts-quiet">
      {s.state === 'failed'
        ? <button type="button" className="fr-finish-go" onClick={() => void send(s.engine, 'start', existing ? s.key : null)}>{SETUP.tryAgain}</button>
        : s.url && <button type="button" className="ps-link" onClick={() => window.open(s.url!, '_blank')}>{SETUP.openAgain}</button>}
    </div>
  </div>;
}

export function CloudSetup({ cloud, onMode, onClose, signInAs = null, plan = null }: {
  cloud: CloudStatus;
  onMode: (mode: CloudMode) => void;
  onClose: () => void;
  /** The account a Claude sign-in started from Settings is for. */
  signInAs?: string | null;
  /** Agentbox Cloud's plan as last read; unpaid, the screen asks for it first. */
  plan?: CloudPlan | null;
}) {
  const accounts = cloud.accounts || [];
  // PAY FIRST (../cloud-setup-step.ts): no account is asked for until the
  // plan is paid. Checkout opens in the browser, and the plan lands with
  // Stripe's notice to the cloud server, so it is read again every few
  // seconds for ten minutes and whenever the window comes back to the front.
  const [planNow, setPlanNow] = useState<CloudPlan | null>(plan);
  useEffect(() => { if (plan) setPlanNow(plan); }, [plan?.plan]);
  const step = setupStep({ managed: cloud.managed, plan: planNow });
  const [opening, setOpening] = useState<PaidPlan | null>(null);
  const [waiting, setWaiting] = useState<PaidPlan | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);
  const pay = async (id: PaidPlan) => {
    setPayErr(null); setOpening(id);
    const out = await api.cloudAccountPay(id);
    setOpening(null);
    if (!out.ok) { setPayErr(out.message || 'Stripe could not be opened. Try again.'); return; }
    setWaiting(id);
  };
  useEffect(() => {
    if (!cloud.managed) return undefined;
    let on = true;
    const read = () => api.cloudAccountPlan().then((p) => { if (on) setPlanNow(p); }, () => {});
    void read();
    const until = Date.now() + 10 * 60_000;
    const t: ReturnType<typeof setInterval> | null = step === 'pay' && waiting
      ? setInterval(() => { if (Date.now() > until) clearInterval(t!); else void read(); }, 3000)
      : null;
    if (step === 'pay') window.addEventListener('focus', read);
    return () => { on = false; if (t) clearInterval(t); window.removeEventListener('focus', read); };
  }, [cloud.managed, step, waiting]);
  // Her part of a sign-in, on screen; the cloud's part goes on behind her
  // accounts, where how it ended is shown (cloud-setup.ts, activeSignIn).
  const shown = activeSignIn(cloud);
  const adding = addingRows(cloud);
  const checking = (key: string) => (cloud.signIns || []).find((s) => s.key === key && (s.state === 'checking' || s.state === 'failed')) ?? null;
  const [where, setWhere] = useState(false);
  const [choosing, setChoosing] = useState(false);
  // Read as the screen opens: adding an account to a cloud already set up
  // ends on Done, without the first-time question.
  const firstSetup = useRef(doneAsksWhere(cloud.accounts || []));

  // The vendor's page opens in the browser by itself, once per sign-in.
  const opened = useRef<string | null>(null);
  const page = pageToOpen(shown);
  useEffect(() => {
    if (page && opened.current !== page.key) { opened.current = page.key; window.open(page.url, '_blank'); }
  }, [page?.key]);

  // Back: out of a sign-in to the accounts, out of the screen from there.
  const back = () => {
    if (shown) { void send(shown.engine, 'cancel', shown.key); return; }
    if (where) { setWhere(false); return; }
    if (choosing) { setChoosing(false); return; }
    onClose();
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') back(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // The account that just came in, lit for a moment on the list.
  const [fresh, setFresh] = useState<string | null>(null);
  const seen = useRef(new Set(accounts.map((a) => a.key)));
  useEffect(() => {
    const added = accounts.find((a) => !seen.current.has(a.key));
    for (const a of accounts) seen.current.add(a.key);
    if (added) { setFresh(added.key); const t = setTimeout(() => setFresh(null), 2400); return () => clearTimeout(t); }
    return undefined;
  }, [accounts.map((a) => a.key).join()]);

  let body: JSX.Element;
  if (shown) {
    body = <SignIn s={shown} existing={accounts.some((a) => a.key === shown.key)} as={shown.engine === 'claude' ? signInAs : null} />;
  } else if (step === 'loading') {
    body = <div className="fr-stack fr-stack-folders" />;
  } else if (step === 'pay') {
    body = <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{SETUP.payHead}</h1>
      <p className="fr-lede">{waiting ? <><Busy />{SETUP.payWaitLede}</> : SETUP.payLede}</p>
      <div className="cs-plans"><CloudPlanCards plan={planNow} opening={opening} waiting={waiting} onChoose={(id) => void pay(id)} /></div>
      {payErr && <p className="cs-pay-err" role="alert">{payErr}</p>}
    </div>;
  } else if (where) {
    body = <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{SETUP.doneHead}</h1>
      <p className="fr-lede">{SETUP.doneLede}</p>
      <AskList rows={WHERE_ROWS.map((r) => ({ ...r }))} label={SETUP.doneLede} onPick={(key) => { onMode(key as CloudMode); onClose(); }} />
    </div>;
  } else {
    body = <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{SETUP.homeHead}</h1>
      <p className="fr-lede">{SETUP.homeLede}</p>
      {/* ONE CARD, ONE COLUMN OF MARKS (2026-10-14). Each account is its
          vendor's logo and its name; the last row is Add account, and adding
          opens, in the same rows and the same columns, the two kinds to pick
          from (her question: "just click Add account and then ... choose
          which it is"). With no accounts yet the two kinds are already open,
          since adding is the only thing to do. No tick on an account that
          works; only one that stopped working says anything. */}
      <div className="fr-card cs-accounts">
        {accounts.map((a: CloudAccount) => {
          const again = checking(a.key);
          return <div key={a.key} className={`cs-row${fresh === a.key ? ' fresh' : ''}${a.state === 'broken' || a.state === 'duplicate' || again?.state === 'failed' ? ' broken' : ''}`}>
            <span className="cs-row-mark"><EngineLogo engine={a.engine} /></span>
            <span className="cs-row-name">{accountLabel(a, accounts)}{again?.state === 'failed' && again.message && <small className="cs-row-why">{again.message}</small>}{a.state === 'duplicate' && <small className="cs-row-why">{SETUP.sameAccount}</small>}</span>
            <span className="cs-row-end">
              {again?.state === 'checking'
                ? <span className="cs-row-eng cs-row-adding"><Busy />{SETUP.adding}</span>
                : a.state === 'broken' || again?.state === 'failed'
                  ? <button type="button" className="cs-quiet cs-again" onClick={() => void send(a.engine, 'start', a.key)}>{again?.state === 'failed' ? SETUP.tryAgain : SETUP.again}</button>
                  : <span className="cs-row-eng cs-row-swap">{engineWord(a)}</span>}
              <button type="button" className="cs-remove" aria-label={`${SETUP.remove} ${accountLabel(a, accounts)}`} title={SETUP.remove} onClick={() => void send(a.engine, 'remove', a.key)}>×</button>
            </span>
          </div>;
        })}
        {/* ONE BEING ADDED, OR ONE THAT WAS NOT (2026-10-15): the cloud checks
            it while she carries on, and a failure says why on its own row,
            with the way to try again. × lets the failure go. */}
        {adding.map((s) => <div key={s.key} className={`cs-row${s.state === 'failed' ? ' broken' : ''}`}>
          <span className="cs-row-mark"><EngineLogo engine={s.engine} /></span>
          <span className="cs-row-name">{s.engine === 'codex' ? SETUP.kindCodex : SETUP.kindClaude}{s.state === 'failed' && <small className="cs-row-why">{s.message || 'That didn’t work.'}</small>}</span>
          <span className="cs-row-end">
            {s.state === 'checking'
              ? <span className="cs-row-eng cs-row-adding"><Busy />{SETUP.adding}</span>
              : <button type="button" className="cs-quiet cs-again" onClick={() => void send(s.engine, 'cancel', s.key).then(() => send(s.engine, 'start'))}>{SETUP.tryAgain}</button>}
            {/* Being added or failed, it can be let go: a cancel stops the cloud's side too. */}
            <button type="button" className="cs-remove" aria-label={`${SETUP.remove} ${s.engine === 'codex' ? SETUP.kindCodex : SETUP.kindClaude}`} title={SETUP.remove} onClick={() => void send(s.engine, 'cancel', s.key)}>×</button>
          </span>
        </div>)}
        {choosing && accounts.length > 0 && <div className="cs-choose-head">{SETUP.addWhich}</div>}
        {choosing || (!accounts.length && !adding.length)
          ? (['claude', 'codex'] as const).map((engine) => <button key={engine} type="button" className="cs-row cs-pick" onClick={() => { setChoosing(false); void send(engine, 'start'); }}>
              <span className="cs-row-mark"><EngineLogo engine={engine} /></span>
              <span className="cs-row-name">{engine === 'codex' ? SETUP.kindCodex : SETUP.kindClaude}</span>
              <span className="cs-row-end">
                <span className="cs-row-eng">{engine === 'codex' ? SETUP.planCodex : SETUP.planClaude}</span>
                <span className="cs-row-go"><Chevron /></span>
              </span>
            </button>)
          : <button type="button" className="cs-row cs-add" onClick={() => setChoosing(true)}>
              <span className="cs-row-mark"><Plus /></span>
              <span className="cs-row-name">{SETUP.addOne}</span>
            </button>}
      </div>
      {mayFinish(cloud) && <div className="ps-acts"><button type="button" className="fr-finish-go cs-go" onClick={() => (firstSetup.current ? setWhere(true) : onClose())}>{SETUP.done}</button></div>}
    </div>;
  }

  return <div className="fr-screen has-back ps-over" role="dialog" aria-label={SETUP.screenLabel}>
    <button type="button" className="back-esc fr-back" aria-label={SETUP.back} title={SETUP.back} onClick={back}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
    </button>
    <div className="fr-brand"><AppMark size={13} />{NAME}</div>
    {body}
  </div>;
}
