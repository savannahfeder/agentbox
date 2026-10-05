// AGENTS IN A CONVERSATION WITH A TEAMMATE (w-7b9cb8636a, approved on
// w-2e8aa16f0f). The rules are ./agent-mentions.ts; this file is what draws
// them: the @ menu, the mention drawn as a chip under the reply box's text, the
// small card that sets a mention's project, model and effort, and the agent's
// answer in the chat. The reply box (components/Focus.tsx, DockComposer) and
// the thread (components/Thread.tsx) each call one thing from here.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { ThreadStateWord, WorkItem } from '../types';
import { AgentFace } from '../components/AgentFace';
import { ThreadsMade } from '../components/ThreadsMade';
import { ChatFold } from './ChatFold';
import { TeamContext } from './people';
import { clock } from '../thread-history';
import { defaultModelFor, engineModelChoices, engineModelLabel, readLastModel, type ModelChoice } from '../models';
import { defaultEffortFor, effortChoicesFor, effortLabelOf, readLastEffort } from '../effort';
import {
  CHAT_AGENTS, agentLinks, encodeMentions, findMentions, matchesQuery, mentionQuery, mentionText, sendBlock, withProject,
  type AgentLink, type Mention, type MentionPick, type Project,
} from './agent-mentions';
import './chat.css';

/** What a conversation needs from the app to bring an agent in and to draw
 *  its answer. Provided once, in App, beside TeamContext. */
export interface ChatAgentsValue {
  projects: Project[];
  codexModels: ModelChoice[];
  codexDefault: string | null;
  find: (product: string, id: string) => WorkItem | undefined;
  stateOf: (item: WorkItem) => ThreadStateWord | null;
  filed: (item: WorkItem) => WorkItem[];
  open: (item: WorkItem) => void;
}
export const ChatAgentsContext = createContext<ChatAgentsValue | null>(null);

// The model and effort a new mention starts on: the same ones New thread would
// start on, which is the last pick this Mac made for that agent, else its own.
export function startingPick(engine: string, ctx: Pick<ChatAgentsValue, 'codexModels' | 'codexDefault'>): MentionPick {
  const opts = { codexModels: ctx.codexModels, codexDefault: ctx.codexDefault };
  const model = readLastModel(globalThis.localStorage, engine, ctx.codexDefault) ?? defaultModelFor(engine, ctx.codexDefault);
  const effort = readLastEffort(globalThis.localStorage, engine) ?? defaultEffortFor(engine, model, opts);
  return { model: model || null, effort };
}

const pickWords = (engine: string, pick: MentionPick, ctx: Pick<ChatAgentsValue, 'codexModels' | 'codexDefault'>) => {
  const opts = { codexModels: ctx.codexModels, codexDefault: ctx.codexDefault };
  return [engineModelLabel(engine, pick.model, opts), effortLabelOf(pick.effort, effortChoicesFor(engine, pick.model, opts))].filter(Boolean).join(' · ');
};

// THE PROJECT A CONVERSATION LAST SENT AN AGENT TO, which a new mention starts
// on ("project starts from the last one used in this chat, else none").
const lastProjectKey = (where: { product: string; id: string }) => `zero.chatProject.${where.product}/${where.id}`;
const readLastProject = (where: { product: string; id: string }, projects: Project[]) => {
  try { const slug = globalThis.localStorage?.getItem(lastProjectKey(where)); return projects.find((p) => p.slug === slug) ?? null; } catch { return null; }
};

type MenuRow = { kind: 'person'; label: string; insert: string } | { kind: 'agent'; label: string; engine: string; hint: string };

/**
 * THE REPLY BOX'S AGENT PARTS, as one hook so the box itself only wires them.
 * Everything here is off unless the box is in a conversation with a person.
 */
export function useChatMentions({ on, where, text, setText, input, people }: {
  on: boolean; where: { product: string; id: string }; text: string; setText: (next: string) => void;
  input: RefObject<HTMLTextAreaElement>; people: string[];
}) {
  const ctx = useContext(ChatAgentsContext);
  const live = on && !!ctx;
  const projects = ctx?.projects ?? [];
  const mentions = useMemo(() => (live ? findMentions(text, projects) : []), [live, text, projects]);
  const [picks, setPicks] = useState<(MentionPick | undefined)[]>([]);
  const [caret, setCaret] = useState(0);
  const [menuAt, setMenuAt] = useState(0);
  const [shut, setShut] = useState<string | null>(null);
  const [cardFor, setCardFor] = useState<number | null>(null);
  const [cardX, setCardX] = useState(0);
  const layer = useRef<HTMLDivElement>(null);

  const pickOf = (i: number) => picks[i] ?? (ctx ? startingPick(mentions[i]?.engine ?? 'claude', ctx) : { model: null, effort: null });
  const query = live ? mentionQuery(text, caret) : null;
  // NOT OVER A MENTION ALREADY MADE, and not while its card is up: a click
  // inside "@Codex" puts the caret after "@Co", which reads as a new @ query
  // and opened the menu behind the card (seen in the built app, step 3).
  const inMention = mentions.some((m) => caret > m.start && caret <= m.end);
  const rows: MenuRow[] = !query || shut === text || inMention || cardFor !== null ? [] : [
    ...people.filter((p) => matchesQuery(p, query.query)).map((p): MenuRow => ({ kind: 'person', label: p, insert: `@${p.split(/\s+/)[0]} ` })),
    ...CHAT_AGENTS.filter((a) => matchesQuery(a.label, query.query)).map((a): MenuRow => ({ kind: 'agent', label: a.label, engine: a.engine, hint: ctx ? pickWords(a.engine, startingPick(a.engine, ctx), ctx) : '' })),
  ];
  useEffect(() => { setMenuAt(0); }, [query?.query, rows.length]);
  // THE CHIPS SIT EXACTLY UNDER THE WORDS: same top, same height, same scroll
  // as the text field, whatever else the card draws above it. After every
  // render, because the box grows as she types (dock-height.ts).
  useEffect(() => {
    const el = input.current; const under = layer.current;
    if (!el || !under) return;
    under.style.top = `${el.offsetTop}px`;
    under.style.height = `${el.offsetHeight}px`;
    under.scrollTop = el.scrollTop;
  });
  useEffect(() => { if (cardFor !== null && cardFor >= mentions.length) setCardFor(null); }, [mentions.length, cardFor]);

  const moveCaret = (at: number) => requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(at, at); setCaret(at); });
  const pickRow = (row: MenuRow) => {
    if (!query) return;
    const before = text.slice(0, query.start);
    const words = row.kind === 'person' ? row.insert : `${mentionText(row.label, readLastProject(where, projects))} `;
    setText(before + words + text.slice(caret));
    if (row.kind === 'agent' && ctx) {
      const index = mentions.filter((m) => m.start < query.start).length;
      setPicks((was) => { const next = mentions.map((_, i) => was[i]); next.splice(index, 0, startingPick(row.engine, ctx)); return next; });
    }
    moveCaret(before.length + words.length);
  };

  // Clicking inside a mention opens its card, above the box at the chip's left.
  const track = (el: HTMLTextAreaElement) => {
    setCaret(el.selectionStart);
    if (layer.current) layer.current.scrollTop = el.scrollTop;
  };
  const click = (el: HTMLTextAreaElement) => {
    track(el);
    const at = el.selectionStart;
    const hit = mentions.findIndex((m) => at > m.start && at <= m.end);
    if (hit < 0) { setCardFor(null); return; }
    const chip = layer.current?.querySelector<HTMLElement>(`[data-mention="${hit}"]`);
    const card = el.closest('.dock-card')?.getBoundingClientRect();
    setCardX(chip && card ? Math.max(0, chip.getBoundingClientRect().left - card.left - 4) : 12);
    setCardFor(hit);
  };

  /** The keys, while the menu or the card is up. True means the key was taken. */
  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (cardFor !== null && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCardFor(null); return true; }
    if (!rows.length) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMenuAt((i) => (i + 1) % rows.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setMenuAt((i) => (i - 1 + rows.length) % rows.length); return true; }
    if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') { e.preventDefault(); pickRow(rows[menuAt] ?? rows[0]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setShut(text); return true; }
    return false;
  };

  /** The words as they are sent, with every agent mention turned into its link,
   *  and the project remembered for the next mention in this conversation. */
  const encode = (words: string) => {
    if (!live) return words;
    const found = findMentions(words, projects);
    if (!found.length) return words;
    const last = found[found.length - 1].project;
    try { if (last) globalThis.localStorage?.setItem(lastProjectKey(where), last.slug); } catch { /* the default is only a convenience */ }
    return encodeMentions(words, found, found.map((_, i) => pickOf(i)));
  };

  const menu = rows.length > 0 && (
    <div className="mention-menu" role="listbox">
      {rows.some((r) => r.kind === 'person') && <div className="mention-head">People</div>}
      {rows.map((r, i) => (
        <div key={`${r.kind}:${r.label}`}>
          {r.kind === 'agent' && rows[i - 1]?.kind !== 'agent' && <div className="mention-head">Agents</div>}
          <button type="button" className={`mention-row${i === menuAt ? ' cursor' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickRow(r); }} onMouseEnter={() => setMenuAt(i)}>
            {r.kind === 'agent' ? <AgentFace /> : <span className="tm-av">{r.label.slice(0, 2)}</span>}
            <span className="mention-name">{r.label}</span>
            <span className="mention-hint">{r.kind === 'agent' ? r.hint : 'in this chat'}</span>
          </button>
        </div>
      ))}
    </div>
  );

  // The chips, drawn behind the text: the same words in the same box, clear
  // except where a mention sits.
  const chips = live && mentions.length > 0 && (
    <div className="mention-layer" ref={layer} aria-hidden="true">
      {mentions.reduce<{ at: number; out: ReactNode[] }>((acc, m, i) => {
        acc.out.push(text.slice(acc.at, m.start));
        acc.out.push(<span key={i} data-mention={i} className={`mention-chip${m.project ? '' : ' loose'}`}>{text.slice(m.start, m.end)}</span>);
        return { at: m.end, out: acc.out };
      }, { at: 0, out: [] }).out}
      {text.slice(mentions[mentions.length - 1].end)}{'​'}
    </div>
  );

  const card = cardFor !== null && mentions[cardFor] && ctx && (
    <MentionCard
      x={cardX}
      mention={mentions[cardFor]}
      pick={pickOf(cardFor)}
      ctx={ctx}
      onProject={(p) => { setText(withProject(text, mentions[cardFor], p)); }}
      onPick={(next) => setPicks((was) => { const out = mentions.map((_, i) => was[i] ?? pickOf(i)); out[cardFor] = next; return out; })}
      onClose={() => setCardFor(null)}
    />
  );

  return { live, mentions, block: live ? sendBlock(mentions) : null, menu, chips, card, keyDown, track, click, encode };
}

/** THE MENTION'S CARD: the project, the model and the effort it runs with. */
function MentionCard({ x, mention, pick, ctx, onProject, onPick, onClose }: {
  x: number; mention: Mention; pick: MentionPick; ctx: ChatAgentsValue;
  onProject: (p: Project) => void; onPick: (next: MentionPick) => void; onClose: () => void;
}) {
  const [field, setField] = useState<'project' | 'model' | 'effort' | null>(mention.project ? null : 'project');
  const opts = { codexModels: ctx.codexModels, codexDefault: ctx.codexDefault };
  const models = engineModelChoices(mention.engine, pick.model, opts);
  const efforts = effortChoicesFor(mention.engine, pick.model, opts);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (box.current?.contains(t) || t.closest?.('.dock-input')) return;
      onClose();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);
  const list = field === 'project' ? ctx.projects.map((p) => ({ id: p.slug, label: p.name, on: mention.project?.slug === p.slug, go: () => { onProject(p); setField(null); } }))
    : field === 'model' ? models.map((m) => ({ id: m.id, label: m.label, on: (pick.model ?? '') === m.id, go: () => { onPick({ model: m.id || null, effort: defaultEffortFor(mention.engine, m.id || null, opts) ?? pick.effort }); setField(null); } }))
    : field === 'effort' ? efforts.map((e) => ({ id: e.id, label: e.label, on: pick.effort === e.id, go: () => { onPick({ ...pick, effort: e.id }); setField(null); } }))
    : null;
  return (
    <div className="mention-card" ref={box} style={{ left: x }} onMouseDown={(e) => e.preventDefault()}>
      <div className="mention-card-head"><AgentFace />{mention.label}</div>
      {list ? (
        <>
          <div className="mention-head">{field === 'project' ? 'Works in' : field === 'model' ? 'Model' : 'Effort'}</div>
          {list.map((o) => (
            <button type="button" key={o.id || o.label} className={`mention-field${o.on ? ' cursor' : ''}`} onClick={o.go}>
              <span className="v">{o.label}</span>{o.on && <span className="chk">✓</span>}
            </button>
          ))}
        </>
      ) : (
        <>
          <button type="button" className="mention-field" onClick={() => setField('project')}><span className="k">Project</span><span className="v">{mention.project?.name ?? 'Pick one'}</span><Chevron /></button>
          <button type="button" className="mention-field" onClick={() => setField('model')}><span className="k">Model</span><span className="v">{engineModelLabel(mention.engine, pick.model, opts)}</span><Chevron /></button>
          {efforts.length > 0 && <button type="button" className="mention-field" onClick={() => setField('effort')}><span className="k">Effort</span><span className="v">{effortLabelOf(pick.effort, efforts) ?? 'Its own'}</span><Chevron /></button>}
        </>
      )}
    </div>
  );
}

const Chevron = () => <svg className="car" viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M2 3.8 5 6.8 8 3.8" /></svg>;

/**
 * THE AGENT'S ANSWER, under the message that asked for it: its face, its name,
 * where it works and on what, what it said (or where it is if it has not said
 * anything yet), and the threads it filed in the list a task draws them in.
 */
export function AgentAnswers({ text, md }: { text: string; md: (t: string) => ReactNode }) {
  const links = agentLinks(text).filter((l) => l.task && l.project);
  if (!links.length) return null;
  return <>{links.map((l) => <AgentAnswer key={l.task!} link={l} md={md} />)}</>;
}

function AgentAnswer({ link, md }: { link: AgentLink; md: (t: string) => ReactNode }) {
  const ctx = useContext(ChatAgentsContext);
  const team = useContext(TeamContext);
  const task = ctx?.find(link.project!, link.task!);
  const card = !task ? team?.state?.cards?.find((c) => c.threadId === link.task) : undefined;
  const state = task ? ctx!.stateOf(task) : card?.state ?? null;
  const where = ctx?.projects.find((p) => p.slug === link.project)?.name ?? task?.productName ?? card?.project ?? link.project!;
  const opts = { codexModels: ctx?.codexModels ?? [], codexDefault: ctx?.codexDefault ?? null };
  const meta = [where, engineModelLabel(link.engine, link.model, opts), effortLabelOf(link.effort, effortChoicesFor(link.engine, link.model, opts))].filter(Boolean).join(' · ');
  const at = task?.wrote?.result?.ts ?? task?.updatedAt ?? card?.updatedAt ?? null;
  const filed = task ? ctx!.filed(task) : [];
  const rows = (filed.length ? filed : task ? [task] : []).map((i) => ({ id: i.id, title: i.label || i.title, state: ctx!.stateOf(i) }));
  const said = task?.result
    ? <ChatFold>{md(task.result)}</ChatFold>
    : <div className="msg-body chat-agent-state">{
      !task && !card ? `Asked to work in ${where}. Only people in that project can open it.`
        : state === 'running' ? `Working on it in ${where}.`
        : state === 'scheduled' ? 'Waiting to start.'
        : state === 'done' ? 'Finished.'
        : card?.progress ?? `Started in ${where}.`
    }</div>;
  return (
    <div className="msg chat-msg chat-agent">
      <div className="chat-gutter"><AgentFace /></div>
      <div className="msg-head">
        {task ? <button type="button" className="msg-who chat-agent-name" onClick={() => ctx!.open(task)}>{link.label}</button> : <span className="msg-who">{link.label}</span>}
        <span className="msg-when">{meta}{at ? ` · ${clock(at)}` : ''}</span>
      </div>
      {said}
      {rows.length > 0 && <div className="chat-agent-made"><ThreadsMade rows={rows} onOpen={(id) => { const hit = [...filed, ...(task ? [task] : [])].find((i) => i.id === id); if (hit) ctx!.open(hit); }} /></div>}
    </div>
  );
}
