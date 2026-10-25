// Every chat, full page (round 23): your conversations down the left, newest
// first with an unread dot, and the open one beside them. A direct record
// keeps its own view on the right; a room or a group is the room chat at full
// width. A right click on a conversation, or its ⋯, marks it read or unread,
// pins it to the top, mutes it, or leaves it.
import { useState, type ReactNode } from 'react';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { clockOf } from './room-rules';
import { MoreMenu, type MoreItem } from '../MessageMore';

export type Conversation = {
  key: string;
  kind: 'room' | 'group' | 'direct';
  /** A room's id, or a direct record's thread id. */
  id: string;
  name: string;
  faces: { name: string; url: string | null }[];
  last: string;
  at: number;
  unread: boolean;
  /** Marked unread by hand: the dot stays even while it is open. */
  marked?: boolean;
  muted?: boolean;
  pinned?: boolean;
};

export type ConversationAction = 'read' | 'unread' | 'pin' | 'unpin' | 'mute' | 'unmute' | 'leave';

export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
}

/** What a conversation's menu offers, in order. */
export function conversationMenu(c: Conversation): { label: string; action: ConversationAction }[] {
  const out: { label: string; action: ConversationAction }[] = [
    c.unread ? { label: 'Mark as read', action: 'read' } : { label: 'Mark as unread', action: 'unread' },
    c.pinned ? { label: 'Unpin', action: 'unpin' } : { label: 'Pin to top', action: 'pin' },
  ];
  if (c.kind !== 'direct') out.push(c.muted ? { label: 'Unmute', action: 'unmute' } : { label: 'Mute', action: 'mute' });
  if (c.kind === 'group') out.push({ label: 'Leave conversation', action: 'leave' });
  return out;
}

// Pins are kept on this computer, by conversation key.
export const PIN_KEY = 'messages.pinned';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const local = (): Store | null => { try { return localStorage; } catch { return null; } };

export function readPins(s: Store | null = local()): Set<string> {
  try {
    const got = JSON.parse(s?.getItem(PIN_KEY) ?? '[]');
    return new Set(Array.isArray(got) ? got.filter((k): k is string => typeof k === 'string') : []);
  } catch { return new Set(); }
}

export function togglePin(key: string, s: Store | null = local()): Set<string> {
  const pins = readPins(s);
  if (pins.has(key)) pins.delete(key); else pins.add(key);
  try { s?.setItem(PIN_KEY, JSON.stringify([...pins])); } catch { /* full or off: pinned until the page closes */ }
  return pins;
}

/** Pinned first, then the rest, each newest first. */
export function inListOrder(list: Conversation[], pins: ReadonlySet<string>): Conversation[] {
  const sorted = sortConversations(list).map((c) => ({ ...c, pinned: pins.has(c.key) }));
  return [...sorted.filter((c) => c.pinned), ...sorted.filter((c) => !c.pinned)];
}

function when(ms: number, now: number) {
  if (!ms) return '';
  const d = new Date(ms);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (ms >= today.getTime()) return clockOf(ms);
  if (ms >= today.getTime() - 6 * 86_400_000) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MessagesPage({ list, onKey, now, onPick, onAction, pins: pinsGiven, children }: {
  list: Conversation[]; onKey: string | null; now: number; onPick: (c: Conversation) => void;
  onAction?: (c: Conversation, action: ConversationAction) => void;
  /** Read from this computer when not given. */
  pins?: ReadonlySet<string>;
  children: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ c: Conversation; at: DOMRect } | null>(null);
  const [pins, setPins] = useState<ReadonlySet<string>>(() => pinsGiven ?? readPins());
  const q = query.trim().toLowerCase();
  const shown = inListOrder(list, pins).filter((c) => !q || c.name.toLowerCase().includes(q) || c.last.toLowerCase().includes(q));
  const items = (c: Conversation): MoreItem[] => {
    const out: MoreItem[] = [];
    for (const row of conversationMenu(c)) {
      const run = row.action === 'pin' || row.action === 'unpin' ? () => setPins(togglePin(c.key)) : () => onAction?.(c, row.action);
      if (row.action === 'leave') out.push('rule', { label: row.label, danger: true, onClick: run });
      else out.push({ label: row.label, onClick: run });
    }
    return out;
  };
  return <div className="rm-msgs">
    <div className="rm-list">
      <div className="hd"><label className="rm-search">{I.search()}<input value={query} placeholder="Search messages" aria-label="Search messages"
        onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur(); } }} /></label></div>
      <div className="rm-convs">
        {shown.map((c) => {
          const dot = c.unread && (c.key !== onKey || c.marked);
          return <div key={c.key} className={`rm-conv-wrap${menu?.c.key === c.key ? ' menu' : ''}`}
            onContextMenu={onAction ? (e) => { e.preventDefault(); setMenu({ c, at: new DOMRect(e.clientX, e.clientY, 0, 0) }); } : undefined}>
            <button type="button" className={`rm-conv${c.key === onKey ? ' on' : ''}${dot ? ' unread' : ''}${c.muted ? ' muted' : ''}`} onClick={() => onPick(c)}>
              {c.kind === 'room'
                ? <span className="fc room">{I.hash()}</span>
                : c.faces.length > 1
                  ? <span className="fc two">{c.faces.slice(0, 2).map((f, i) => <RoomFace key={i} name={f.name} url={f.url} size={18} />)}</span>
                  : <span className="fc"><RoomFace name={c.faces[0]?.name ?? c.name} url={c.faces[0]?.url} size={28} /></span>}
              <span className="t">
                <span className="nm"><b>{c.name}</b>{c.pinned && <span className="rm-conv-pin" aria-label="Pinned">{I.pinMark()}</span>}</span>
                <span className="ls">{c.last}</span>
              </span>
              <span className="m"><span>{when(c.at, now)}</span>{dot && <span className="rm-unread" />}</span>
            </button>
            {onAction && <button type="button" className="rm-conv-more" aria-label={`More for ${c.name}`} title="More"
              onClick={(e) => setMenu(menu?.c.key === c.key ? null : { c, at: e.currentTarget.getBoundingClientRect() })}>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="2.4" y="7.2" width="1.6" height="1.6" /><rect x="7.2" y="7.2" width="1.6" height="1.6" /><rect x="12" y="7.2" width="1.6" height="1.6" /></svg>
            </button>}
          </div>;
        })}
        {!shown.length && <div className="rm-convs-empty">{q ? `Nothing matches “${query.trim()}”.` : 'No conversations yet.'}</div>}
      </div>
    </div>
    <div className="rm-open">{children}</div>
    {menu && <MoreMenu at={menu.at} items={items(menu.c)} onClose={() => setMenu(null)} />}
  </div>;
}

/** The head of a room or group chat on the messages page. */
export function FullChatHead({ title, faces, actions }: { title: string; faces?: { name: string; url: string | null }[]; actions?: ReactNode }) {
  return <div className="hd">
    {faces?.length ? <span style={{ display: 'flex' }}>{faces.slice(0, 3).map((f, i) => <RoomFace key={i} name={f.name} url={f.url} size={22} />)}</span>
      : <span style={{ color: 'var(--text-faint)', display: 'flex' }}>{I.hash(15)}</span>}
    <span>{title}</span>
    {actions && <span className="ic">{actions}</span>}
  </div>;
}
