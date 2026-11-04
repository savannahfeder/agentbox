// A teammate's pages inside Chats: your chat with it, with its details or its
// Log beside it, About (what it does, in its own words), a playbook it reads,
// and the chat a new teammate starts as.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Playbook, Product, RunningSession, Teammate, TeammatesView, TeamChatLine, TeamRunLine, WorkItem } from '../types';
import { type TabView } from '../threads/Pages';
import { api } from '../api';
import { GREETING, MAX_HOPS, STARTERS, TEAMMATE_EFFORT, VOICES, VOICE_WORDS_MOST, starterAsks, teammateIdOf, voiceOf, yesFirst } from '../../../shared/teammates.mjs';
import { ModelPicker } from '../components/Model';
import type { ModelChoice } from '../models';
import { rememberedProject } from '../compose-project';
import { answerOf, answersMessage, chatEntries, chatWith, clockOf, dayOf, firstSentence, goalLine, heldFor, heldTitle, logOf, longMessage, nameOf, openQuestionsIn, SAVED_VERBS, startWord, titleAside, liveLine, pendingAsk, whyWaiting, type ChatEntry } from './chat-lines';
import { ChatsColumn } from './ChatsColumn';
import { nowLine, TeammateMark } from './TeammatesRail';
import { AskBeforeDeleting } from '../team/MessageMore';
import { Face } from '../team/people';
import './teammates.css';

const MD = [remarkGfm];
const ICON = {
  dots: <i className="tq-dots" aria-hidden="true" />,
  check: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  inbox: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 13.2 6.7 6.4A2 2 0 0 1 8.6 5h6.8a2 2 0 0 1 1.9 1.4l2.2 6.8V17a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" /><path d="M4.5 13.2h4.1l1.1 2.1h4.6l1.1-2.1h4.1" /></svg>,
  arrow: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  plus: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  reply: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 6 6" /></svg>,
  pause: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M9 6v12M15 6v12" /></svg>,
  stop: <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="7.5" width="9" height="9" fill="currentColor" /></svg>,
  doc: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><path d="M4 1.8h5.2L12 4.6v9.6H4z" /><path d="M9 1.8v3h3M6 8h4M6 10.5h4" /></svg>,
  // Three square dots, the thread view's ⋯.
  more: <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="2.5" y="7" width="2" height="2" /><rect x="7" y="7" width="2" height="2" /><rect x="11.5" y="7" width="2" height="2" /></svg>,
};

const YOU_GLYPH = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>;

/** What the store handed back, or false when it refused (the reason is shown). */
type Call = (op: string, args: Record<string, unknown>) => Promise<unknown>;
const NO_SESSIONS: ReadonlyMap<string, RunningSession> = new Map();
/** What the model menu needs: the engine a teammate with none runs on, and this Mac's Codex models. */
export type TeammateModels = { engine: string | null; codex: ModelChoice[]; codexDefault: string | null };
const NO_MODELS: TeammateModels = { engine: null, codex: [], codexDefault: null };
const noTab = (): TabView | null => null;
const noFile = (): void => {};

/** Which page is up: `new`, `<id>` (its chat), `sheet:<id>` (its chat, About over it), `log:<id>`, `about:<id>` (all it knows and does) or `book:<playbook>:<id>`. */
export type Shown = { kind: 'new' } | { kind: 'chat' | 'sheet' | 'log' | 'about'; id: string } | { kind: 'book'; id: string; book: string };
export function shownOf(open: string, team: Teammate[]): Shown {
  const [head, a, b] = open.split(':');
  const known = (id: string | undefined) => !!id && team.some((t) => t.id === id);
  if (head === 'book' && known(b)) return { kind: 'book', id: b!, book: a! };
  if ((head === 'log' || head === 'about' || head === 'sheet') && known(a)) return { kind: head, id: a! };
  if (known(open)) return { kind: 'chat', id: open };
  if (open !== 'new' && team.length) return { kind: 'chat', id: team[0].id };
  return { kind: 'new' };
}

export function TeammatesTitle({ view, open }: { view: TeammatesView | null; open: string }) {
  const team = view?.list ?? [];
  const shown = shownOf(open, team);
  const t = shown.kind === 'new' ? null : team.find((x) => x.id === shown.id) ?? null;
  const book = shown.kind === 'book' ? view?.playbooks?.find((p) => p.id === shown.book) : null;
  return <div className="gc-head tq-head">
    <div className="gc-head-col"><span className="workspace-title gc-col-title">Chats</span></div>
    {open === 'new' || !t
      ? <h1 className="workspace-title gc-head-group tq-title"><i className="tq tq-hd tq-hash" aria-hidden="true">+</i><span>New teammate</span></h1>
      : <h1 className="workspace-title gc-head-group tq-title"><TeammateMark t={t} size="hd" /><span>{book ? book.title : t.name}</span>{!book && <span className="tq-role">{titleAside(shown.kind, t.role, t)}</span>}</h1>}
  </div>;
}

// About stays in sight, one quiet word; Log, Pause and Delete behind the ⋯.
export function TeammateMenu({ t, shown, onOpen, call, onDeleted }: { t: Teammate; shown: Shown; onOpen: (open: string) => void; call: Call; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const rows: [string, () => void][] = [
    ...(shown.kind === 'about' ? [['Chat', () => onOpen(t.id)] as [string, () => void]] : []),
    shown.kind === 'log' ? ['Hide its log', () => onOpen(t.id)] : ['Log', () => onOpen(`log:${t.id}`)],
    t.paused ? ['Resume', () => { void call('update', { id: t.id, patch: { paused: false } }); }] : ['Pause', () => { void call('update', { id: t.id, patch: { paused: true } }); }],
    ...(!t.primary && t.status === 'active' ? [['Make primary', () => { void call('update', { id: t.id, patch: { primary: true } }); }] as [string, () => void]] : []),
    ['Delete', () => setAsking(true)],
  ];
  // The menu's call says only yes or no, and a refusal has to be read, so the
  // question comes back with the reason in it.
  const remove = async () => {
    const r = await api.teammates('remove', { id: t.id });
    if (!r.ok) { setRefused(r.error); setAsking(true); return; }
    onDeleted?.();
  };
  return <span className="ts-more-wrap" ref={wrap}>
    <button type="button" className={`tq-about-key${shown.kind === 'sheet' ? ' on' : ''}`} aria-expanded={shown.kind === 'sheet'} onClick={() => onOpen(shown.kind === 'sheet' ? t.id : `sheet:${t.id}`)}>About</button>
    <button type="button" className="ts-more" aria-label="Teammate options" title="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{ICON.more}</button>
    {open && <div className="th-menu ts-more-menu tq-menu" role="menu" aria-label="Teammate options">
      {rows.map(([label, act]) => <button key={label} type="button" role="menuitem" className="row-i ts-more-row" onClick={() => { setOpen(false); act(); }}><span className="ts-more-label">{label}</span></button>)}
    </div>}
    {asking && <AskBeforeDeleting title={`Delete ${t.name}?`} label={`Delete ${t.name}`}
      body={refused ?? 'It stops working, and its open threads close.'}
      onDelete={() => { void remove(); }} onClose={() => { setAsking(false); setRefused(null); }} />}
  </span>;
}

const NO_QUEUE: string[] = [];

export function TeammatesPage({ view, items = [], open, products, engines, onOpen, onOpenThread, onOpenFile = noFile, onChanged, me, mePic = null, sessions = NO_SESSIONS, queued = NO_QUEUE, models = NO_MODELS, tabOf = noTab }: {
  queued?: string[];
  onOpenFile?: (product: string, src: string) => void;
  /** Every thread the app holds, so what a teammate sent you is drawn as its inbox row. */
  items?: WorkItem[];
  models?: TeammateModels;
  /** Your photo, the one the sidebar draws for you. */
  mePic?: string | null;
  view: TeammatesView | null;
  /** The agents running now, by thread, so a teammate at work can say what it is doing. */
  sessions?: ReadonlyMap<string, RunningSession>;
  open: string;
  products: Product[];
  engines: { id: string; label: string }[];
  /** Another of these pages: `new`, an id, `sheet:<id>`, `log:<id>`, `about:<id>`, `book:<playbook>:<id>`. */
  onOpen: (open: string) => void;
  onOpenThread: (product: string, id: string) => void;
  /** The inbox tab a thread sits in, by the app's own rule, and a way to open the inbox there. */
  tabOf?: (item: WorkItem) => TabView | null;
  onChanged: () => void;
  me: string;
}) {
  const team = view?.list ?? [];
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setError(null); }, [open]);
  const call: Call = async (op, args) => {
    setError(null);
    const r = await api.teammates(op, args);
    if (!r.ok) { setError(r.error); return false; }
    onChanged();
    return r.value ?? true;
  };
  const shown = shownOf(open, team);
  const t = shown.kind === 'new' ? null : team.find((x) => x.id === shown.id) ?? null;
  let main: ReactNode;
  if (shown.kind === 'new' || !t) main = <NewTeammate team={team} products={products} call={call} error={error} onOpen={onOpen} />;
  else if (shown.kind === 'about') main = <About t={t} call={call} error={error} onOpen={onOpen} />;
  else if (shown.kind === 'book') main = <PlaybookPage t={t} book={view?.playbooks?.find((p) => p.id === shown.book) ?? null} team={team} onOpen={onOpen} onOpenThread={onOpenThread} />;
  else {
    main = <>
      <ChatColumn view={view} items={items} products={products} team={team} t={t} me={me} mePic={mePic} call={call} sessions={sessions} queued={queued} onOpen={onOpen} onOpenThread={onOpenThread} onOpenFile={onOpenFile} tabOf={tabOf}
        placeholder={t.status === 'draft' ? `Answer ${t.name === 'New teammate' ? 'your new teammate' : t.name}` : `Message ${t.name}`} error={error} />
      {shown.kind === 'log' && <LogPanel view={view} team={team} t={t} sessions={sessions} call={call} onClose={() => onOpen(t.id)} onOpenThread={onOpenThread} />}
      {shown.kind === 'sheet' && <Details t={t} view={view} products={products} engines={engines} models={models} call={call} onOpen={onOpen} />}
    </>;
  }
  return <div className="gr-page tq-chats"><div className="gr-body">
    <ChatsColumn current={t ? `teammate:${t.id}` : 'new'} />
    {main}
  </div></div>;
}

/** Your chat with one AI teammate, on its own, for a page that is not Chats: its place on the home. */
export function TeammateChat({ view, items = [], products, t, me, mePic = null, sessions = NO_SESSIONS, queued = NO_QUEUE, onOpen, onOpenThread, onOpenFile = noFile, onChanged, tabOf = noTab }: {
  queued?: string[];
  onOpenFile?: (product: string, src: string) => void;
  view: TeammatesView | null; items?: WorkItem[]; products: Product[]; t: Teammate; me: string; mePic?: string | null;
  sessions?: ReadonlyMap<string, RunningSession>; onOpen: (open: string) => void; onOpenThread: (product: string, id: string) => void; onChanged: () => void;
  tabOf?: (item: WorkItem) => TabView | null;
}) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setError(null); }, [t.id]);
  const call: Call = async (op, args) => {
    setError(null);
    const r = await api.teammates(op, args);
    if (!r.ok) { setError(r.error); return false; }
    onChanged();
    return r.value ?? true;
  };
  return <ChatColumn view={view} items={items} products={products} team={view?.list ?? []} t={t} me={me} mePic={mePic} call={call} sessions={sessions} queued={queued} onOpen={onOpen} onOpenThread={onOpenThread} onOpenFile={onOpenFile}
    tabOf={tabOf} placeholder={t.status === 'draft' ? `Answer ${t.name === 'New teammate' ? 'your new teammate' : t.name}` : `Message ${t.name}`} error={error} />;
}

/* ------------------------------------------------------------------ chat */
function ChatColumn({ view, items, products, team, t, me, mePic, call, sessions, queued = NO_QUEUE, onOpen, onOpenThread, onOpenFile, tabOf, placeholder, error }: {
  view: TeammatesView | null; items: WorkItem[]; products: Product[]; team: Teammate[]; t: Teammate; me: string; mePic: string | null; call: Call; sessions: ReadonlyMap<string, RunningSession>; queued?: string[];
  onOpen: (open: string) => void; onOpenThread: (product: string, id: string) => void; onOpenFile: (product: string, src: string) => void; placeholder: string; error: string | null;
  tabOf: (item: WorkItem) => TabView | null;
}) {
  const entries = chatWith(view, t.id);
  const scroller = useRef<HTMLDivElement>(null);
  const last = entries.at(-1)?.id;
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [last, t.id]);
  const open = entries.filter((e): e is TeamChatLine => e.kind === 'msg' && e.from === t.id && !!(e as TeamChatLine).options?.length && !answerOf(view, e as TeamChatLine));
  const asking = useAsking(open, t.id, call);
  let day = '';
  let prevFrom = '';
  let saved = false;
  // Threads it sent one after another are one list, as they would be in the inbox.
  let sent: TeamRunLine[] | null = null;
  const rows: ReactNode[] = [];
  for (const e of entries) {
    const d = dayOf(e.ts);
    if (d !== day) { rows.push(<div key={`day-${e.id}`} className="rm-day"><span className="rm-label">{d}</span></div>); day = d; prevFrom = ''; sent = null; }
    if (e.kind === 'run' && e.verb === 'sent' && sent) { sent.push(e as TeamRunLine); continue; }
    if (!(e.kind === 'run' && e.verb === 'sent')) sent = null;
    // Several things saved in a row read as one line.
    if (e.kind === 'act' && SAVED_VERBS.has(e.verb ?? '')) {
      if (!saved) rows.push(<Saved key={e.id} onSee={() => onOpen(`about:${t.id}`)} />);
      saved = true;
      continue;
    }
    saved = false;
    // Answers sent together are lit on their questions, so the message itself is one line.
    const answers = e.kind === 'msg' && e.from === 'you' ? Object.keys((e as TeamChatLine).answers ?? {}).length : 0;
    if (answers) {
      rows.push(<div key={e.id} className="tq-act">{ICON.reply}<span><span className="v">You answered {answers === 1 ? 'its question' : `${answers} questions`}</span></span><em>{clockOf(e.ts)}</em></div>);
      prevFrom = '';
    } else if (e.kind === 'msg') {
      const lead = e.from !== prevFrom;
      rows.push(<Message key={e.id} m={e} team={team} me={me} mePic={mePic} lead={lead} onOpenThread={onOpenThread} onOpenFile={onOpenFile} answered={answerOf(view, e)}
        asking={open.some((q) => q.id === e.id) ? asking : null} />);
      prevFrom = e.from;
    } else if (e.kind === 'run' && e.verb === 'sent') {
      sent = [e as TeamRunLine];
      rows.push(<SentCard key={e.id} runs={sent} items={items} tabOf={tabOf} onOpenThread={onOpenThread} />);
      // It stands apart from the messages, so the next one says who wrote it.
      prevFrom = '';
    } else {
      rows.push(<Activity key={e.id} e={e} view={view} team={team} only={t} sessions={sessions} call={call} onOpenThread={onOpenThread} />);
      // A message after an activity line says who it is from again.
      prevFrom = '';
    }
  }
  return <div className="gr-chat tq-chat">
    <div className="tq-lines" ref={scroller}>
      {rows.length ? rows : <p className="tq-empty">Nothing yet. Say hello to {t.name}.</p>}
      {t.running && <LiveRow t={t} session={sessions.get(t.running.id)} sessions={sessions} queued={queued} items={items} asked={pendingAsk(chatEntries(view, t.id), t.id)} onOpen={() => onOpenThread(t.running!.product, t.running!.id)} />}
    </div>
    {error && <p className="tq-error" role="alert">{error}</p>}
    {!error && (view?.trouble || view?.error) && <p className="tq-error" role="status">{view?.trouble ?? `Teammates could not be read: ${view?.error}`}</p>}
    <Composer placeholder={placeholder} onSend={async (text) => (await call('post', { text, to: [t.id] })) !== false}
      stop={t.running ? <button type="button" className="dock-stop" onClick={() => { void call('stop', { id: t.id }); }}
        aria-label={`Stop ${t.name}`} title={`Stop what ${t.name} is doing. It waits for your next message.`}>
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="9" height="9" fill="currentColor" /></svg>Stop
      </button> : null} />
  </div>;
}

const SENT_WORDS: Partial<Record<TabView, string>> = { inbox: 'Waiting on you', progress: 'In progress', done: 'Done' };

// What it sent you: one quiet line per thread, where it stands and its title, that opens it.
function SentCard({ runs, items, tabOf, onOpenThread }: {
  runs: TeamRunLine[]; items: WorkItem[]; tabOf: (item: WorkItem) => TabView | null;
  onOpenThread: (product: string, id: string) => void;
}) {
  return <div className="tq-sent">
    {runs.map((r) => {
      const item = items.find((i) => i.id === r.item && i.product === r.product) ?? null;
      const tab = item ? tabOf(item) : null;
      return <button key={r.id} type="button" className="tq-sent-line" onClick={() => onOpenThread(r.product, r.item)}>
        {tab === 'inbox' && <i className="tq-dot-need" aria-hidden="true" />}
        <span className="v">{(tab && SENT_WORDS[tab]) ?? 'Sent you'}:</span> <span className="t">{r.said || r.title}</span>
      </button>;
    })}
  </div>;
}

// One choice from a few, behind its current value, in the app's own small menu.
function PickOne({ value, options, onPick, label }: { value: string; options: { id: string; label: string }[]; onPick: (id: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const shown = options.find((o) => o.id === value)?.label ?? value;
  return <span className="compose-word-wrap tq-pick" ref={wrap}>
    <button type="button" className="compose-word set" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>{shown}</button>
    {open && <span className="prio-menu" role="listbox" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" role="option" aria-selected={o.id === value} className={`prio-menu-row${o.id === value ? ' on' : ''}`} onClick={() => { setOpen(false); if (o.id !== value) onPick(o.id); }}><span className="prio-menu-label">{o.label}</span></button>)}
    </span>}
  </span>;
}

function Saved({ onSee }: { onSee: () => void }) {
  return <div className="tq-act tq-saved">{ICON.check}<span><span className="v">Saved to its instructions</span> <Inline onClick={onSee}>See it</Inline></span></div>;
}

/** An answer you are giving one question: a tapped answer, or your own words while their box is open. */
type Choice = { chip: string | null; own: string | null };
const pickedText = (p: Choice | undefined) => (p ? p.chip ?? p.own?.trim() ?? '' : '');
type Asking = {
  picks: Record<string, Choice>; many: boolean; sending: boolean; count: number; answered: number; lastId: string | null;
  onPick: (id: string, p: Choice) => void;
  send: (chosen?: Record<string, Choice>) => void;
};

// A teammate's questions still waiting on you. With several, a tap picks an
// answer and one Send answers them all, since the first message you send wakes it.
function useAsking(open: TeamChatLine[], teammate: string, call: Call): Asking {
  const [picks, setPicks] = useState<Record<string, Choice>>({});
  const [sending, setSending] = useState(false);
  useEffect(() => { setPicks({}); }, [teammate]);
  const sendAnswers = async (chosen: Record<string, Choice>) => {
    const m = answersMessage(open, Object.fromEntries(Object.entries(chosen).map(([q, p]) => [q, pickedText(p)])));
    if (!m.text || sending) return;
    setSending(true);
    const ok = (await call('post', { text: m.text, to: [teammate], answers: m.answers })) !== false;
    setSending(false);
    if (ok) setPicks({});
  };
  return {
    picks, many: open.length > 1, sending, count: open.length, lastId: open.at(-1)?.id ?? null,
    answered: open.filter((q) => pickedText(picks[q.id])).length,
    onPick: (id, p) => setPicks((all) => ({ ...all, [id]: p })),
    send: (chosen) => { void sendAnswers(chosen ?? picks); },
  };
}

/** A teammate's open questions inside the inbox thread that asked them, answered as in its chat. */
export function ThreadQuestions({ view, item, onChanged }: { view: TeammatesView | null | undefined; item: WorkItem; onChanged: () => void }) {
  const tid = teammateIdOf(item) ?? '';
  const open = openQuestionsIn(view, item);
  const [error, setError] = useState<string | null>(null);
  const call: Call = async (op, args) => {
    setError(null);
    const r = await api.teammates(op, args);
    if (!r.ok) { setError(r.error); return false; }
    onChanged();
    return r.value ?? true;
  };
  const asking = useAsking(open, tid, call);
  if (!open.length) return null;
  return <div className="tq-thread-asks">
    {open.map((q) => <div key={q.id} className="tq-thread-ask">
      <div className="tx"><ReactMarkdown remarkPlugins={MD}>{q.text ?? ''}</ReactMarkdown></div>
      <Answers q={q.id} options={q.options ?? []} asking={asking} />
    </div>)}
    {error && <p className="tq-error" role="alert">{error}</p>}
  </div>;
}

// The answers under a question still waiting on you, and your own words as
// one more. With one question a tap sends; with several it picks.
function Answers({ q, options, asking }: { q: string; options: string[]; asking: Asking }) {
  const p = asking.picks[q] ?? { chip: null, own: null };
  const field = useRef<HTMLInputElement>(null);
  const [focusOwn, setFocusOwn] = useState(false);
  useEffect(() => { if (focusOwn) { field.current?.focus(); setFocusOwn(false); } }, [focusOwn]);
  const tap = (o: string) => {
    if (!asking.many) { asking.send({ [q]: { chip: o, own: null } }); return; }
    asking.onPick(q, { chip: p.chip === o ? null : o, own: p.own?.trim() ? p.own : null });
  };
  const ownOn = p.chip === null && !!p.own?.trim();
  const isLast = asking.lastId === q;
  return <>
    <div className="tq-chips">
      {options.map((o) => <button key={o} type="button" className={`tq-chip${p.chip === o ? ' on' : ''}`} disabled={asking.sending}
        aria-pressed={asking.many ? p.chip === o : undefined} onClick={() => tap(o)}>{p.chip === o && ICON.check}{o}</button>)}
      {p.own === null
        ? <button type="button" className="tq-chip tq-own" disabled={asking.sending} onClick={() => { asking.onPick(q, { chip: null, own: '' }); setFocusOwn(true); }}>Write your own</button>
        : <input ref={field} className={`tq-chip tq-own-field${ownOn ? ' on' : ''}`} value={p.own} placeholder={asking.many ? 'Your answer' : 'Your answer, then ↵'} aria-label="Your own answer" disabled={asking.sending}
          onChange={(e) => asking.onPick(q, { chip: null, own: e.target.value })}
          onBlur={() => { if (!p.own?.trim()) asking.onPick(q, { chip: p.chip, own: null }); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); asking.onPick(q, { chip: null, own: null }); }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && p.own?.trim() && (!asking.many || asking.answered === asking.count)) { e.preventDefault(); asking.send(); }
          }} />}
    </div>
    {asking.many && isLast && <div className="tq-answers">
      <button type="button" className="dock-send" disabled={!asking.answered || asking.sending} onClick={() => asking.send()}>Send answers</button>
      {asking.answered < asking.count && <span className="tq-answered">{asking.answered} of {asking.count} answered</span>}
    </div>}
  </>;
}

function Message({ m, team, me, mePic, lead, onOpenThread, onOpenFile, answered, asking }: { m: TeamChatLine; team: Teammate[]; me: string; mePic: string | null; lead: boolean; onOpenThread: (product: string, id: string) => void; onOpenFile: (product: string, src: string) => void; answered: { text: string; named: boolean } | null; asking: Asking | null }) {
  const t = team.find((x) => x.id === m.from) ?? null;
  const mine = m.from === 'you';
  const to = (Array.isArray(m.to) ? m.to : []).map((x) => nameOf(x, team));
  return <div className={`rm-cm tq-m${lead ? '' : ' tq-cont'}`}>
    {lead && <div className="h">
      {mine ? <Face name={me} url={mePic}>{me.trim() ? undefined : YOU_GLYPH}</Face> : <TeammateMark t={t} size="pic" />}
      <span>{mine ? (m.via ? 'Your thread' : m.setup && m.threads?.length ? 'You, from the suggestion' : 'You') : t?.name ?? 'A teammate'}</span>
      {mine && to.length > 1 && <span className="tq-to">to {to.join(', ')}</span>}
      {mine && m.via && m.viaProduct && <button type="button" className="tq-to tq-link" onClick={() => onOpenThread(m.viaProduct!, m.via!)}>open it</button>}
      <em>{clockOf(m.ts)}</em>
    </div>}
    <div className="tx"><Folded long={longMessage(m.text ?? '')}><ReactMarkdown remarkPlugins={MD}>{m.text ?? ''}</ReactMarkdown></Folded>
      {m.doc && <button type="button" className="tq-doc-card" onClick={() => onOpenFile(m.doc!.product, m.doc!.src)}>{ICON.doc}<span>{m.doc.name}</span></button>}
      {!mine && t && m.options?.length ? (asking && !answered
        ? <Answers q={m.id} options={m.options} asking={asking} />
        : answered && (m.options.includes(answered.text.trim()) || answered.named) ? <div className="tq-chips">
          {m.options.includes(answered.text.trim())
            ? <button type="button" className="tq-chip on" disabled>{answered.text.trim()}</button>
            : <span className="tq-chip on tq-own-said">{clipLine(answered.text, 120)}</span>}
        </div> : null) : null}
    </div>
  </div>;
}

// The foot of the chat while it works: the step it is on, or that it is
// waiting for an agent. It moves with every snapshot, so a run never looks stuck.
function LiveRow({ t, session, sessions, queued, items, asked, onOpen }: { t: Teammate; session: RunningSession | undefined; sessions: ReadonlyMap<string, RunningSession>; queued: string[]; items: WorkItem[]; asked: string | null; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const row = t.running ? items.find((i) => i.id === t.running!.id) : null;
  const answered = !!row?.wrote?.result && row.wrote.result.ts > (row.wrote.answer?.ts ?? 0);
  const line = liveLine(t, session, now, asked, { answered, queued: !!t.running && queued.includes(t.running.id) });
  if (!line) return null;
  const why = line.state === 'waiting' && t.running
    ? whyWaiting({ item: t.running.id, running: [...sessions.values()], queued, titleOf: (id) => items.find((i) => i.id === id)?.title ?? null, now })
    : null;
  return <div className={`tq-act tq-live${line.state === 'working' ? ' on' : ''}`} role="status">
    {line.state === 'working' ? <i className="tq-dots tq-moving" aria-hidden="true" /> : ICON.dots}
    <span><span className="v">{line.lead}</span>{line.text && <> <Inline onClick={onOpen}>{line.text}</Inline></>}{line.aside && <span className="tq-when">{line.aside}</span>}{why && <> <span className="tq-when">{why}</span></>}</span>
  </div>;
}

function Activity({ e, view, team, only, sessions, call, onOpenThread }: { e: ChatEntry; view: TeammatesView | null; team: Teammate[]; only: Teammate | null; sessions: ReadonlyMap<string, RunningSession>; call: Call; onOpenThread: (product: string, id: string) => void }) {
  const who = only ? '' : `${nameOf(e.kind === 'run' ? e.teammate : e.from, team)} `;
  const time = <em>{clockOf(e.ts)}</em>;
  if (e.kind === 'run') {
    const r = e as TeamRunLine;
    const open = () => onOpenThread(r.product, r.item);
    if (r.verb === 'sent') {
      return <div className="tq-act">{ICON.inbox}<span><span className="v">{who}{only ? 'Sent you' : 'sent you'}</span> <Inline onClick={open}>{r.title}</Inline></span>{time}
        {r.waiting ? <span className="tq-st need">Waiting on you</span> : r.answered ? <span className="tq-st">Answered</span> : null}</div>;
    }
    if (r.verb === 'answered') {
      return <div className="tq-act">{ICON.reply}<span><span className="v">You answered</span> <Inline onClick={open}>“{clipLine(r.text ?? r.title, 90)}”</Inline></span>{time}</div>;
    }
    if (r.verb === 'queued') return <div className="tq-act tq-next">{ICON.dots}<span><span className="v">Next</span> <Inline onClick={open}>{r.title}</Inline></span>{time}</div>;
    if (r.verb === 'finished') return <div className="tq-act">{ICON.check}<span><span className="v">Finished</span> <Inline onClick={open}>{r.title}</Inline></span>{time}</div>;
    if (r.verb === 'stopped') return <div className="tq-act">{ICON.stop}<span><span className="v">You stopped</span> <Inline onClick={open}>{r.title}</Inline></span>{time}</div>;
    return <div className="tq-act">{ICON.dots}<span><span className="v">{startWord(r, team, sessions)}</span> <Inline onClick={open}>{r.title}</Inline></span>{time}</div>;
  }
  const c = e as TeamChatLine;
  if (c.kind === 'pass') {
    return <div className="tq-act">{ICON.arrow}<span><span className="v">{only?.id === c.from ? 'Passed' : `${nameOf(c.from, team)} passed`}</span> {c.title} <span className="v">to {nameOf(typeof c.to === 'string' ? c.to : c.to?.[0], team)}</span></span>{time}</div>;
  }
  if (c.kind === 'msg') {
    const to = (Array.isArray(c.to) ? c.to : []).map((x) => nameOf(x, team));
    const said = c.from === only?.id ? `To ${to.join(', ') || 'the team'}` : `From ${nameOf(c.from, team)}`;
    return <div className="tq-act">{ICON.reply}<span><span className="v">{said}</span> {clipLine(c.text ?? '', 140)}</span>{time}</div>;
  }
  if (c.verb === 'hops') {
    const owner = c.from;
    const what = heldTitle(view, c);
    const still = heldFor(view, owner)?.id === c.id;
    return <div className="tq-act">{ICON.pause}<span><span className="v">Holding</span> {what} <span className="v">until you say go, after {MAX_HOPS} hand-offs without you</span></span>{time}
      {still ? <button type="button" className="tq-key" onClick={() => { void call('goAhead', { id: owner, ref: c.ref }); }}>Go ahead</button> : <span className="tq-st">Going ahead</span>}</div>;
  }
  if (c.verb === 'started') return <div className="tq-act">{ICON.plus}<span><span className="v">Started</span></span>{time}</div>;
  if (c.verb === 'paused' || c.verb === 'resumed') return <div className="tq-act">{ICON.pause}<span><span className="v">{c.verb === 'paused' ? 'Paused' : 'Resumed'}</span></span>{time}</div>;
  if (c.verb && SAVED_VERBS.has(c.verb)) return <div className="tq-act">{ICON.check}<span><span className="v">Saved</span> {clipLine(c.text ?? '', 140)}</span>{time}</div>;
  return <div className="tq-act tq-note"><span>{c.text}</span>{time}</div>;
}

// The app's own chat box, the one groups use. While it works, the Send slot
// is Stop until you type, as in a thread's reply box.
function Composer({ placeholder, onSend, stop = null }: { placeholder: string; onSend: (text: string) => Promise<boolean>; stop?: ReactNode }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const words = text.trim();
    if (!words || busy) return;
    setBusy(true);
    const ok = await onSend(words);
    setBusy(false);
    if (ok) setText('');
  };
  return <div className="rm-compose tq-compose">
    <textarea className="tq-input" value={text} placeholder={placeholder} rows={1} aria-label={placeholder}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
    <div className="rm-compose-bar"><span />
      {stop && !text.trim() ? stop
        : <button type="button" className="dock-send" disabled={!text.trim() || busy} onClick={() => void send()} title="Send · ↵">Send <kbd>↵</kbd></button>}
    </div>
  </div>;
}

/* ------------------------------------------------------------------- log */
function LogPanel({ view, team, t, sessions, call, onClose, onOpenThread }: { view: TeammatesView | null; team: Teammate[]; t: Teammate; sessions: ReadonlyMap<string, RunningSession>; call: Call; onClose: () => void; onOpenThread: (product: string, id: string) => void }) {
  const lines = logOf(view, t.id);
  return <aside className="gr-side tq-side tq-log" aria-label={`${t.name}'s log`}>
    <div className="tq-sh">Log<button type="button" className="tq-edit" onClick={onClose}>Close</button></div>
    {lines.length
      ? lines.flatMap((e, i) => {
        const day = dayOf(e.ts);
        const row = <Activity key={e.id} e={e} view={view} team={team} only={t} sessions={sessions} call={call} onOpenThread={onOpenThread} />;
        return i === 0 || dayOf(lines[i - 1].ts) !== day ? [<div key={`day-${e.id}`} className="tq-log-day">{day}</div>, row] : [row];
      })
      : <p className="tq-empty">Nothing yet. What it does and says to other teammates shows here.</p>}
  </aside>;
}

/* --------------------------------------------------------------- details */
// What it does and how it writes, over its chat when you ask, the settings folded
// below. What you pick is kept the moment you pick it.
function Details({ t, view, products, engines, models, call, onOpen }: { t: Teammate; view: TeammatesView | null; products: Product[]; engines: { id: string; label: string }[]; models: TeammateModels; call: Call; onOpen: (open: string) => void }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!saved) return undefined; const timer = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(timer); }, [saved]);
  const keep = (patch: Record<string, unknown>) => { void call('update', { id: t.id, patch }).then((ok) => { if (ok !== false) setSaved(true); }); };
  // A person's direct record is a project in the store, but no place to work.
  const real = products.filter((p) => !p.practice && !p.team?.direct);
  const books = (view?.playbooks ?? []).filter((p) => (t.playbooks ?? []).includes(p.id));
  const product = real.find((p) => p.slug === t.product);
  const about = () => onOpen(`about:${t.id}`);
  const now = nowLine(t) === 'Paused' ? 'Paused. It still answers you, and does nothing on its own.' : nowLine(t);
  const knows = t.memory.slice(-3);
  return <><div className="tq-sheet-away" aria-hidden="true" onClick={() => onOpen(t.id)} />
  <aside className="tq-sheet tq-details" role="dialog" aria-label={`About ${t.name}`}>
    <div className="tq-sheet-head"><span>About</span><button type="button" className="tq-key" onClick={() => onOpen(t.id)}>Close</button></div>
    <dl>
      {now !== 'Idle' && <><dt>Now</dt><dd>{now}</dd></>}
      <dt>Job</dt>
      <dd><EditJob key={t.job ?? ''} job={t.job} shown={t.job ? clipLine(firstSentence(t.status === 'draft' ? jobLine(t) : t.job), 150) : null} onSave={(job) => keep({ job })} onRead={about} /></dd>
      <dt>How it writes</dt>
      <dd><VoicePick voice={voiceOf(t)} words={t.voiceText ?? null} onPick={keep} /></dd>
      <dt>On its own</dt>
      <dd>{t.duties?.length
        ? t.duties.map((d) => <span key={d.id} className="tq-duty">{d.what}
          {d.after === 'ship' || !d.every || !d.at ? <small>{d.when}</small> : <When every={d.every} at={d.at} on={d.on} canStop={false}
            onChange={(next) => keep({ duties: (t.duties ?? []).map(({ when: _when, lastRan: _lastRan, ...x }) => (x.id === d.id ? { ...x, ...next } : x)) })} />}
        </span>)
        : <When every={t.works?.every ?? null} at={t.works?.at ? [t.works.at] : []} on={t.works?.on} canStop
          onChange={(next) => keep({ works: next.every ? { every: next.every, at: next.at[0], ...(next.every === 'week' ? { on: next.on } : {}) } : null })} />}</dd>
      {knows.length > 0 && <><dt>Knows</dt><dd>
        {knows.map((m) => <span key={m.id} className="tq-knows" title={m.text}>{m.text}</span>)}
        {t.memory.length > knows.length && <Inline onClick={about}>All {t.memory.length}</Inline>}
      </dd></>}
      {books.length > 0 && <><dt>Playbooks</dt><dd>
        {books.map((b) => <button key={b.id} type="button" className="tq-book" onClick={() => onOpen(`book:${b.id}:${t.id}`)}>{ICON.doc}<span>{b.title}</span></button>)}
      </dd></>}
      <dt>Its work</dt>
      <dd className="tq-sheet-links"><Inline onClick={() => onOpen(`log:${t.id}`)}>Log</Inline><Inline onClick={about}>Everything it knows and how it works</Inline></dd>
    </dl>
    <details className="tq-sheet-more">
      <summary role="button">Settings</summary>
      <dl>
        <dt>Name</dt>
        <dd><EditName key={t.name} name={t.name} onSave={(name) => keep({ name })} /></dd>
        <dt>Model</dt>
        <dd><ModelPicker value={t.model ?? null} onChange={(m) => keep({ model: m })} engine={t.engine ?? models.engine ?? null} codexModels={models.codex} codexDefault={models.codexDefault}
          effort={t.effort ?? TEAMMATE_EFFORT} onEffortChange={(e) => keep({ effort: e })} /></dd>
        {engines.length > 1 && <><dt>Runs on</dt>
          <dd><PickOne value={t.engine ?? ''} label="Runs on" options={[...(t.engine ? [] : [{ id: '', label: 'Your default' }]), ...engines]} onPick={(id) => keep({ engine: id })} /></dd></>}
        <dt>Works in</dt>
        <dd>{real.length > 1
          ? <PickOne value={t.product} label="Works in" options={real.map((p) => ({ id: p.slug, label: p.name }))} onPick={(slug) => keep({ product: slug })} />
          : product?.name ?? t.product}</dd>
        <dt>Can read</dt>
        <dd><PickOne value={t.readsMessages ? 'all' : 'threads'} label="What it can read" options={READS} onPick={(id) => keep({ readsMessages: id === 'all' })} /></dd>
        <dt>Your team</dt>
        <dd><PickOne value={t.openToTeam ? 'open' : 'ask'} label="What your team can do with it" options={TEAM_CAN} onPick={(id) => keep({ openToTeam: id === 'open' })} /></dd>
        <dt>This week</dt>
        <dd>{t.runsThisWeek} of {t.limit} runs</dd>
      </dl>
    </details>
    {saved && <span className="tq-st" role="status">Saved</span>}
  </aside></>;
}

// How it writes: the styles, the sample line of the one picked, or your own words.
function VoicePick({ voice, words, onPick, none = null }: { voice: { id: string; sample?: string } | null; words: string | null; onPick: (p: { voice: string | null; voiceText: string | null }) => void; none?: string | null }) {
  const [own, setOwn] = useState<string | null>(null);
  const writing = own !== null;
  const shownId = writing || voice?.id === 'own' ? 'own' : voice?.id ?? null;
  const shown = VOICES.find((v) => v.id === shownId);
  const save = () => {
    const next = (own ?? '').trim();
    if (next && next !== words) onPick({ voice: null, voiceText: next });
    setOwn(null);
  };
  return <span className="tq-voice">
    <span className="tq-chips">
      {none && <button type="button" className={`tq-chip${!shownId ? ' on' : ''}`} aria-pressed={!shownId} onClick={() => { setOwn(null); onPick({ voice: null, voiceText: null }); }}>{none}</button>}
      {VOICES.map((v) => <button key={v.id} type="button" className={`tq-chip${shownId === v.id ? ' on' : ''}`} aria-pressed={shownId === v.id} onClick={() => { setOwn(null); onPick({ voice: v.id, voiceText: null }); }}>{v.label}</button>)}
      <button type="button" className={`tq-chip${shownId === 'own' ? ' on' : ''}`} aria-pressed={shownId === 'own'} onClick={() => setOwn(words ?? '')}>Your own</button>
    </span>
    {writing
      ? <textarea className="tq-field tq-voice-own" rows={2} autoFocus maxLength={VOICE_WORDS_MOST} value={own} aria-label="How it writes, in your words" placeholder="Short and kind, like a good nurse" onChange={(e) => setOwn(e.target.value)} onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOwn(null); }
        }} />
      : shownId === 'own' ? <span className="tq-voice-sample">{words}</span>
        : shown && <span className="tq-voice-sample">“{shown.sample}”</span>}
  </span>;
}

const READS = [{ id: 'threads', label: 'Shared threads only' }, { id: 'all', label: 'Everything you can read' }];
const TEAM_CAN = [{ id: 'ask', label: 'See what it does' }, { id: 'open', label: 'See what it does and give it work' }];
const EVERY_WORDS = [{ id: 'day', label: 'Every day' }, { id: 'weekday', label: 'Weekdays' }, { id: 'week', label: 'Every week' }];
const NO_ROUND = { id: 'none', label: 'Only when someone writes to it' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((label, i) => ({ id: String(i), label }));

type Every = 'day' | 'weekday' | 'week';
// When something runs, changed right here. A time left empty is not saved.
function When({ every, at, on, canStop, onChange }: { every: Every | null; at: string[]; on?: number; canStop: boolean; onChange: (next: { every: Every | null; at: string[]; on?: number }) => void }) {
  const times = at.length ? at : ['09:00'];
  const choose = (id: string) => onChange(id === 'none' ? { every: null, at: [] } : { every: id as Every, at: times, ...(id === 'week' ? { on: on ?? 1 } : {}) });
  return <span className="tq-when-edit">
    <PickOne value={every ?? 'none'} label="How often" options={canStop ? [NO_ROUND, ...EVERY_WORDS] : EVERY_WORDS} onPick={choose} />
    {every === 'week' && <PickOne value={String(on ?? 1)} label="Which day" options={DAYS} onPick={(id) => onChange({ every, at: times, on: Number(id) })} />}
    {every && times.map((time, i) => <input key={i} type="time" className="tq-time" defaultValue={time} aria-label="At what time"
      onBlur={(e) => { const v = e.target.value; if (v && v !== time) onChange({ every, at: times.map((x, k) => (k === i ? v : x)), ...(every === 'week' ? { on: on ?? 1 } : {}) }); }} />)}
  </span>;
}

function EditName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [text, setText] = useState(name);
  const save = () => { const next = text.trim(); if (!next) setText(name); else if (next !== name) onSave(next); };
  return <input className="tq-field" value={text} aria-label="Its name" maxLength={40} onChange={(e) => setText(e.target.value)} onBlur={save}
    onKeyDown={(e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setText(name); }
    }} />;
}

function EditJob({ job, shown, onSave, onRead }: { job: string | null; shown: string | null; onSave: (job: string) => void; onRead: () => void }) {
  const [text, setText] = useState<string | null>(null);
  if (text === null) {
    return <span>{shown ?? <span className="dim">Nothing yet.</span>} {shown && <Inline onClick={onRead}>Read all</Inline>} <Inline onClick={() => setText(job ?? '')}>Edit</Inline></span>;
  }
  const save = () => { const next = text.trim(); if (next && next !== job) onSave(next); setText(null); };
  return <span className="tq-job-edit">
    <textarea className="tq-field" rows={6} value={text} aria-label="Its job" autoFocus onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setText(null); } }} />
    <span className="tq-job-keys"><button type="button" className="dock-send" disabled={!text.trim()} onClick={save}>Save</button> <button type="button" className="tq-key" onClick={() => setText(null)}>Cancel</button></span>
  </span>;
}

/* ----------------------------------------------------------------- about */
// What it does, in its own words, and everything it knows about you. Its
// name is in the bar above, and how it is set is beside its chat.
function About({ t, call, error, onOpen }: { t: Teammate; call: Call; error: string | null; onOpen: (open: string) => void }) {
  // Its method: how it does the job, kept by it from what you said and showed.
  const [method, setMethod] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setMethod(null);
    void api.teammates('method', { id: t.id }).then((r) => { if (live && r.ok) setMethod((r.value as { text?: string } | null)?.text ?? null); });
    return () => { live = false; };
  }, [t.id]);
  return <div className="tq-doc"><div className="tq-doc-in">
    {t.status === 'draft' && <p className="tq-doc-note">It is still setting itself up, and asks you in the chat before it starts.</p>}
    <div className="tq-desc">{t.job ? <ReactMarkdown remarkPlugins={MD}>{t.status === 'draft' ? jobLine(t) : t.job}</ReactMarkdown> : <p className="dim">No description yet. Tell it what you need below.</p>}
      {t.goal && <><h5>Its goal</h5><p>{goalLine(t.goal, t.counted)}</p></>}
      {yesFirst(t.asksFirst) && <><h5>What needs your yes first</h5><p>{yesFirst(t.asksFirst)}</p></>}
      {method && <div className="tq-method"><ReactMarkdown remarkPlugins={MD}>{method}</ReactMarkdown></div>}
      {t.memory.length > 0 && <><h5>What it knows about you</h5>
        <ul className="tq-known">{t.memory.map((m) => <li key={m.id}><span>{m.text}</span><button type="button" className="tq-x" aria-label={`Forget ${m.text}`} title="Forget" onClick={() => { void call('forget', { id: t.id, memory: m.id }); }}>×</button></li>)}</ul></>}
    </div>
    {error && <p className="tq-error" role="alert">{error}</p>}
    {/* What you send here is a message to it, so you are taken to the chat where it answers. */}
    <Composer placeholder={`Tell ${t.name} what to change about its job`} onSend={async (text) => {
      const sent = (await call('post', { text, to: [t.id] })) !== false;
      if (sent) onOpen(t.id);
      return sent;
    }} />
  </div></div>;
}

/* -------------------------------------------------------------- playbook */
function PlaybookPage({ t, book, team, onOpen, onOpenThread }: { t: Teammate; book: Playbook | null; team: Teammate[]; onOpen: (open: string) => void; onOpenThread: (product: string, id: string) => void }) {
  if (!book) return <div className="tq-doc"><div className="tq-doc-in"><p className="tq-empty">That playbook is not here any more.</p></div></div>;
  const readers = book.readers.map((id) => nameOf(id, team)).filter((n) => n !== 'A teammate');
  const from = book.lessons.filter((l) => l.from);
  return <div className="tq-doc"><div className="tq-doc-in">
    <div className="tq-crumb"><Inline onClick={() => onOpen(`about:${t.id}`)}>{t.name}</Inline><span>›</span><span>Playbooks</span></div>
    <h2 className="tq-h">{book.title}</h2>
    <p className="tq-sub">{readers.length ? `Read by ${readers.join(' and ')}. ` : ''}{book.lessons.length} {book.lessons.length === 1 ? 'lesson' : 'lessons'}, last changed {dayOf(book.updatedAt).toLowerCase()}.</p>
    {book.lessons.length
      ? <ul className="tq-lessons">{book.lessons.map((l) => <li key={l.id}>{l.text}</li>)}</ul>
      : <p className="tq-empty">No lessons yet.</p>}
    {from.length > 0 && <table className="tq-from-table">
      <thead><tr><th colSpan={2}>Where it learned this</th></tr></thead>
      <tbody>{from.map((l) => <tr key={l.id}><td>{clipLine(l.text, 80)}</td><td><Inline onClick={() => onOpenThread(l.from!.product, l.from!.id)}>{l.from!.title || 'Its thread'}</Inline></td></tr>)}</tbody>
    </table>}
  </div></div>;
}

/* ----------------------------------------------------------- new teammate */
// A new teammate starts as a chat: it asks what to take on, with the starters
// as answers to tap, and the draft your answer makes asks you the rest.
function NewTeammate({ team, products, call, error, onOpen }: { team: Teammate[]; products: Product[]; call: Call; error: string | null; onOpen: (id: string) => void }) {
  const real = products.filter((p) => !p.practice && !p.team?.direct);
  const [slug, setSlug] = useState<string | null>(() => {
    const last = rememberedProject();
    return real.find((p) => p.slug === last)?.slug ?? real.find((p) => p.repoPath)?.slug ?? null;
  });
  const where = real.find((p) => p.slug === slug) ?? real.find((p) => p.repoPath) ?? real[0] ?? null;
  const [busy, setBusy] = useState(false);
  // Nothing picked: a starter brings its own, and one from your words chooses from its job.
  const [sounds, setSounds] = useState<{ voice: string | null; voiceText: string | null }>({ voice: null, voiceText: null });
  const picked = sounds.voiceText ? { id: 'own' } : VOICES.find((v) => v.id === sounds.voice) ?? null;
  const voice = { ...(sounds.voice ? { voice: sounds.voice } : {}), ...(sounds.voiceText ? { voiceText: sounds.voiceText } : {}) };
  const asks = starterAsks(team);
  const make = async (args: Record<string, unknown>) => {
    if (busy || !where) return false;
    setBusy(true);
    const made = await call('describe', { ...args, ...voice, greeted: true, product: where.slug });
    setBusy(false);
    const id = (made as { teammate?: { id?: unknown } })?.teammate?.id;
    if (typeof id !== 'string') return false;
    onOpen(id);
    return true;
  };
  return <>
    <div className="gr-chat tq-chat">
      <div className="tq-lines">
        <div className="rm-day"><span className="rm-label">{dayOf(Date.now())}</span></div>
        <div className="rm-cm tq-m">
          <div className="h"><i className="tq tq-pic tq-hash" aria-hidden="true">+</i><span>New teammate</span></div>
          <div className="tx"><p>{GREETING}</p>
            {asks.length > 0 && <div className="tq-chips">{asks.map((a) => (
              <button key={a.starter} type="button" className="tq-chip" disabled={busy || !where} onClick={() => { void make({ starter: a.starter }); }}>{a.ask}</button>
            ))}</div>}
            <p className="tq-new-ask">How should it write?</p>
            <VoicePick voice={picked} words={sounds.voiceText} onPick={setSounds} none="Let it choose" />
            {real.length > 1 && <><p className="tq-new-ask">Where does it work?</p>
              <PickOne value={where?.slug ?? ''} label="Works in" options={real.map((p) => ({ id: p.slug, label: p.name }))} onPick={setSlug} /></>}
          </div>
        </div>
      </div>
      {!where && <p className="tq-error" role="alert">Make a project first. A teammate works in one of your projects.</p>}
      {error && <p className="tq-error" role="alert">{error}</p>}
      <Composer placeholder="Answer your new teammate" onSend={(text) => make({ text })} />
    </div>
  </>;
}

// A long message shows its start and a Show all, so a pasted brief cannot
// push everything after it out of sight.
function Folded({ long, children }: { long: boolean; children: ReactNode }) {
  const [all, setAll] = useState(false);
  if (!long) return <>{children}</>;
  return <>
    <div className={all ? undefined : 'tq-folded'}>{children}</div>
    <button type="button" className="tq-key tq-more" onClick={() => setAll((x) => !x)}>{all ? 'Show less' : 'Show all'}</button>
  </>;
}

// A link inside an activity line. Inline text rather than a button, so a
// long title is cut with an ellipsis instead of vanishing whole.
function Inline({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <span role="button" tabIndex={0} className="tq-link" onClick={onClick}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>{children}</span>;
}

// What a teammate being set up will do, said to you.
function jobLine(t: Teammate): string {
  const s = STARTERS.find((x) => x.starter === t.starter);
  return s && t.job === s.job ? s.outcome : clipLine((t.job ?? '').trim().split('\n')[0], 160);
}

function clipLine(text: string, max: number): string {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}


