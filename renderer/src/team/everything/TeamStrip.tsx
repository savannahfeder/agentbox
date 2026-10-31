// Everything else (w-b5f23cff71): your team as cards over the page, the bar
// over whichever one is open, and the lists its Agents tab draws.
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { Product, ThreadCard, WorkItem } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { RoomFace } from '../rooms/RoomFace';
import { RowCells, ThreadCells } from '../../threads/Pages';
import { STATE_WORD } from '../../threads/summary-rules';
import type { StatusCell } from '../../status-word';
import { moveMember, type Member, type TeamRun } from './members';
import './everything.css';

const agentsWords = (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'} working`;
const agentsShort = (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'}`;

/** A person's photo or initials, an AI teammate's dashed letter, a chat's faces. */
export function MemberFace({ m, size }: { m: Member; size: number }) {
  if (m.kind === 'mate') return <span className="ev-ai" style={{ width: size, height: size, fontSize: Math.round(size * 0.27) }} aria-hidden="true">{m.letter}</span>;
  if (m.kind === 'chat') {
    const faces = m.faces ?? [];
    if (!faces.length) return <span className="ev-hash" style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }} aria-hidden="true">#</span>;
    if (faces.length === 1) return <RoomFace name={faces[0].name} url={faces[0].url} size={size} />;
    // Small enough that the second leaves the first one's initials showing.
    const side = Math.round(size * 0.6);
    return <span className="ev-two" style={{ width: size, height: size }} aria-hidden="true">
      {faces.slice(0, 2).map((f, i) => <RoomFace key={i} name={f.name} url={f.url} size={side} />)}
    </span>;
  }
  return <RoomFace name={m.faceName || m.name} url={m.avatarUrl ?? null} size={size} />;
}

const BUBBLE = <svg className="ev-bubble" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>;

function Card({ m, on, drop, onPick, drag, onHide }: {
  m: Member; on: boolean; drop: 'before' | 'after' | null; onPick: () => void; drag: Record<string, unknown>; onHide?: () => void;
}) {
  const chat = m.kind === 'chat' && !(m.team && m.agents != null);
  const corner = (m.kind === 'chat' || m.kind === 'person') && onHide
    && <button type="button" className="ev-x" aria-label={`Hide ${m.name}`} title="Hide" onClick={(e) => { e.stopPropagation(); onHide(); }}>×</button>;
  const attrs = { role: 'button', tabIndex: 0, className: `ev-card ${m.kind}${on ? ' on' : ''}${drop ? ` drop-${drop}` : ''}`, 'data-key': m.key, title: m.name,
    onClick: onPick, onKeyDown: (e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter') { e.preventDefault(); onPick(); } }, ...drag };
  // Who, and how many agents they run; never what they are on (w-2b3e1a85e5).
  return <div {...attrs}>
    {corner}
    <MemberFace m={m} size={44} />
    <div className="ev-t">
      <span className="ev-n">{m.kind === 'chat' && BUBBLE}<span className="rm-one">{m.name}</span>
        {m.level != null && <span className="rm-quiet">{m.level}</span>}</span>
      {chat
        ? <span className="rm-ag">{m.unread ? <><i className="ev-new" />New messages</> : 'Chat'}</span>
        : m.agents == null ? <span className="rm-ag"> </span>
          : <span className="rm-ag"><LiveMark still={!m.agents && !m.starting} />{m.agents ? agentsShort(m.agents).toUpperCase() : m.starting ? 'STARTING' : 'NOT RUNNING'}{m.unread && <i className="ev-new" aria-label="New messages" />}</span>}
    </div>
  </div>;
}

/** The cards. A card dropped on another goes before it, or after it on its right half. */
export function TeamStrip({ members, picked, onPick, onMove, onAdd, adding = false, onHide }: {
  members: Member[]; picked: string | null; onPick: (key: string) => void;
  /** The cards' new order after one was dragged. */
  onMove: (keys: string[]) => void;
  /** The last card: a new AI teammate. */
  onAdd?: () => void; adding?: boolean;
  /** Put a chat or a person away. It is listed under the cards (`HiddenList`), never drawn among them. */
  onHide?: (m: Member) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; side: 'before' | 'after' } | null>(null);
  const keys = members.map((m) => m.key);
  const sideOf = (e: DragEvent<HTMLElement>): 'before' | 'after' => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX > r.left + r.width / 2 ? 'after' : 'before';
  };
  const end = () => { setDragging(null); setOver(null); };
  return <div className="ev-strip" aria-label="Your team">
    {members.map((m) => <Card key={m.key} m={m} on={picked === m.key} onPick={() => onPick(m.key)}
      onHide={onHide && (() => onHide(m))}
      drop={over?.key === m.key && dragging && dragging !== m.key ? over.side : null}
      drag={{
        draggable: true,
        onDragStart: (e: DragEvent<HTMLElement>) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', m.key); setDragging(m.key); },
        onDragOver: (e: DragEvent<HTMLElement>) => { if (!dragging) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const side = sideOf(e); if (over?.key !== m.key || over.side !== side) setOver({ key: m.key, side }); },
        onDrop: (e: DragEvent<HTMLElement>) => { e.preventDefault(); if (dragging) onMove(moveMember(keys, dragging, m.key, sideOf(e))); end(); },
        onDragEnd: end,
      }} />)}
    {onAdd && <button type="button" className={`ev-card ev-add${adding ? ' on' : ''}`} onClick={onAdd} title="An AI teammate with a job of its own">
      <span className="ev-ai" style={{ width: 44, height: 44, fontSize: 16 }} aria-hidden="true">+</span>
      <div className="ev-t"><span className="ev-n">New teammate</span><span className="rm-ag">AI teammate</span></div>
    </button>}
  </div>;
}

/** "N hidden" under the cards: a short list of their names, each with Show, over the page rather than in it. */
export function HiddenList({ hidden, onShow, startOpen = false }: { hidden: Member[]; onShow: (m: Member) => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || hidden.length === 0) return undefined;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc, true); };
  }, [open, hidden.length]);
  if (hidden.length === 0) return null;
  return <div className="ev-hidden-at" ref={box}>
    <button type="button" className="ev-hidden" aria-expanded={open} onClick={() => setOpen((was) => !was)}>{hidden.length} hidden</button>
    {open && <div className="ev-hidden-menu" role="menu">
      {hidden.map((m) => <div key={m.key} className="ev-hidden-row">
        <span className="rm-one">{m.name}</span>
        <button type="button" aria-label={`Show ${m.name}`} onClick={() => { onShow(m); if (hidden.length === 1) setOpen(false); }}>Show</button>
      </div>)}
    </div>}
  </div>;
}

/** Over the open card's space: whose it is, its tabs, and anything it carries on the right. */
export function SpaceBar({ m, tabs, onTab, right, onMessage }: {
  m: Member; tabs: { id: string; label: string; count?: number; on: boolean }[]; onTab?: (id: string) => void; right?: ReactNode;
  /** Their chat, which is on the Chats page. */
  onMessage?: () => void;
}) {
  return <div className="ev-bar">
    <MemberFace m={m} size={22} />
    <span className="ev-bn">{m.kind === 'me' ? 'Your threads' : m.name}{m.role && <em>{m.role}</em>}</span>
    {tabs.length > 0 && <div className="tm-tabs">{tabs.map((t) => <button type="button" key={t.id} className={`tm-tab${t.on ? ' on' : ''}`} onClick={() => onTab?.(t.id)}>{t.label}{!!t.count && <b>{t.count}</b>}</button>)}</div>}
    {right != null && <span className="ev-right">{right}</span>}
    {onMessage && <button type="button" className="ev-msg" onClick={onMessage}>{BUBBLE}Message</button>}
  </div>;
}

export function AgentsLine({ n, still, starting = false }: { n: number | null; still?: string; starting?: boolean }) {
  if (n == null) return null;
  return <><LiveMark still={!n && !starting} />{n ? agentsWords(n) : starting ? 'Starting' : still ?? 'Not running'}</>;
}

/** An AI teammate's threads, the inbox's own rows: open ones first, then today's finished. */
export function MateThreads({ items, products, now, onOpen }: { items: WorkItem[]; products: Product[]; now: number; onOpen: (item: WorkItem) => void }) {
  if (!items.length) return <p className="ev-empty">Nothing on its plate. Message it to hand it something.</p>;
  return <div className="list th-table ev-rows">{items.map((item) => {
    const product = products.find((p) => p.slug === item.product);
    return <div key={`${item.product}/${item.id}`} className="row" role="button" tabIndex={0} onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(item); } }}>
      <span className="mark" aria-hidden="true" /><ThreadCells item={item} product={product} now={now} />
    </div>;
  })}</div>;
}

const CARD_MARK: Record<ThreadCard['state'], StatusCell['mark']> = { waiting: 'need', running: 'working', scheduled: 'sched', done: 'done' };

function CardRow({ c, who, now, onOpen }: { c: ThreadCard; who?: { name: string; url: string | null }; now: number; onOpen: (card: ThreadCard) => void }) {
  // The Status column's word for a running thread, as on the inbox's own rows beside it.
  const status: StatusCell = { word: c.state === 'running' ? 'Working' : STATE_WORD[c.state], mark: CARD_MARK[c.state], agent: c.state === 'running', live: c.state === 'running', cloud: false };
  const title = who ? <><span className="tq-from"><RoomFace name={who.name} url={who.url} size={18} /><b>{who.name}</b></span>{c.title ?? 'A thread'}</> : c.title ?? 'A thread';
  return <div className="row" role="button" tabIndex={0} onClick={() => onOpen(c)}
    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(c); } }}>
    <span className="mark" aria-hidden="true" />
    <RowCells status={status} title={title} where={c.project ?? ''} priority={c.priority} updatedAt={c.updatedAt} now={now} />
  </div>;
}

/** A person's shared threads, newest first, as rows. */
export function PersonThreads({ cards, name, now, onOpen }: { cards: ThreadCard[]; name: string; now: number; onOpen: (card: ThreadCard) => void }) {
  if (!cards.length) return <p className="ev-empty">{name} has no threads shared with the team right now.</p>;
  return <div className="list th-table ev-rows">{cards.map((c) => <CardRow key={`${c.personId}/${c.threadId}`} c={c} now={now} onOpen={onOpen} />)}</div>;
}

/** The team chat's Agents: everyone's threads in one list, each row saying whose it is. */
export function TeamThreads({ runs, people, products, now, onOpenItem, onOpenCard }: {
  runs: TeamRun<ThreadCard, WorkItem>[]; people: ReadonlyMap<string, { name: string; url: string | null }>; products: Product[]; now: number;
  onOpenItem: (item: WorkItem) => void; onOpenCard: (card: ThreadCard) => void;
}) {
  if (!runs.length) return <p className="ev-empty">Nobody on the team is running anything they share right now.</p>;
  return <div className="list th-table ev-rows team">{runs.map((r) => r.card
    ? <CardRow key={`${r.card.personId}/${r.card.threadId}`} c={r.card} who={people.get(r.card.personId) ?? { name: 'Someone', url: null }} now={now} onOpen={onOpenCard} />
    : <div key={`${r.item.product}/${r.item.id}`} className="row" role="button" tabIndex={0} onClick={() => onOpenItem(r.item)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpenItem(r.item); } }}>
      <span className="mark" aria-hidden="true" /><ThreadCells item={r.item} product={products.find((p) => p.slug === r.item.product)} now={now} />
    </div>)}</div>;
}

/** Needs you's corner: the people on your team and your AI teammates, each with how many agents it runs. */
export function CornerFaces({ members, onPick }: { members: Member[]; onPick: (key: string) => void }) {
  const people = members.filter((m) => m.kind === 'me' || m.kind === 'person');
  const mates = members.filter((m) => m.kind === 'mate');
  const face = (m: Member) => <button type="button" key={m.key} className="ev-cf" title={m.kind === 'me' ? 'You' : m.name} aria-label={m.kind === 'me' ? 'Your threads' : `Open ${m.name}`} onClick={() => onPick(m.key)}>
    <MemberFace m={m} size={24} />{!!m.agents && <span className="ev-cn">{m.agents}</span>}
  </button>;
  if (people.length + mates.length < 2) return null;
  return <div className="ev-corner">{people.map(face)}{mates.map(face)}</div>;
}
