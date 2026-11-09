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
import type { ConnectionTile, Snapshot } from '../types';
import type { SessionThread } from '../agent-import-card';
import { ago } from '../format';
import { MAC } from '../this-keyboard';
import { starterAsks } from '../../../shared/teammates.mts';
import { SKY_THEMES, drawSky } from '../home/sky';
import { connectTiles, toolUse, typingInSetup, inviteList, lookChoices, setUpLines, setupSteps, starterChoices, stepLabel, type SetupStep } from '../setup-split';
import { logoOf } from '../connections/logos';
import FolderPicker from './FolderPicker';
import { Name } from '../../../shared/product-name.mjs';
import './setup-split.css';

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

/** A sky drawn small on a strip, the way the window wears it. */
function Strip({ look }: { look: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sky = SKY_THEMES.find((s) => s.id === look);
  useEffect(() => { if (ref.current && sky) drawSky(ref.current, sky.art, { from: 0, span: 6 }); }, [sky]);
  if (look === 'light') return <span className="ss-strip ss-strip-light" />;
  if (look === 'dark') return <span className="ss-strip ss-strip-dark" />;
  return <span className="ss-strip" style={sky?.frame ? { background: sky.frame } : undefined}><canvas ref={ref} /></span>;
}
const connectionLogo = (id: string) => { const src = logoOf(id); return src ? <img src={src} alt="" width={16} height={16} /> : <Plus />; };
const LOOK_NAME = (id: string) => (id === 'light' ? 'Light' : id === 'dark' ? 'Dark' : SKY_THEMES.find((s) => s.id === id)?.name ?? id);

export interface SetupSplitProps {
  snap: Snapshot | null;
  chats: SessionThread[];
  ticks: Set<string>;
  onToggle: (id: string) => void;
  nameOf: (folder: string) => string;
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
  const [done, setDone] = useState({ chats: 0, project: null as string | null, tools: 0, invited: 0, teammates: [] as string[] });
  const hadProject = useRef((p.snap?.products?.length ?? 0) > 0).current;
  // Until the first step is answered a project may still come, so the count does not jump.
  const project = hadProject || at === 0 || !!done.project || done.chats > 0;
  // Asked as the setup opens, so a computer that cannot keep a sign-in never sees the tools step.
  const [tiles, setTiles] = useState<ConnectionTile[] | null>(null);
  const [tools, setTools] = useState(true);
  useEffect(() => { void api.connections().then((l) => { setTiles(connectTiles(l.tiles)); setTools(l.canEncrypt !== false); }).catch(() => setTools(false)); }, []);
  const steps = useMemo(() => setupSteps({ chats: p.chats.length, team, teammates: teammatesOn, project, tools }), [p.chats.length, team, teammatesOn, project, tools]);
  // Picking a look must not reorder the list under the pointer.
  const looks = useRef(lookChoices(p.look, p.skies)).current;
  const finished = at >= steps.length;
  const step: SetupStep | null = finished ? null : steps[at];

  // THE APP MOVES INTO THE RIGHT PANEL while this shows.
  useEffect(() => {
    const root = document.documentElement;
    // The window runs a little past the panel's right and bottom edges, at any window size.
    const fit = () => {
      const left = Math.round(Math.min(800, Math.max(520, innerWidth * 0.47)));
      const scale = Math.min(0.85, Math.max(0.55, (innerWidth - left - 56 + 60) / 1120));
      root.style.setProperty('--ss-left', `${left}px`);
      root.style.setProperty('--ss-scale', String(scale));
    };
    fit();
    root.setAttribute('data-setup', '');
    addEventListener('resize', fit);
    return () => { removeEventListener('resize', fit); root.removeAttribute('data-setup'); };
  }, []);

  const next = useCallback(() => { setError(null); setAt((i) => i + 1); }, []);
  const back = at > 0 && !finished ? () => { setError(null); setAt((i) => i - 1); } : null;

  // ---- connect
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [keyText, setKeyText] = useState('');
  const connect = useCallback(async (id: string, key?: string) => {
    setBusy(true); setError(null);
    const r = await api.connectionsConnect(key ? { id, key } : { id }).catch((e) => ({ ok: false, error: String(e) } as const));
    setBusy(false);
    if (r.ok && r.tile) {
      setTiles((ts) => ts?.map((t) => (t.id === id ? r.tile! : t)) ?? ts);
      if (r.tile.connected) setDone((d) => ({ ...d, tools: d.tools + 1 }));
      setKeyFor(null); setKeyText('');
    } else if ('needsKey' in r && r.needsKey) setKeyFor(id);
    else setError(r.error ?? 'That did not connect.');
  }, []);

  // ---- invite
  const me = p.snap?.team?.me;
  const [teamName, setTeamName] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const addEmail = () => { const l = inviteList([...emails, typed]); if (l.length > emails.length) { setEmails(l); setTyped(''); } };
  const sendInvites = useCallback(async () => {
    const list = inviteList([...emails, typed]);
    if (!list.length) { next(); return; }
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
  }, [emails, typed, teamName, p.snap?.team?.team, next]);

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The folder picker hears its own keys.
      if (browsing) return;
      const where = typingInSetup(e.target as Element | null);
      if (where === 'behind') { e.preventDefault(); (e.target as HTMLElement).blur?.(); }
      const typing = where === 'typing';
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !busy) {
        const enter = (e.target as Element).getAttribute('data-ss-enter');
        if (typing && enter === 'add') { e.preventDefault(); addEmail(); return; }
        if (typing && enter === 'key') { e.preventDefault(); if (keyFor && keyText.trim()) void connect(keyFor, keyText.trim()); return; }
        if (typing && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault(); primary.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const go = (label: string, run: () => void, enabled = true) => {
    primary.current = enabled ? run : () => {};
    return <button type="button" className="ss-go" disabled={busy || !enabled} onClick={run}>{label}<Keys ks={['↵']} /></button>;
  };
  const quiet = (label: string, run: () => void) => <button type="button" className="ss-quiet" disabled={busy} onClick={run}>{label}</button>;

  let head: [string, string] = ['', ''];
  let body: ReactNode = null;
  if (step === 'chats') {
    head = ['Add the agents already on this computer.', 'What they send you lands in your inbox.'];
    body = <>
      <div className="ss-list">
        {p.chats.map((t) => <Row key={t.id} face={t.source === 'codex' ? 'X' : 'C'} name={t.title} sub={`${t.source === 'codex' ? 'Codex' : 'Claude Code'} · ${p.nameOf(bare(t.folder))} · ${said(t.when)}`}
          end={<Check on={p.ticks.has(t.id)} />} on={p.ticks.has(t.id)} onClick={() => p.onToggle(t.id)} />)}
      </div>
      <div className="ss-acts">{go(ticked.length ? `Add ${ticked.length} to your inbox` : 'Continue', () => void bring())}{quiet('Skip', next)}</div>
    </>;
  } else if (step === 'folder') {
    head = ['Pick a folder for your first project.', 'Agents can read and change the files in it.'];
    body = <>
      <div className="ss-list"><Row face={<Folder />} name="Choose a folder on this computer" onClick={() => void chooseFolder()} end={<span className="ss-faint"><Plus />Choose</span>} /></div>
      <div className="ss-acts">{go('Choose a folder', () => void chooseFolder())}{quiet('Skip for now', next)}</div>
    </>;
  } else if (step === 'connect') {
    head = ['Connect your tools.', 'Agents read and update them as they work.'];
    body = <>
      <div className="ss-list">
        {(tiles ?? []).map((t) => keyFor === t.id ? (
          <div key={t.id} className="ss-row ss-on">
            <span className="ss-face ss-logo">{connectionLogo(t.id)}</span>
            <input className="ss-input" data-ss-enter="key" autoFocus placeholder={`Paste a ${t.name} token, made in its settings`} value={keyText} onChange={(e) => setKeyText(e.target.value)} />
          </div>
        ) : (
          <Row key={t.id} face={<span className="ss-logo">{connectionLogo(t.id)}</span>} name={t.name}
            sub={t.connected ? (t.access === 'key' ? 'Connected with a personal token' : 'Connected') : toolUse(t.id)}
            end={t.connected ? <span className="ss-dim"><Tick />Connected</span> : <span className="ss-faint"><Plus />Connect</span>}
            onClick={t.connected ? undefined : () => void connect(t.id)} />
        ))}
        {tiles === null && <div className="ss-empty">Reading your connections…</div>}
      </div>
      <div className="ss-acts">{go('Continue', next)}</div>
    </>;
  } else if (step === 'invite') {
    head = ['Invite your team.', 'Add the people you work with.'];
    body = !p.snap?.team?.signedIn ? <>
      <div className="ss-list"><Row face={<Plus />} name="Sign in to invite people" sub="Your team shares projects, threads and messages" onClick={() => void api.teamSignIn()} /></div>
      <div className="ss-acts">{go('Sign in', () => void api.teamSignIn())}{quiet('Just me for now', next)}</div>
    </> : <>
      <div className="ss-list">
        {!p.snap?.team?.team && <div className="ss-row"><span className="ss-face"><Plus /></span><input className="ss-input" placeholder="Name your team" value={teamName} onChange={(e) => setTeamName(e.target.value)} /></div>}
        {emails.map((e) => <Row key={e} face={e[0].toUpperCase()} name={e} end={<span className="ss-dim"><Tick />Added</span>} />)}
        <div className="ss-row"><span className="ss-face ss-dash"><Plus /></span>
          <input className="ss-input" data-ss-enter="add" placeholder="Add by email…" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
      </div>
      <p className="ss-note">Free for 14 days.</p>
      <div className="ss-acts">{go(emails.length || inviteList([typed]).length ? `Send ${inviteList([...emails, typed]).length === 1 ? '1 invite' : `${inviteList([...emails, typed]).length} invites`}` : 'Continue', () => void sendInvites())}{quiet('Just me for now', next)}</div>
    </>;
  } else if (step === 'teammates') {
    head = ['Add AI teammates.', 'They work for you, on jobs you pick.'];
    const toggle = (s: string) => setPicked((had) => { const n = new Set(had); if (n.has(s)) n.delete(s); else n.add(s); return n; });
    const count = picked.size + (own.trim() ? 1 : 0);
    body = <>
      <div className="ss-list">
        {left.map((s) => <Row key={s.starter} face={<span className="ss-ai">{s.name[0]}</span>} name={s.name} sub={s.ask} end={<Check on={picked.has(s.starter)} />} on={picked.has(s.starter)} onClick={() => toggle(s.starter)} />)}
        <div className="ss-row"><span className="ss-face ss-ai ss-dash"><Plus /></span><input className="ss-input" placeholder="Describe another job…" value={own} onChange={(e) => setOwn(e.target.value)} /></div>
      </div>
      <div className="ss-acts">{go(count ? `Make ${count === 1 ? '1 teammate' : `${count} teammates`}` : 'Continue', () => void makeTeammates())}{quiet('Skip for now', next)}</div>
    </>;
  } else if (step === 'look') {
    head = ['Pick your look.', 'The app changes as you choose.'];
    body = <>
      <div className="ss-list">
        {looks.map((id, i) => <Row key={id} face={<Strip look={id} />} name={LOOK_NAME(id)} sub={i === 0 && id === p.look ? 'What you’re using now' : undefined}
          end={<Check on={id === p.look} />} on={id === p.look} onClick={() => p.onLook(id)} />)}
      </div>
      <div className="ss-acts">{go('Continue', next)}</div>
    </>;
  } else {
    head = ['You’re set up.', 'Your inbox is ready.'];
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
          <h1 className="ss-h"><b>{head[0]}</b>{head[1]}</h1>
          {body}
          {error && <p className="ss-error" role="alert">{error}</p>}
          {back && <button type="button" className="ss-back" onClick={back}>Back</button>}
        </div>
      </div>

      <div className="ss-right" aria-hidden="true"><div className="ss-cap">Your {Name} so far</div></div>
    </div>,
    document.body,
  )}
  {/* Above the app in the right panel as well as the steps. */}
  {browsing && createPortal(<div className="ss-picker"><FolderPicker startIn={null} onPick={(f: string) => void takeFolder(f)} onClose={() => setBrowsing(false)} /></div>, document.body)}
  </>;
}

export { CMD as SETUP_CMD };
