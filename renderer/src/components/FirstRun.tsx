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
import {
  chatChoices, chatsHeadline, firstRunOf, folderChoices, ideasFor, isSend, listKey, projectsToMake, stepsFor,
  type FolderChoice, type Idea, type Step,
} from '../first-run';
import './first-run.css';

type Screen = 'welcome' | Step;
type Engine = 'claude' | 'codex';
type Project = { slug: string; name: string };

const ENGINE_NAME: Record<Engine, string> = { claude: 'Claude Code', codex: 'Codex' };
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
  onDone: (sent: string | null) => void;
}) {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState<Engine | null | undefined>(undefined);
  const [setup, setSetup] = useState<{ engine: Engine; phase: string; error: string | null } | null>(null);
  const [threads, setThreads] = useState<SessionThread[] | null>(null);
  const [chatTicks, setChatTicks] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  // Projects this run made, by folder, until a snapshot carries them.
  const [made, setMade] = useState<Record<string, Project>>({});
  const [extra, setExtra] = useState<FolderChoice[]>([]);
  const [place, setPlace] = useState<string | null>(null);
  // The row the keyboard is on in the project menu; null while it is shut.
  const [menu, setMenu] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [repeat, setRepeat] = useState<Idea['repeat'] | null>(null);
  const [idea, setIdea] = useState(-1);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement | null>(null);

  // WHAT IS ON THIS COMPUTER, asked once.
  useEffect(() => {
    let live = true;
    (async () => {
      const [claude, codex] = await Promise.all([
        api.engineSetup('ready', 'claude').catch(() => null),
        api.engineSetup('ready', 'codex').catch(() => null),
      ]);
      if (!live) return;
      const ok = (s: { found?: boolean; signedIn?: boolean } | null) => !!s?.found && !!s?.signedIn;
      setReady(ok(claude) ? 'claude' : ok(codex) ? 'codex' : null);
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
      if (s.phase === 'ready') setReady(setup.engine);
    }, 1000);
    return () => clearInterval(tick);
  }, [setup]);

  const chats = useMemo(() => chatChoices(threads ?? [], { home }), [threads, home]);
  const steps = stepsFor({ chats: chats.length });

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
  const at = place ?? places[0]?.folder ?? null;

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
    setLeaving(true);
    setTimeout(() => { setScreen(next); setCursor(0); setLeaving(false); }, LEAVE_MS);
  }, []);
  const leave = useCallback((sent: string | null) => {
    setLeaving(true);
    setTimeout(() => onDone(sent), LEAVE_MS);
  }, [onDone]);

  const start = useCallback(() => {
    if (ready && threads) go(chats.length ? 'chats' : 'task');
  }, [ready, threads, chats.length, go]);

  const startSetup = useCallback(async (engine: Engine) => {
    const s = await api.engineSetup('start', engine).catch(() => null);
    setSetup({ engine, phase: s?.phase ?? 'installing', error: s?.error ?? null });
  }, []);

  const chooseAnother = useCallback(async (): Promise<string | null> => {
    setMenu(null);
    const r = await api.chooseFolder(home || undefined);
    if (r.refused) { setProblem(r.refused); return null; }
    if (!r.path) return null;
    setProblem(null);
    const folder = bare(r.path);
    const choice: FolderChoice = { folder, name: projectNameFor({ name: folder.split('/').pop() ?? '' }), short: shortPath(folder, home), chats: 0, when: Date.now() };
    setExtra((had) => (had.some((f) => f.folder === folder) ? had : [...had, choice]));
    setPlace(folder);
    field.current?.focus();
    return folder;
  }, [home]);

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

  const send = useCallback(async () => {
    const said = text.trim();
    if (!said || busy) return;
    const folder = at ?? await chooseAnother();
    if (!folder) return;
    setBusy(true);
    const p = await projectFor(folder);
    if (!p) { setBusy(false); setProblem('That folder could not be used. Choose another.'); return; }
    const body = said.includes('\n') ? said : undefined;
    let first: string | null = null;
    if (repeat) {
      const { short: _short, label: _label, ...rule } = repeat;
      const made = await api.composeRepeat({ product: p.slug, title: taskTitle(said), body, priority: 5, rule }).catch(() => null);
      first = made?.id ? firstRunOf(made) : null;
    } else {
      const item = await api.compose({ product: p.slug, title: taskTitle(said), body, kind: 'directive', priority: 5 }).catch(() => null);
      first = item?.id ?? null;
    }
    if (!first) { setBusy(false); setProblem('That did not send. Try again.'); return; }
    leave(first);
  }, [text, repeat, busy, at, chooseAnother, projectFor, leave]);

  const pickIdea = useCallback((i: number) => {
    setText(IDEAS[i].text);
    setRepeat(IDEAS[i].repeat ?? null);
    setIdea(-1);
    setTimeout(() => { const f = field.current; if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 0);
  }, []);

  const skip = useCallback(() => leave(null), [leave]);

  const openMenu = useCallback(() => {
    if (!at) { void chooseAnother(); return; }
    setMenu((m) => (m === null ? Math.max(0, places.findIndex((p) => p.folder === at)) : null));
  }, [at, places, chooseAnother]);
  const pickPlace = useCallback((i: number) => {
    if (i >= places.length) { void chooseAnother(); return; }
    setPlace(places[i].folder);
    setProblem(null);
    setMenu(null);
    field.current?.focus();
  }, [places, chooseAnother]);

  // THE KEYBOARD, for every screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (leaving) return;
      if (screen === 'welcome') {
        if (e.key === 'Enter' && ready) { e.preventDefault(); start(); }
        else if (!ready && e.key === '1') startSetup('claude');
        else if (!ready && e.key === '2') startSetup('codex');
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
      if (screen === 'task') {
        if (menu !== null) {
          const rows = places.length + 1;
          if (e.key === 'ArrowDown') { e.preventDefault(); setMenu((m) => Math.min(rows - 1, (m ?? 0) + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setMenu((m) => Math.max(0, (m ?? 0) - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); pickPlace(menu); }
          else if (e.key === 'Escape') { e.preventDefault(); setMenu(null); field.current?.focus(); }
          return;
        }
        if (isSend(e)) { e.preventDefault(); send(); return; }
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
  }, [screen, leaving, ready, chats, cursor, menu, places, idea, text, go, start, startSetup, bringIn, send, skip, pickPlace, pickIdea]);

  useEffect(() => { if (screen === 'task' && !leaving) field.current?.focus(); }, [screen, leaving]);

  // The field grows with what is typed in it.
  useEffect(() => {
    const f = field.current;
    if (!f) return;
    f.style.height = 'auto';
    f.style.height = `${f.scrollHeight}px`;
  }, [text, screen]);

  const cls = `ob-screen${leaving ? ' ob-leaving' : ''}`;

  return (
    <div className="first-run" role="dialog" aria-label="Set up">
      {screen === 'welcome' && (
        <div className={cls} key="welcome">
          <div className="ob-col ob-mid ob-center">
            <Mark />
            {ready === null ? (
              <>
                <h1 className="ob-big ob-in" style={{ animationDelay: '1.3s' }}>Install Claude Code or Codex to start</h1>
                <div className="ob-actions ob-in" style={{ animationDelay: '1.6s', marginTop: 40 }}>
                  <button type="button" className="ob-btn" onClick={() => startSetup('claude')}>Install Claude Code <Key k="1" /></button>
                  <button type="button" className="ob-btn" onClick={() => startSetup('codex')}>Install Codex <Key k="2" /></button>
                </div>
              </>
            ) : (
              <>
                <h1 className="ob-big ob-in" style={{ animationDelay: '1.3s' }}>Give your agents an inbox</h1>
                <div className="ob-actions ob-in" style={{ animationDelay: '1.6s', marginTop: 40 }}>
                  <button type="button" className="ob-btn" disabled={!ready || !threads} onClick={start}>Get started <Key k="↵" /></button>
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
            ) : ready ? (
              <><span className="ob-sq" />{ENGINE_NAME[ready]} <b>ready</b></>
            ) : ready === null ? (
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
          {steps.length > 1 && <Steps steps={steps} now="task" />}
          {menu !== null && <div className="ob-scrim" onClick={() => setMenu(null)} />}
          <div className="ob-col">
            <h1 className="ob-in">Give an agent its first task</h1>
            <div className="ob-compose ob-in" style={{ marginTop: 36, animationDelay: '0.1s' }}>
              <textarea ref={field} className="ob-write" rows={1} value={text} placeholder="What do you need done?"
                onChange={(e) => { setText(e.target.value); setIdea(-1); }} onFocus={() => setIdea(-1)} />
              <div className="ob-bar">
                <div className="ob-chips">
                  <span className="ob-anchor">
                    <button type="button" className={`ob-chip${menu !== null ? ' ob-open' : ''}`} aria-haspopup="listbox" aria-expanded={menu !== null}
                      onMouseDown={(e) => e.preventDefault()} onClick={openMenu}>
                      {at ? <><span className="ob-sw" style={{ background: swatchOf(at) }} />{nameOf(at)}</> : <><span className="ob-plus">+</span>Choose a folder</>}
                    </button>
                    {menu !== null && (
                      <div className="ob-menu" role="listbox" aria-label="Project">
                        <span className="ob-menu-head">Project</span>
                        {places.map((p, i) => (
                          <button key={p.folder} type="button" role="option" aria-selected={p.folder === at}
                            className={`ob-row${menu === i ? ' ob-on' : ''}`} onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setMenu(i)} onClick={() => pickPlace(i)}>
                            <span className="ob-sw" style={{ background: swatchOf(p.folder) }} />
                            <span className="ob-row-name">{nameOf(p.folder)}</span>
                            <small>{p.short}</small>
                          </button>
                        ))}
                        <span className="ob-menu-rule" />
                        <button type="button" className={`ob-row${menu === places.length ? ' ob-on' : ''}`} onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setMenu(places.length)} onClick={() => pickPlace(places.length)}>
                          <span className="ob-plus">+</span><span className="ob-row-name">Choose another folder</span>
                        </button>
                      </div>
                    )}
                  </span>
                  {repeat && (
                    <button type="button" className="ob-chip ob-repeat" title="Run it once instead"
                      onMouseDown={(e) => e.preventDefault()} onClick={() => setRepeat(null)}>
                      <RepeatIcon />{repeat.label}<span className="ob-x" aria-label="Run it once instead">×</span>
                    </button>
                  )}
                </div>
                <div className="ob-actions">
                  <button type="button" className="ob-btn ob-quiet" onClick={skip}>Not now <Key k="esc" /></button>
                  <button type="button" className="ob-btn" disabled={!text.trim() || busy} onClick={send}>Send <Keys ks={SEND} /></button>
                </div>
              </div>
            </div>
            {problem && <p className="ob-refused">{problem}</p>}
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
    </div>
  );
}
