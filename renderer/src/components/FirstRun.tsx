// THE FIRST RUN (w-fadbbea8ef): a welcome and your latest chats, then the inbox,
// where the tutorial (Tour.tsx) walks you through a first real thread. The
// rules are in ../first-run.ts.
//
// It holds the keyboard while it is up: one listener on the window, in the
// capture phase, so none of the inbox's own keys fire behind it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { Snapshot } from '../types';
import type { SessionThread } from '../agent-import-card';
import { projectNameFor } from '../agent-import-card';
import { ago } from '../format';
import { MAC } from '../this-keyboard';
import { LAST_PRODUCT_KEY } from '../compose-project';
import {
  ENGINE_NAME, FIRST_RUN_STEP, chatChoices, chatsHeadline, foundLine, installGate, listKey, previousScreen, projectsToMake, readyEngines, setupWord, runningSetup, signedOutEngines,
  type Engine, type Screen,
  inHomeFolder,
} from '../first-run';
import { SetupSplit } from './SetupSplit';
import './first-run.css';
import { WelcomeSky } from './WelcomeSky';
import { useDarkWindow } from '../home/home-settings';

type Project = { slug: string; name: string };

const SEND = MAC ? ['⌘', '↵'] : ['Ctrl', '↵'];
const LEAVE_MS = 260;
const bare = (folder: string) => folder.replace(/\/+$/, '');

const Key = ({ k }: { k: string }) => <span className={`ob-key${[...k].length === 1 ? ' ob-k1' : ''}`}>{k}</span>;
const Keys = ({ ks }: { ks: string[] }) => <span className="ob-keys">{ks.map((k) => <Key key={k} k={k} />)}</span>;

/** The logo, drawn as AppMark draws it: nine dots, the top right one lit. */
function Mark() {
  const at = [21, 50, 79];
  return (
    <svg className="ob-logo" viewBox="10 10 80 80" width="56" height="56" aria-hidden="true">
      {at.map((cy, r) => at.map((cx, c) => (
        <circle key={`${r}${c}`} cx={cx} cy={cy} r="10.5"
          className={r === 0 && c === 2 ? 'ob-dot ob-dot-lit' : 'ob-dot'}
          style={{ animationDelay: r === 0 && c === 2 ? `${0.25 + 0.07 * ((2 - r) + c)}s, 1.05s` : `${0.25 + 0.07 * ((2 - r) + c)}s` }} />
      )))}
    </svg>
  );
}

function Legend({ pairs }: { pairs: Array<[string[], string]> }) {
  return (
    <div className="ob-legend">
      {pairs.map(([ks, what]) => <span key={what}><Keys ks={ks} />{what}</span>)}
    </div>
  );
}

const said = (when: number) => {
  const a = ago(when);
  return /^\d/.test(a) ? `${a} ago` : a;
};

export function FirstRunFlow({ snap, home, onDone, look = 'light', skies = false, onLook, onSetup, onProject, onLeave }: {
  snap: Snapshot | null;
  home: string;
  /** The look worn now and how to change it, for the setup's look step. */
  look?: string;
  skies?: boolean;
  onLook?: (id: string) => void;
  /** The project the setup made, so the composer behind it is addressed to it. */
  onProject?: (slug: string) => void;
  /** Called as the setup beside the app opens, so the app behind it can show Home. */
  onSetup?: () => void;
  /** Called once, when the first run hands over to the inbox, with how many chats it brought in. */
  onDone: (brought: number) => void;
  /** Set up again from ⌘K, with the app behind it to go back to. */
  onLeave?: () => void;
}) {
  const [screen, setScreen] = useState<Screen | 'setup'>('welcome');
  const dark = useDarkWindow();
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState<Engine[] | undefined>(undefined);
  const hasReady = !!ready?.length;
  const [signedOut, setSignedOut] = useState<Engine[]>([]);
  const [setup, setSetup] = useState<{ engine: Engine; phase: string; error: string | null } | null>(null);
  const gate = installGate(setup, signedOut);
  const [threads, setThreads] = useState<SessionThread[] | null>(null);
  const [chatTicks, setChatTicks] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);

  // WHAT IS ON THIS COMPUTER, asked once.
  useEffect(() => {
    let live = true;
    (async () => {
      const [claude, codex] = await Promise.all([
        api.engineSetup('ready', 'claude').catch(() => null),
        api.engineSetup('ready', 'codex').catch(() => null),
      ]);
      if (!live) return;
      setReady(readyEngines([claude, codex]));
      setSignedOut(signedOutEngines([claude, codex]));
    })();
    api.agentThreads().then((t) => { if (live) setThreads(t); }).catch(() => { if (live) setThreads([]); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (screen === 'setup') return;
    try { window.zero?.track?.('first_run_step', FIRST_RUN_STEP[screen]); } catch {}
  }, [screen]);

  // AN AGENT BEING INSTALLED OR SIGNED IN, watched until it is ready.
  useEffect(() => {
    if (!setup || setup.phase === 'ready' || setup.phase === 'failed') return undefined;
    const tick = setInterval(async () => {
      const s = await api.engineSetup('status', setup.engine).catch(() => null);
      if (!s) return;
      setSetup({ engine: setup.engine, phase: s.phase, error: s.error ?? null });
      if (s.phase === 'ready') setReady((had) => [...new Set([...(had ?? []), setup.engine])]);
    }, 1000);
    return () => clearInterval(tick);
  }, [setup]);

  // A setup the app is running that this screen did not see start.
  useEffect(() => {
    const look = async () => {
      const found = runningSetup(await Promise.all([
        api.engineSetup('status', 'claude').catch(() => null),
        api.engineSetup('status', 'codex').catch(() => null),
      ]));
      if (found) setSetup((had) => (installGate(had).running ? had : found));
    };
    void look();
    window.addEventListener('focus', look);
    return () => window.removeEventListener('focus', look);
  }, []);

  const chats = useMemo(() => chatChoices(threads ?? [], { home }), [threads, home]);
  const backTo = screen === 'setup' ? null : previousScreen(screen);

  // Every chat starts ticked, once the list has arrived.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || threads === null) return;
    seeded.current = true;
    setChatTicks(new Set(chats.map((t) => t.id)));
  }, [threads, chats]);

  const known = useMemo(
    () => (snap?.products ?? []).map((p) => ({ slug: p.slug, name: p.name, repoPath: p.repoPath ?? null })),
    [snap?.products],
  );
  // One name per folder, worked out once, so a row and the project it makes agree.
  const naming = useMemo(() => new Map(projectsToMake(chats, known).map((p) => [p.folder, p.name])), [chats, known]);
  const ownerOf = useCallback((folder: string): Project | null => {
    const p = known.find((k) => bare(k.repoPath ?? '') === folder);
    return p ? { slug: p.slug, name: p.name } : null;
  }, [known]);
  const workspace = useMemo((): Project | null => {
    const p = (snap?.products ?? []).find((x) => x.personal);
    return p ? { slug: p.slug, name: p.name } : null;
  }, [snap?.products]);
  const nameOf = useCallback((folder: string) => (inHomeFolder(folder) ? workspace?.name : null) ?? ownerOf(folder)?.name ?? naming.get(folder) ?? projectNameFor({ name: folder.split('/').pop() ?? '' }), [ownerOf, naming]);

  const go = useCallback((next: Screen | 'setup') => {
    setLeaving(true);
    setTimeout(() => { setScreen(next); setCursor(0); setLeaving(false); }, LEAVE_MS);
  }, []);
  const leave = useCallback((brought = 0) => {
    setLeaving(true);
    setTimeout(() => onDone(brought), LEAVE_MS);
  }, [onDone]);

  const start = useCallback(() => {
    if (!hasReady || !threads) return;
    onSetup?.();
    go('setup');
  }, [hasReady, threads, go, onSetup]);

  const startSetup = useCallback(async (engine: Engine) => {
    setSetup({ engine, phase: 'checking', error: null });
    const s = await api.engineSetup('start', engine).catch(() => null);
    setSetup({ engine, phase: s?.phase ?? 'installing', error: s?.error ?? null });
  }, []);
  const stopSetup = useCallback(() => {
    if (setup) void api.engineSetup('cancel', setup.engine).catch(() => null);
    setSetup(null);
  }, [setup]);
  const signInAgain = useCallback(() => {
    if (setup) void api.engineSetup('again', setup.engine).catch(() => null);
  }, [setup]);

  /** The folder's project, made now if it has none. `counted` says this press was already counted once. */
  const projectFor = useCallback(async (folder: string, counted = false): Promise<Project | null> => {
    if (inHomeFolder(folder)) return workspace;
    const had = ownerOf(folder);
    if (had) return had;
    try {
      const got = await api.createProduct({ name: nameOf(folder), repoPath: folder, ofMany: counted }) as { slug?: string } | null;
      return got?.slug ? { slug: got.slug, name: nameOf(folder) } : null;
    } catch { return null; }
  }, [ownerOf, nameOf, workspace]);

  const picked = chats.filter((t) => chatTicks.has(t.id));

  // EACH CHAT GOES TO THE PROJECT FOR THE FOLDER IT RAN IN, made here when
  // there is none, so its next reply runs where it always did.
  const bringIn = useCallback(async () => {
    if (busy || !picked.length) return 0;
    setBusy(true);
    const by = new Map<string, string[]>();
    for (const t of picked) by.set(bare(t.folder), [...(by.get(bare(t.folder)) ?? []), t.id]);
    let n = 0;
    for (const [folder, ids] of by) {
      const p = await projectFor(folder, n++ > 0);
      if (!p) continue;
      await api.importThreads({ product: p.slug, threads: ids, land: 'inbox' }).catch(() => null);
      // The first thread goes to where the newest chat ran, not to My Workspace.
      if (n === 1) { try { localStorage.setItem(LAST_PRODUCT_KEY, p.slug); } catch { /* the box asks instead */ } onProject?.(p.slug); }
    }
    setBusy(false);
    return picked.length;
  }, [busy, picked, projectFor, onProject]);

  // THE KEYBOARD, for both screens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The setup beside the app hears its own keys.
      if (screen === 'setup') return;
      e.stopPropagation();
      if (leaving) return;
      if ((e.target as Element | null)?.closest('.ob-back') && (e.key === 'Enter' || e.key === ' ')) return;
      if (screen === 'welcome') {
        if (e.key === 'Enter' && hasReady) { e.preventDefault(); start(); }
        else if (!hasReady && gate.running && e.key === 'Escape') { e.preventDefault(); stopSetup(); }
        else if (!hasReady && gate.again && e.key === 'Enter') { e.preventDefault(); signInAgain(); }
        else if (!hasReady && !gate.running && e.key === '1') startSetup('claude');
        else if (!hasReady && !gate.running && e.key === '2') startSetup('codex');
        else if (onLeave && e.key === 'Escape') { e.preventDefault(); onLeave(); }
        return;
      }
      const k = listKey(e);
      if (!k) return;
      e.preventDefault();
      if (k === 'up') setCursor((c) => Math.max(0, c - 1));
      if (k === 'down') setCursor((c) => Math.min(chats.length - 1, c + 1));
      if (k === 'toggle' && chats[cursor]) {
        const id = chats[cursor].id;
        setChatTicks((had) => { const n = new Set(had); if (n.has(id)) n.delete(id); else n.add(id); return n; });
      }
      if (k === 'next') void bringIn().then((n) => leave(n));
      if (k === 'skip') leave(0);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [screen, leaving, hasReady, gate.running, gate.again, chats, cursor, start, startSetup, stopSetup, signInAgain, bringIn, leave, onLeave]);

  const cls = `ob-screen${leaving ? ' ob-leaving' : ''}`;

  if (screen === 'setup') {
    return <SetupSplit snap={snap} chats={chats} ticks={chatTicks}
      onToggle={(id) => setChatTicks((had) => { const n = new Set(had); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
      bringIn={bringIn} projectFor={async (folder) => { const p = await projectFor(folder); if (p) onProject?.(p.slug); return p; }} look={look} skies={skies} onLook={(id) => onLook?.(id)} onDone={onDone} onBack={() => go('welcome')} />;
  }

  return (
    <div className="first-run" role="dialog" aria-label="Set up" onKeyDown={(e) => e.stopPropagation()}>
      {backTo && <button type="button" className="ob-back" disabled={busy || leaving} onClick={() => go(backTo)}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9.5 3-5 5 5 5" /></svg>
        Back
      </button>}
      {screen === 'welcome' && onLeave && <button type="button" className="ob-back" disabled={leaving} onClick={onLeave}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9.5 3-5 5 5 5" /></svg>
        Back
      </button>}
      {screen === 'welcome' && (
        <div className={`${cls} ob-welcome`} key="welcome">
          <WelcomeSky dark={dark} />
          <div className="ob-col ob-mid ob-hero">
            <Mark />
            {ready && !hasReady ? (
              <>
                <h1 className="ob-big ob-in" style={{ animationDelay: '1.3s' }}>{gate.heading}</h1>
                <div className="ob-actions ob-in" style={{ animationDelay: '1.6s', marginTop: 40 }}>
                  {gate.running ? <>
                    {gate.again && <button type="button" className="ob-btn" onClick={signInAgain}>Open the page again <Key k="↵" /></button>}
                    <button type="button" className="ob-btn ob-quiet" onClick={stopSetup}>Back <Key k="esc" /></button>
                  </> : <>
                    <button type="button" className="ob-btn" onClick={() => startSetup('claude')}>{setupWord('claude', signedOut)} <Key k="1" /></button>
                    <button type="button" className="ob-btn" onClick={() => startSetup('codex')}>{setupWord('codex', signedOut)} <Key k="2" /></button>
                  </>}
                </div>
              </>
            ) : (
              <>
                <h1 className="ob-big ob-in" style={{ animationDelay: '1.3s' }}>An inbox for hundreds of agents.</h1>
                <p className="ob-lede ob-in" style={{ animationDelay: '1.45s' }}>Start as many as you like. Each works on its own, and comes back to you only when it needs you.</p>
                <div className="ob-actions ob-in" style={{ animationDelay: '1.6s', marginTop: 40 }}>
                  <button type="button" className="ob-btn" disabled={!hasReady || !threads} onClick={start}>Get started <Key k="↵" /></button>
                </div>
              </>
            )}
          </div>
          <div className="ob-check ob-foot ob-in" style={{ animationDelay: '2.1s' }}>
            {setup && setup.phase !== 'ready' ? (
              <>
                <span className="ob-sq ob-live" />{ENGINE_NAME[setup.engine]}
                <b>{setup.phase === 'failed' ? (setup.error ?? 'did not finish') : setup.phase === 'signing-in' ? 'finish in your browser' : 'installing'}</b>
              </>
            ) : ready?.length ? (
              <><span className="ob-sq" />{ready.map((engine) => ENGINE_NAME[engine]).join(' and ')} <b>ready</b></>
            ) : ready ? (
              <><span className="ob-sq ob-off" />{foundLine(signedOut)[0]} <b>{foundLine(signedOut)[1]}</b></>
            ) : (
              <><span className="ob-sq ob-off" />Checking this computer</>
            )}
          </div>
        </div>
      )}

      {screen === 'chats' && (
        <div className={cls} key="chats">
          <div className="ob-col">
            <h1 className="ob-in">{chatsHeadline(chats)}</h1>
            <div className="ob-list" style={{ marginTop: 28 }}>
              {chats.map((t, i) => (
                <div key={t.id} className={`ob-item ob-in${cursor === i ? ' ob-on' : ''}`} style={{ animationDelay: `${0.12 + 0.05 * i}s` }}
                  onClick={() => { setCursor(i); setChatTicks((had) => { const n = new Set(had); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; }); }}>
                  <div className="ob-slot"><span className={`ob-tick${chatTicks.has(t.id) ? ' ob-on' : ''}`} /></div>
                  <div className="ob-name"><span>{t.title}</span></div>
                  <div className="ob-meta">{nameOf(bare(t.folder))} · {said(t.when)}</div>
                </div>
              ))}
            </div>
            <div className="ob-actions ob-in" style={{ marginTop: 28, animationDelay: '0.4s' }}>
              <button type="button" className="ob-btn" disabled={busy || !picked.length} onClick={() => void bringIn().then((n) => leave(n))}>
                {picked.length === 1 ? 'Bring in 1 chat' : `Bring in ${picked.length} chats`} <Keys ks={SEND} />
              </button>
              <button type="button" className="ob-btn ob-quiet" onClick={() => leave(0)}>Not now <Key k="esc" /></button>
            </div>
          </div>
          <Legend pairs={[[['↑', '↓'], 'Move'], [['↵'], 'Tick a chat']]} />
        </div>
      )}
    </div>
  );
}
