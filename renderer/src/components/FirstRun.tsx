// THE FIRST RUN (w-fadbbea8ef): a welcome, your latest chats and a first real
// task, then the inbox. The rules are in ../first-run.ts.
//
// It holds the keyboard while it is up: one listener on the window, in the
// capture phase, so none of the inbox's own keys fire behind it. Typing in its
// fields still works, because nothing here cancels a key's default.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { Snapshot } from '../types';
import type { SessionThread } from '../agent-import-card';
import { projectNameFor, slugFor } from '../agent-import-card';
import { shortPath } from '../onboarding';
import { ago } from '../format';
import { MAC } from '../this-keyboard';
import { taskTitle } from '../team/agent-mentions';
import { projectSwatch } from '../threads/composer-rules';
import { WhenPicker, WHEN_NOW, type WhenValue } from './When';
import FolderPicker from './FolderPicker';
import { checkProjectFolder } from '../../../shared/project-folder-check.mjs';
import {
  ENGINE_NAME, chatChoices, chatsHeadline, FIRST_RUN_STEP, firstRunOf, folderChoices, ideasFor, installGate, isSend, listKey, previousScreen, projectsToMake, readyEngines, stepsFor,
  type Engine, type FolderChoice, type Screen, type Step,
} from '../first-run';
import './first-run.css';

type Project = { slug: string; name: string };

const SEND = MAC ? ['⌘', '↵'] : ['Ctrl', '↵'];
const LEAVE_MS = 260;
const IDEAS = ideasFor();
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

const RepeatIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M17 3l3 3-3 3" /><path d="M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3" /><path d="M20 13v2a3 3 0 0 1-3 3H4" />
  </svg>
);

export function FirstTaskSchedule({ value, onChange }: { value: WhenValue; onChange: (v: WhenValue) => void }) {
  if (!value.repeat && !value.runAt) return null;
  return <span className="ob-chip ob-repeat">
    <RepeatIcon />
    <WhenPicker value={value} onChange={onChange} />
    <button type="button" className="ob-x" aria-label="Remove schedule" onClick={() => onChange(WHEN_NOW)}>×</button>
  </span>;
}

function Legend({ pairs }: { pairs: Array<[string[], string]> }) {
  return (
    <div className="ob-legend">
      {pairs.map(([ks, what]) => <span key={what}><Keys ks={ks} />{what}</span>)}
    </div>
  );
}

function Steps({ steps, now }: { steps: Step[]; now: Step }) {
  const at = steps.indexOf(now);
  return (
    <div className="ob-steps" aria-hidden="true">
      {steps.map((s, i) => <i key={s} className={i < at ? 'ob-done' : i === at ? 'ob-now' : ''} />)}
    </div>
  );
}

/** ↵ beside the first thread after the first run, drawn as the app's own hint
 *  plate. It never takes the pointer and goes when a thread is opened. */
export function OpenLesson({ at }: { at: { left: number; top: number } | null }) {
  if (!at) return null;
  return (
    <div className="hint-plate ob-lesson" style={{ left: at.left, top: at.top }} aria-hidden="true">
      <div className="hint-line"><span className="hint-caps"><kbd>↵</kbd></span><span className="hint-what">Open task</span></div>
    </div>
  );
}

const said = (when: number) => {
  const a = ago(when);
  return /^\d/.test(a) ? `${a} ago` : a;
};

export function FirstRunFlow({ snap, home, onDone }: {
  snap: Snapshot | null;
  home: string;
  /** Called once, with the task that was sent, or null when none was. */
  onDone: (sent: string | null, runAt?: number, draft?: string) => void;
}) {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState<Engine[] | undefined>(undefined);
  const hasReady = !!ready?.length;
  const [setup, setSetup] = useState<{ engine: Engine; phase: string; error: string | null } | null>(null);
  const gate = installGate(setup);
  const [threads, setThreads] = useState<SessionThread[] | null>(null);
  const [chatTicks, setChatTicks] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  // Projects this run made, by folder, until a snapshot carries them.
  const [made, setMade] = useState<Record<string, Project>>({});
  const [extra, setExtra] = useState<FolderChoice[]>([]);
  // The system's folder window can take a couple of seconds to appear.
  const [opening, setOpening] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [when, setWhen] = useState<WhenValue>(WHEN_NOW);
  const [idea, setIdea] = useState(-1);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try { window.zero?.track?.('first_run_step', FIRST_RUN_STEP[screen]); } catch {}
  }, [screen]);

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
    })();
    api.agentThreads().then((t) => { if (live) setThreads(t); }).catch(() => { if (live) setThreads([]); });
    return () => { live = false; };
  }, []);

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

  const chats = useMemo(() => chatChoices(threads ?? [], { home }), [threads, home]);
  const steps = stepsFor({ chats: chats.length });
  const backTo = previousScreen(screen, { chats: chats.length });

  // Every chat starts ticked, once the list has arrived.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || threads === null) return;
    seeded.current = true;
    setChatTicks(new Set(chats.map((t) => t.id)));
  }, [threads, chats]);

  // The folders a first task can run in: where your chats ran, then any you chose.
  const places = useMemo(() => {
    const found = folderChoices(threads ?? [], { home });
    const seen = new Set(found.map((f) => f.folder));
    const more = [
      ...Object.entries(made).map(([folder, p]) => ({ folder, name: p.name, short: shortPath(folder, home), chats: 0, when: 0 })),
      ...extra,
    ].filter((f) => !seen.has(f.folder) && seen.add(f.folder));
    return [...found, ...more];
  }, [threads, home, made, extra]);
  // The folder the project screen's keyboard is on. The last row there opens
  // the folder window, so it has no folder.
  const at = screen === 'where' ? places[cursor]?.folder ?? null : null;

  const known = useMemo(() => [
    ...(snap?.products ?? []).map((p) => ({ slug: p.slug, name: p.name, repoPath: p.repoPath ?? null })),
    ...Object.entries(made).map(([folder, p]) => ({ ...p, repoPath: folder })),
  ], [snap?.products, made]);
  const ownerOf = useCallback((folder: string): Project | null => {
    const p = known.find((k) => bare(k.repoPath ?? '') === folder);
    return p ? { slug: p.slug, name: p.name } : null;
  }, [known]);
  // One name per folder, worked out once, so a row and the project it makes agree.
  const naming = useMemo(
    () => new Map(projectsToMake([...chats, ...places], known).map((p) => [p.folder, p.name])),
    [chats, places, known],
  );
  const nameOf = useCallback((folder: string) => ownerOf(folder)?.name ?? naming.get(folder) ?? projectNameFor({ name: folder.split('/').pop() ?? '' }), [ownerOf, naming]);
  const swatchOf = (folder: string) => projectSwatch(ownerOf(folder)?.slug ?? slugFor(nameOf(folder)));

  const go = useCallback((next: Screen) => {
    setProblem(null);
    setIdea(-1);
    setLeaving(true);
    setTimeout(() => { setScreen(next); setCursor(0); setLeaving(false); }, LEAVE_MS);
  }, []);
  const leave = useCallback((sent: string | null) => {
    // Sending the first task is finishing; leaving without one is not.
    if (sent) { try { window.zero?.track?.('first_run_finished'); } catch {} }
    setLeaving(true);
    setTimeout(() => onDone(sent, when.runAt, sent ? undefined : text), LEAVE_MS);
  }, [onDone, when.runAt, text]);

  const start = useCallback(() => {
    if (hasReady && threads) go(chats.length ? 'chats' : 'task');
  }, [hasReady, threads, chats.length, go]);

  const startSetup = useCallback(async (engine: Engine) => {
    const s = await api.engineSetup('start', engine).catch(() => null);
    setSetup({ engine, phase: s?.phase ?? 'installing', error: s?.error ?? null });
  }, []);

  /** The folder's project, made now if it has none. `counted` says this press was already counted once. */
  const projectFor = useCallback(async (folder: string, counted = false): Promise<Project | null> => {
    const had = ownerOf(folder);
    if (had) return had;
    const name = nameOf(folder);
    try {
      const got = await api.createProduct({ name, repoPath: folder, ofMany: counted }) as { slug?: string } | null;
      if (!got?.slug) return null;
      const p = { slug: got.slug, name };
      setMade((m) => ({ ...m, [folder]: p }));
      return p;
    } catch { return null; }
  }, [ownerOf, nameOf]);

  const picked = chats.filter((t) => chatTicks.has(t.id));

  // EACH CHAT GOES TO THE PROJECT FOR THE FOLDER IT RAN IN, made here when
  // there is none, so its next reply runs where it always did.
  const bringIn = useCallback(async () => {
    if (busy || !picked.length) return;
    setBusy(true);
    const by = new Map<string, string[]>();
    for (const t of picked) by.set(bare(t.folder), [...(by.get(bare(t.folder)) ?? []), t.id]);
    let n = 0;
    for (const [folder, ids] of by) {
      const p = await projectFor(folder, n++ > 0);
      if (p) await api.importThreads({ product: p.slug, threads: ids, land: 'inbox' }).catch(() => null);
    }
    setBusy(false);
    go('task');
  }, [busy, picked, projectFor, go]);

  const next = useCallback(() => {
    if (text.trim() && !busy) go('where');
  }, [text, busy, go]);

  const sendTo = useCallback(async (folder: string) => {
    const said = text.trim();
    if (!said || busy) return;
    setBusy(true);
    const p = await projectFor(folder);
    if (!p) { setBusy(false); setProblem('That folder could not be used. Choose another.'); return; }
    const body = said;
    let first: string | null = null;
    if (when.repeat) {
      const rule = when.repeat;
      const made = await api.composeRepeat({ product: p.slug, title: taskTitle(said), body, priority: 5, rule }).catch(() => null);
      first = made?.id ? firstRunOf(made) : null;
    } else {
      const item = await api.compose({ product: p.slug, title: taskTitle(said), body, kind: 'directive', priority: 5, runAt: when.runAt }).catch(() => null);
      first = item?.id ?? null;
    }
    if (!first) { setBusy(false); setProblem('That did not send. Try again.'); return; }
    leave(first);
  }, [text, when, busy, projectFor, leave]);

  const chooseFolder = useCallback((picked: string) => {
    const folder = bare(picked);
    const verdict = checkProjectFolder(folder, { home });
    setBrowsing(false);
    if (!verdict.ok) { setProblem(verdict.say ?? 'Choose a project folder.'); return; }
    setProblem(null);
    const choice: FolderChoice = { folder, name: projectNameFor({ name: folder.split('/').pop() ?? '' }), short: shortPath(folder, home), chats: 0, when: Date.now() };
    setExtra((had) => (had.some((f) => f.folder === folder) ? had : [...had, choice]));
    void sendTo(folder);
  }, [home, sendTo]);

  // The system's folder window has the person's sidebar, recents and search.
  // Only a browser tab, which has none, gets the picker the app draws.
  const chooseAnother = useCallback(async () => {
    if (busy || opening) return;
    setOpening(true);
    // No folder named leaves it to main, which knows what is on this disk.
    const { path: picked, refused: why, browse } = await api.chooseFolder(places[0]?.folder)
      .finally(() => setOpening(false));
    if (browse) { setBrowsing(true); return; }
    if (why) { setProblem(why); return; }
    if (picked) chooseFolder(picked);
  }, [busy, opening, places, chooseFolder]);

  const pickPlace = useCallback((i: number) => {
    const folder = places[i]?.folder;
    if (folder) void sendTo(folder);
    else void chooseAnother();
  }, [places, sendTo, chooseAnother]);

  const pickIdea = useCallback((i: number) => {
    setText(IDEAS[i].text);
    const suggested = IDEAS[i].repeat;
    if (suggested) {
      const { short: _short, label: _label, ...rule } = suggested;
      setWhen({ runAt: 0, repeat: rule });
    } else setWhen(WHEN_NOW);
    setIdea(-1);
    setTimeout(() => { const f = field.current; if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 0);
  }, []);

  const skip = useCallback(() => leave(null), [leave]);

  // THE KEYBOARD, for every screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (browsing || (e.target as Element | null)?.closest('.when-wrap')) return;
      e.stopPropagation();
      if (leaving) return;
      if ((e.target as Element | null)?.closest('.ob-back') && (e.key === 'Enter' || e.key === ' ')) return;
      if (screen === 'welcome') {
        if (e.key === 'Enter' && hasReady) { e.preventDefault(); start(); }
        else if (!hasReady && !gate.running && e.key === '1') startSetup('claude');
        else if (!hasReady && !gate.running && e.key === '2') startSetup('codex');
        return;
      }
      if (screen === 'chats') {
        const k = listKey(e);
        if (!k) return;
        e.preventDefault();
        if (k === 'up') setCursor((c) => Math.max(0, c - 1));
        if (k === 'down') setCursor((c) => Math.min(chats.length - 1, c + 1));
        if (k === 'toggle' && chats[cursor]) {
          const id = chats[cursor].id;
          setChatTicks((had) => { const n = new Set(had); if (n.has(id)) n.delete(id); else n.add(id); return n; });
        }
        if (k === 'next') bringIn();
        if (k === 'skip') go('task');
        return;
      }
      if (screen === 'where') {
        if (busy || opening) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(places.length, c + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); pickPlace(cursor); }
        else if (e.key === 'Escape') { e.preventDefault(); go('task'); }
        return;
      }
      if (screen === 'task') {
        if (isSend(e)) { e.preventDefault(); next(); return; }
        if (e.key === 'Escape') { e.preventDefault(); skip(); return; }
        const inField = document.activeElement === field.current;
        const onLastLine = inField && !text.slice(field.current?.selectionStart ?? 0).includes('\n');
        if (e.key === 'ArrowDown' && (idea >= 0 || onLastLine)) { e.preventDefault(); setIdea((i) => Math.min(IDEAS.length - 1, i + 1)); field.current?.blur(); }
        else if (e.key === 'ArrowUp' && idea >= 0) {
          e.preventDefault();
          if (idea === 0) { setIdea(-1); field.current?.focus(); } else setIdea((i) => i - 1);
        } else if (e.key === 'Enter' && idea >= 0) {
          e.preventDefault();
          pickIdea(idea);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [screen, leaving, hasReady, gate.running, chats, cursor, busy, opening, places, idea, text, browsing, go, start, startSetup, bringIn, next, skip, pickPlace, pickIdea]);

  useEffect(() => {
    if (browsing) document.querySelector<HTMLInputElement>('.first-run .fp-path')?.focus();
    else if (screen === 'task' && !leaving) field.current?.focus();
  }, [screen, leaving, browsing]);

  // The field grows with what is typed in it.
  useEffect(() => {
    const f = field.current;
    if (!f) return;
    f.style.height = 'auto';
    f.style.height = `${f.scrollHeight}px`;
  }, [text, screen]);

  const cls = `ob-screen${leaving ? ' ob-leaving' : ''}`;

  return (
    <div className="first-run" role="dialog" aria-label="Set up" onKeyDown={(e) => e.stopPropagation()}>
      {browsing && <FolderPicker title="Choose your project folder" startIn={places[0]?.folder ?? home} onPick={chooseFolder} onClose={() => setBrowsing(false)} />}
      {backTo && !browsing && <button type="button" className="ob-back" disabled={busy || leaving} onClick={() => go(backTo)}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m9.5 3-5 5 5 5" /></svg>
        Back
      </button>}
      {screen === 'welcome' && (
        <div className={cls} key="welcome">
          <div className="ob-col ob-mid ob-center">
            <Mark />
            {ready && !hasReady ? (
              <>
                <h1 className="ob-big ob-in" style={{ animationDelay: '1.3s' }}>{gate.heading}</h1>
                <div className="ob-actions ob-in" style={{ animationDelay: '1.6s', marginTop: 40 }}>
                  <button type="button" className="ob-btn" disabled={gate.running} onClick={() => startSetup('claude')}>Install Claude Code <Key k="1" /></button>
                  <button type="button" className="ob-btn" disabled={gate.running} onClick={() => startSetup('codex')}>Install Codex <Key k="2" /></button>
                </div>
              </>
            ) : (
              <>
                <h1 className="ob-big ob-in" style={{ animationDelay: '1.3s' }}>Give your agents an inbox</h1>
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
              <><span className="ob-sq ob-off" />No coding agent <b>found</b></>
            ) : (
              <><span className="ob-sq ob-off" />Checking this computer</>
            )}
          </div>
        </div>
      )}

      {screen === 'chats' && (
        <div className={cls} key="chats">
          <Steps steps={steps} now="chats" />
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
              <button type="button" className="ob-btn" disabled={busy || !picked.length} onClick={bringIn}>
                {picked.length === 1 ? 'Bring in 1 chat' : `Bring in ${picked.length} chats`} <Keys ks={SEND} />
              </button>
              <button type="button" className="ob-btn ob-quiet" onClick={() => go('task')}>Not now <Key k="esc" /></button>
            </div>
          </div>
          <Legend pairs={[[['↑', '↓'], 'Move'], [['↵'], 'Tick a chat']]} />
        </div>
      )}

      {screen === 'task' && (
        <div className={cls} key="task">
          <Steps steps={steps} now="task" />
          <div className="ob-col">
            <h1 className="ob-in">What’s the first task you want to give your agent?</h1>
            <div className="ob-compose ob-in" style={{ marginTop: 36, animationDelay: '0.1s' }}>
              <textarea ref={field} className="ob-write" rows={1} value={text} placeholder="What do you need done?"
                onChange={(e) => { setText(e.target.value); setIdea(-1); }} onFocus={() => setIdea(-1)} />
              <div className="ob-bar">
                <div className="ob-chips">
                  <FirstTaskSchedule value={when} onChange={setWhen} />
                </div>
                <div className="ob-actions">
                  <button type="button" className="ob-btn ob-quiet" onClick={skip}>Not now <Key k="esc" /></button>
                  <button type="button" className="ob-btn" disabled={!text.trim() || busy} onClick={next}>Next <Keys ks={SEND} /></button>
                </div>
              </div>
            </div>
            <div className="ob-ideas ob-in" style={{ animationDelay: '0.2s' }}>
              {IDEAS.map((t, i) => (
                <div key={t.text} className={`ob-item ob-noslot${idea === i ? ' ob-on' : ''}`} onClick={() => pickIdea(i)}>
                  <div className={`ob-name${idea === i ? '' : ' ob-dim'}`}><span>{t.text}</span></div>
                  <div className="ob-meta">{t.repeat?.short}</div>
                </div>
              ))}
            </div>
          </div>
          <Legend pairs={[[['↓'], 'Pick an idea']]} />
        </div>
      )}

      {screen === 'where' && (
        <div className={cls} key="where">
          <Steps steps={steps} now="where" />
          <div className="ob-col ob-mid ob-center">
            <p className="ob-said ob-in">{text.trim()}</p>
            <h1 className="ob-big ob-in" style={{ animationDelay: '0.1s' }}>Which project is it for?</h1>
            {places.length > 0 ? (
              <div className="ob-list ob-places ob-in" style={{ animationDelay: '0.2s' }} role="listbox" aria-label="Project">
                {places.map((p, i) => (
                  <div key={p.folder} role="option" aria-selected={cursor === i} className={`ob-item${cursor === i ? ' ob-on' : ''}`}
                    onMouseEnter={() => setCursor(i)} onClick={() => pickPlace(i)}>
                    <div className="ob-slot"><span className="ob-sw" style={{ background: swatchOf(p.folder) }} /></div>
                    <div className={`ob-name${cursor === i ? '' : ' ob-dim'}`}><span>{nameOf(p.folder)}</span></div>
                    <div className="ob-path">{p.short}</div>
                  </div>
                ))}
                <div role="option" aria-selected={cursor === places.length} className={`ob-item${cursor === places.length ? ' ob-on' : ''}`}
                  onMouseEnter={() => setCursor(places.length)} onClick={() => pickPlace(places.length)}>
                  <div className="ob-slot"><span className="ob-plus">+</span></div>
                  <div className={`ob-name${cursor === places.length ? '' : ' ob-dim'}`}><span>Choose another folder</span></div>
                </div>
              </div>
            ) : (
              <div className="ob-actions ob-in" style={{ animationDelay: '0.2s', marginTop: 40 }}>
                <button type="button" className={`ob-btn${busy || opening ? ' ob-plain' : ''}`} disabled={busy || opening} onClick={() => void chooseAnother()}>
                  {opening ? 'Opening the folder window…' : busy ? 'Sending…' : <>Choose its folder <Key k="↵" /></>}
                </button>
              </div>
            )}
            {places.length > 0 && (opening || busy) && <p className="ob-working">{opening ? 'Opening the folder window…' : 'Sending…'}</p>}
            {problem && <p className="ob-refused">{problem}</p>}
          </div>
          {places.length > 0 && <Legend pairs={[[['↑', '↓'], 'Move'], [['↵'], 'Send']]} />}
        </div>
      )}
    </div>
  );
}
