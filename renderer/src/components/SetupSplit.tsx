// THE SETUP BESIDE THE APP (w-fbe5e95dea): steps on the left, the real app on
// the right, shrunk into a window that fills in as each step lands. The app is
// not drawn twice: `data-setup` on <html> moves #root into the right panel, so
// what shows there is the app itself. Rules are in ../setup-split.ts.
//
// It is portalled to <body> because #root is transformed while it shows, and a
// fixed element inside a transformed one is placed against it, not the window.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import type { Snapshot } from '../types';
import type { SessionThread } from '../agent-import-card';
import { ago } from '../format';
import { MAC } from '../this-keyboard';
import { starterAsks } from '../../../shared/teammates.mts';
import { MATCH_SKY, SKY_THEMES, drawSky } from '../home/sky';
import { PRO_PITCH, SETUP_PLANS, cloudShowcase, setupPreview, tabStop, teamPaid, typingInSetup, inviteList, lookChoices, setUpLines, setupSteps, starterChoices, stepLabel, type SetupPlan, type SetupStep } from '../setup-split';
import { TEAM } from '../../../cloud/gateway/plans.mjs';
import FolderPicker from './FolderPicker';
import { PERK_ICONS, ProShowcase } from './ProShowcase';
import { SignInPage } from '../team/SignInPage';
import { Name } from '../../../shared/product-name.mjs';
import './setup-split.css';
import { enterIsTheButtons } from '../focused-button';

const CMD = MAC ? '⌘' : 'Ctrl';
const bare = (folder: string) => folder.replace(/\/+$/, '');
const said = (when: number) => { const a = ago(when); return /^\d/.test(a) ? `${a} ago` : a; };

const Keys = ({ ks }: { ks: string[] }) => <span className="ss-keys">{ks.map((k) => <span key={k} className="ss-key">{k}</span>)}</span>;
const Tick = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" /></svg>;
const Plus = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="M8 2.5v11M2.5 8h11" /></svg>;
const Folder = () => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true"><path d="M2 4.5c0-.6.4-1 1-1h3.2l1.4 1.5H13c.6 0 1 .4 1 1V12c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z" /></svg>;

export function Mark() {
  const at = [21, 50, 79];
  return <svg viewBox="10 10 80 80" width="13" height="13" aria-hidden="true">{at.map((cy, r) => at.map((cx, c) => (
    <circle key={`${r}${c}`} cx={cx} cy={cy} r="10.5" fill={r === 0 && c === 2 ? 'var(--accent)' : 'currentColor'} fillOpacity={r === 0 && c === 2 ? 1 : 0.38} />
  )))}</svg>;
}

function Row({ face, name, sub, end, on, onClick }: { face: ReactNode; name: ReactNode; sub?: ReactNode; end?: ReactNode; on?: boolean; onClick?: () => void }) {
  return (
    <div className={`ss-row${on ? ' ss-on' : ''}${onClick ? ' ss-press' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <span className="ss-face">{face}</span>
      <span className="ss-text"><span className="ss-name">{name}</span>{sub && <span className="ss-sub">{sub}</span>}</span>
      {end && <span className="ss-end">{end}</span>}
    </div>
  );
}
const Check = ({ on }: { on: boolean }) => <span className={`ss-check${on ? ' ss-on' : ''}`}>{on && <Tick />}</span>;

/** A sky drawn small on a strip, the way the window wears it; Match my system draws the pair it switches between. */
function Strip({ look }: { look: string }) {
  if (look === 'light') return <span className="ss-strip ss-strip-light" />;
  if (look === 'dark') return <span className="ss-strip ss-strip-dark" />;
  if (look === MATCH_SKY) return <span className="ss-strip ss-strip-pair"><SkyArt id="ember" /><SkyArt id="sage" /></span>;
  return <span className="ss-strip"><SkyArt id={look} /></span>;
}
function SkyArt({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sky = SKY_THEMES.find((s) => s.id === id);
  useEffect(() => { if (ref.current && sky) drawSky(ref.current, sky.art, { from: 0, span: 6 }); }, [sky]);
  return <span className="ss-sky" style={sky?.frame ? { background: sky.frame } : undefined}><canvas ref={ref} /></span>;
}
const LOOK_NAME = (id: string) => (id === MATCH_SKY ? 'Match my system' : id === 'light' ? 'Light' : id === 'dark' ? 'Dark' : SKY_THEMES.find((s) => s.id === id)?.name ?? id);

export interface SetupSplitProps {
  snap: Snapshot | null;
  /** Back from the first step, to the welcome. */
  onBack?: () => void;
  chats: SessionThread[];
  ticks: Set<string>;
  onToggle: (id: string) => void;
  /** Brings the ticked chats in, making their projects; resolves to how many came in. */
  bringIn: () => Promise<number>;
  /** Makes (or finds) the project for a folder chosen by hand. */
  projectFor: (folder: string) => Promise<{ slug: string; name: string } | null>;
  /** The look worn now, as a look id: a sky theme's id, light or dark. */
  look: string;
  /** Whether a sky is drawn here (Home is on); without it the looks are Light and Dark. */
  skies: boolean;
  onLook: (id: string) => void;
  onDone: (brought: number) => void;
}

export function SetupSplit(p: SetupSplitProps) {
  const team = !!p.snap?.team?.configured;
  const teammatesOn = !!p.snap?.alpha?.teammates;
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState({ chats: 0, project: null as string | null, invited: 0, teammates: [] as string[] });
  const hadProject = useRef((p.snap?.products?.length ?? 0) > 0).current;
  // Until the first step is answered a project may still come, so the count does not jump.
  const project = hadProject || at === 0 || !!done.project || done.chats > 0;
  // Read once: signing in during the setup must not take its own step out from under it.
  const signedInAtStart = useRef(!!p.snap?.team?.signedIn).current;
  // Someone already on a team was asked to join it, not to pay for it.
  const onTeam = useRef(!!p.snap?.team?.team).current;
  const [plan, setPlan] = useState<SetupPlan>('free');
  const steps = useMemo(() => setupSteps({ chats: p.chats.length, team, teammates: teammatesOn, project, signedIn: signedInAtStart, plan, onTeam }), [p.chats.length, team, teammatesOn, project, signedInAtStart, plan, onTeam]);
  // Read when the look step first shows, so picking does not reorder the list under the pointer.
  const looksAt = useRef<string[] | null>(null);
  const finished = at >= steps.length;
  const step: SetupStep | null = finished ? null : steps[at];

  // THE APP MOVES INTO THE RIGHT PANEL while this shows.
  useEffect(() => {
    const root = document.documentElement;
    const fit = () => {
      const at = setupPreview(innerWidth, innerHeight);
      root.style.setProperty('--ss-left', `${at.left}px`);
      root.style.setProperty('--ss-x', `${at.x}px`);
      root.style.setProperty('--ss-y', `${at.y}px`);
      root.style.setProperty('--ss-scale', String(at.scale));
      // Only the right edge is cut; the rest keeps the window's outline and shadow.
      root.style.setProperty('--ss-h', `${at.h}px`);
      root.style.setProperty('--ss-clip', `inset(-80px ${at.right}px -80px -80px)`);
    };
    fit();
    // The preview's new-thread box must not keep the keyboard behind the setup.
    (document.activeElement as HTMLElement | null)?.blur();
    root.setAttribute('data-setup', '');
    addEventListener('resize', fit);
    return () => { removeEventListener('resize', fit); root.removeAttribute('data-setup'); };
  }, []);

  // The purchase page shows Pro on the right instead of the app (./ProShowcase.tsx).
  useEffect(() => {
    const root = document.documentElement;
    if (step === 'pay') root.dataset.setupPro = ''; else delete root.dataset.setupPro;
    return () => { delete root.dataset.setupPro; };
  }, [step]);

  const next = useCallback(() => { setError(null); setAt((i) => i + 1); }, []);
  // Google finishes in the browser, so the step moves on when the account arrives.
  const signedIn = !!p.snap?.team?.signedIn;
  useEffect(() => { if (step === 'account' && signedIn) next(); }, [step, signedIn, next]);
  const back = !finished && (at > 0 || p.onBack) ? () => { setError(null); if (at > 0) setAt((i) => i - 1); else p.onBack?.(); } : null;

  // ---- invite
  const me = p.snap?.team?.me;
  const [teamName, setTeamName] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const addEmail = () => { const l = inviteList([...emails, typed]); if (l.length > emails.length) { setEmails(l); setTyped(''); } };
  const sendInvites = useCallback(async () => {
    const list = inviteList([...emails, typed]);
    // Pro's seats are bought for a team, so it is made even with nobody invited yet.
    if (!list.length && (plan !== 'pro' || p.snap?.team?.team)) { next(); return; }
    setBusy(true); setError(null);
    if (!p.snap?.team?.team) {
      const name = teamName.trim();
      if (!name) { setBusy(false); setError('Name your team first.'); return; }
      const made = await api.teamCreate(name);
      if (!made.ok) { setBusy(false); setError(made.error ?? 'The team was not made.'); return; }
    }
    let sent = 0;
    for (const e of list) { const r = await api.teamInvite(e); if (r.ok) sent++; else setError(r.error ?? `${e} was not invited.`); }
    setBusy(false);
    setDone((d) => ({ ...d, invited: d.invited + sent }));
    if (sent === list.length) next();
  }, [emails, typed, teamName, p.snap?.team?.team, next, plan]);

  // ---- Paying for Pro: the team's Stripe checkout in the browser, then wait for its seats.
  const [payState, setPayState] = useState<'idle' | 'opening' | 'waiting'>('idle');
  const pay = useCallback(async () => {
    setPayState('opening'); setError(null);
    const out = await api.cloudAccountPay('team');
    if (!out.ok) { setPayState('idle'); setError(out.message || 'Stripe could not be opened. Try again.'); return; }
    setPayState('waiting');
  }, []);
  useEffect(() => {
    if (payState !== 'waiting') return undefined;
    let live = true;
    const look = async () => { const paid = teamPaid(await api.cloudAccountPlan()); if (live && paid) next(); };
    const t = setInterval(() => void look(), 3000);
    return () => { live = false; clearInterval(t); };
  }, [payState, next]);

  // ---- AI teammates
  const left = useMemo(() => starterChoices(starterAsks(p.snap?.teammates?.list ?? [])), [p.snap?.teammates?.list]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [own, setOwn] = useState('');
  const makeTeammates = useCallback(async () => {
    const asks = [...picked].map((s) => ({ starter: s })).concat(own.trim() ? [{ text: own.trim() } as never] : []);
    if (!asks.length) { next(); return; }
    setBusy(true); setError(null);
    const made: string[] = [];
    for (const a of asks) {
      const r = await api.teammates<{ teammate?: { name?: string } }>('describe', a as Record<string, unknown>);
      if (r.ok) made.push(r.value?.teammate?.name && r.value.teammate.name !== 'New teammate' ? r.value.teammate.name : left.find((s) => s.starter === (a as { starter?: string }).starter)?.name ?? 'A new teammate');
      else setError(r.error);
    }
    setBusy(false);
    setDone((d) => ({ ...d, teammates: [...d.teammates, ...made] }));
    setPicked(new Set()); setOwn('');
    if (made.length === asks.length) next();
  }, [picked, own, left, next]);

  // ---- chats and folder
  const ticked = p.chats.filter((t) => p.ticks.has(t.id));
  const bring = useCallback(async () => {
    if (!ticked.length) { next(); return; }
    setBusy(true);
    const n = await p.bringIn();
    setBusy(false);
    setDone((d) => ({ ...d, chats: n }));
    next();
  }, [ticked.length, p, next]);
  const [browsing, setBrowsing] = useState(false);
  const takeFolder = useCallback(async (folder: string) => {
    setBrowsing(false);
    setBusy(true);
    const made = await p.projectFor(bare(folder));
    setBusy(false);
    if (!made) { setError('That folder could not become a project.'); return; }
    setDone((d) => ({ ...d, project: made.name }));
    next();
  }, [p, next]);
  const chooseFolder = useCallback(async () => {
    const got = await api.chooseFolder().catch(() => ({ path: null, refused: undefined, browse: false }));
    // A browser tab has no system dialog: the app's own picker stands in.
    if (got.browse) { setBrowsing(true); return; }
    if (got.refused) { setError(got.refused); return; }
    if (got.path) void takeFolder(got.path);
  }, [takeFolder]);

  // ---- the keyboard: Enter is always the primary button
  const primary = useRef<() => void>(() => {});
  const accountPrimary = useRef<(() => void) | null>(null);
  const [foot, setFoot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The folder picker hears its own keys.
      if (browsing) return;
      const where = typingInSetup(e.target as Element | null);
      if (where === 'behind') { e.preventDefault(); (e.target as HTMLElement).blur?.(); }
      const typing = where === 'typing';
      e.stopPropagation();
      const panel = document.querySelector('.setup-split');
      const inSetup = !!(e.target as Element | null)?.closest?.('.setup-split, .ss-picker');
      if (e.key === 'Tab') {
        if (!panel) return;
        const stops = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
          .filter((el) => el.offsetParent !== null);
        const to = tabStop(stops.length, stops.indexOf(document.activeElement as HTMLElement), e.shiftKey);
        e.preventDefault();
        stops[to]?.focus();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !busy) {
        if (where !== 'behind' && inSetup && enterIsTheButtons(e)) return;
        const enter = (e.target as Element).getAttribute('data-ss-enter');
        if (typing && enter === 'add') { e.preventDefault(); if (typed.trim()) addEmail(); else primary.current(); return; }
        if (typing && enter === 'to-email') { e.preventDefault(); document.querySelector<HTMLInputElement>('.setup-split input[data-ss-enter="add"]')?.focus(); return; }
        if (typing && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault(); primary.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const go = (label: string, run: () => void, enabled = true, working?: string) => {
    primary.current = enabled ? run : () => {};
    return <button type="button" className="ss-go" disabled={busy || !enabled} onClick={run}>{busy && working ? working : label}<Keys ks={['↵']} /></button>;
  };
  const quiet = (label: string, run: () => void) => <button type="button" className="ss-quiet" disabled={busy} onClick={run}>{label}</button>;

  // A step that draws no button of its own must not keep the last step's Enter.
  primary.current = step === 'account' ? () => accountPrimary.current?.() : () => {};
  let head: [string, string] = ['', ''];
  let body: ReactNode = null;
  if (step === 'chats') {
    head = ['Add your recent agents.', ''];
    body = done.chats ? <>
      <div className="ss-list"><Row face={<span className="ss-ok"><Tick /></span>} name={`${done.chats === 1 ? '1 chat' : `${done.chats} chats`} brought in`} sub="They are in your inbox" /></div>
      <div className="ss-acts">{go('Continue', next)}</div>
    </> : <>
      <div className="ss-list ss-chats">
        {p.chats.map((t) => (
          <div key={t.id} className={`ss-row ss-press ss-chat${p.ticks.has(t.id) ? ' ss-on' : ''}`} role="button" onClick={() => p.onToggle(t.id)}>
            <span className="ss-name">{t.title}</span>
            <span className="ss-meta">{said(t.when)}</span>
            <Check on={p.ticks.has(t.id)} />
          </div>
        ))}
      </div>
      <div className="ss-acts">{go(ticked.length ? `Add ${ticked.length} to your inbox` : 'Continue', () => void bring(), true, 'Adding…')}{quiet('Skip', next)}</div>
    </>;
  } else if (step === 'folder') {
    head = ['Pick a folder for your first project.', 'Agents can read and change the files in it.'];
    body = done.project ? <>
      <div className="ss-list"><Row face={<span className="ss-ok"><Tick /></span>} name={done.project} sub="Your first project" /></div>
      <div className="ss-acts">{go('Continue', next)}{quiet('Choose another', () => void chooseFolder())}</div>
    </> : <>
      <div className="ss-list"><Row face={<Folder />} name="Choose a folder on this computer" onClick={() => void chooseFolder()} end={<span className="ss-faint"><Plus />Choose</span>} /></div>
      <div className="ss-acts">{go('Choose a folder', () => void chooseFolder())}{quiet('Skip for now', next)}</div>
    </>;
  } else if (step === 'account') {
    // The app's own sign-in form, in this column: Google, email, or a new account. No skip; it is required.
    body = <div className="ss-signin"><SignInPage purpose="team" startOn="sign-up" inSetup onSignedIn={next} onBack={back ?? undefined} primaryRef={accountPrimary} termsAt={foot} /></div>;
  } else if (step === 'plan') {
    head = ['Pick a plan.', ''];
    body = <>
      <div className="ss-list ss-plans">
        {SETUP_PLANS.map((pl) => <Row key={pl.id} face={<Check on={plan === pl.id} />} on={plan === pl.id} onClick={() => setPlan(pl.id)}
          name={<>{pl.name}{pl.tag && <span className="ss-tag">{pl.tag}</span>}</>} sub={pl.sub}
          end={<span className="ss-price"><b>{pl.price}</b>{pl.per && <small>{pl.per}</small>}</span>} />)}
      </div>
      <div className="ss-acts">{go('Continue', next)}</div>
    </>;
  } else if (step === 'pay') {
    head = [PRO_PITCH.head, ''];
    body = <>
      <div className="ss-perks">{PRO_PITCH.perks.map((k) => <div key={k.id} className="ss-perk"><span className="ss-perk-icon">{PERK_ICONS[k.id]}</span>{k.title}</div>)}</div>
      <div className="ss-pricing">
        <div><span className="ss-pricing-label">{PRO_PITCH.trial.label}</span><b className="ss-pricing-price">{PRO_PITCH.trial.price}</b><span className="ss-pricing-line">{PRO_PITCH.trial.line}</span></div>
        <div><span className="ss-pricing-label">{PRO_PITCH.paid.label}</span><b className="ss-pricing-price">{PRO_PITCH.paid.price}<small>{PRO_PITCH.paid.per}</small></b><span className="ss-pricing-line">{PRO_PITCH.paid.line}</span></div>
      </div>
      {payState === 'waiting' && <p className="ss-note">Finish in your browser. This moves on once Stripe has your card.</p>}
      <div className="ss-acts">{go(payState === 'opening' ? 'Opening Stripe…' : payState === 'waiting' ? 'Open Stripe again' : PRO_PITCH.cta, () => void pay(), payState !== 'opening')}{quiet('Skip for now', next)}</div>
      <p className="ss-price-line">{PRO_PITCH.terms}</p>
    </>;
  } else if (step === 'invite') {
    head = ['Invite your team.', ''];
    body = !p.snap?.team?.signedIn ? <>
      <div className="ss-list"><Row face={<Plus />} name="Sign in to invite people" sub="Your team shares projects, threads and messages" onClick={() => void api.teamSignIn()} /></div>
      <div className="ss-acts">{go('Sign in', () => void api.teamSignIn())}{quiet('Just me for now', next)}</div>
    </> : <>
      <div className="ss-list">
        {!p.snap?.team?.team && <div className="ss-row"><span className="ss-face"><Plus /></span><input className="ss-input" data-ss-enter="to-email" placeholder="Name your team" value={teamName} onChange={(e) => setTeamName(e.target.value)} /></div>}
        {emails.map((e) => <Row key={e} face={e[0].toUpperCase()} name={e} end={<span className="ss-dim"><Tick />Added</span>} />)}
        <div className="ss-row"><span className="ss-face ss-dash"><Plus /></span>
          <input className="ss-input" data-ss-enter="add" placeholder="Add by email…" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
      </div>
      <div className="ss-acts">{go(emails.length || inviteList([typed]).length ? `Send ${inviteList([...emails, typed]).length === 1 ? '1 invite' : `${inviteList([...emails, typed]).length} invites`}` : 'Continue', () => void sendInvites(), true, 'Sending…')}{plan !== 'pro' && quiet('Just me for now', next)}</div>
    </>;
  } else if (step === 'teammates') {
    head = ['Add your own AI teammates.', ''];
    const toggle = (s: string) => setPicked((had) => { const n = new Set(had); if (n.has(s)) n.delete(s); else n.add(s); return n; });
    const count = picked.size + (own.trim() ? 1 : 0);
    body = <>
      <div className="ss-list">
        {done.teammates.map((n) => <Row key={`made-${n}`} face={<span className="ss-ai">{n[0]}</span>} name={n} end={<span className="ss-dim"><Tick />Added</span>} />)}
        {left.map((s) => <Row key={s.starter} face={<span className="ss-ai">{s.name[0]}</span>} name={s.name} sub={s.ask} end={<Check on={picked.has(s.starter)} />} on={picked.has(s.starter)} onClick={() => toggle(s.starter)} />)}
        <div className="ss-row"><span className="ss-face ss-ai ss-dash"><Plus /></span><input className="ss-input" placeholder="Describe another job…" value={own} onChange={(e) => setOwn(e.target.value)} /></div>
      </div>
      <div className="ss-acts">{go(count ? `Make ${count === 1 ? '1 teammate' : `${count} teammates`}` : 'Continue', () => void makeTeammates(), true, 'Making…')}{quiet('Skip for now', next)}</div>
    </>;
  } else if (step === 'look') {
    head = ['Pick your look.', ''];
    if (!looksAt.current) looksAt.current = lookChoices(p.look, p.skies);
    const looks = looksAt.current;
    body = <>
      <div className="ss-list">
        {looks.map((id) => <Row key={id} face={<Strip look={id} />} name={LOOK_NAME(id)} sub={id === MATCH_SKY ? 'Orange in dark mode, green in light' : undefined}
          end={<Check on={id === p.look} />} on={id === p.look} onClick={() => p.onLook(id)} />)}
      </div>
      <div className="ss-acts">{go('Continue', next)}</div>
    </>;
  } else {
    head = ['You’re set up.', ''];
    const lines = setUpLines(done);
    body = <>
      {lines.length > 0 && <div className="ss-list">{lines.map((l) => <Row key={l} face={<span className="ss-ok"><Tick /></span>} name={l} />)}</div>}
      <div className="ss-acts">{go('Open your inbox', () => p.onDone(done.chats))}</div>
    </>;
  }

  return <>{createPortal(
    <div className="setup-split" role="dialog" aria-label="Set up">
      <div className="ss-left">
        <div className="ss-brand"><Mark />{Name}</div>
        <div className="ss-steps">
          {steps.map((s, i) => <i key={s} className={i < at ? 'ss-was' : i === at ? 'ss-is' : ''} />)}
          <span>{step ? stepLabel(steps, step) : 'All set'}</span>
        </div>
        <div className="ss-body" key={step ?? 'done'}>
          {back && step !== 'account' && <button type="button" className="ss-back" onClick={back}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>Back</button>}
          {head[0] && <h1 className="ss-h"><b>{head[0]}</b>{head[1]}</h1>}
          {body}
          {error && <p className="ss-error" role="alert">{error}</p>}
        </div>
        <div className="ss-foot" ref={setFoot} />
      </div>

      <div className="ss-right" aria-hidden="true"><div className="ss-cap">Your {Name} so far</div>{step === 'pay' && <ProShowcase agents={cloudShowcase(p.chats.map((t) => t.title))} team={p.snap?.team?.team?.name ?? null} />}</div>
    </div>,
    document.body,
  )}
  {/* Above the app in the right panel as well as the steps. */}
  {browsing && createPortal(<div className="ss-picker"><FolderPicker startIn={null} onPick={(f: string) => void takeFolder(f)} onClose={() => setBrowsing(false)} /></div>, document.body)}
  </>;
}

export { CMD as SETUP_CMD };
