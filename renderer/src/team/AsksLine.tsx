// WHILE SOMEONE YOU ASKED IS ON YOUR THREAD: their face in the thread's header,
// and pressed, who, since when and Take it back. What they write to your agent
// and what they hand back land in the thread itself.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { askIsOpen, askedOutWord, asksOnThread, stepOf } from '../../../shared/thread-asks.mts';
import { updatedWords } from '../threads/page-rules';
import type { WorkItem } from '../types';
import { Face, TeamContext, firstName } from './people';
import './asks.css';

/** True on a thread of yours that a person can be asked about: an agent's message offers "Ask a teammate". */
export const AskAboutContext = createContext(false);

/** What answers an ask, drawn under the message that asked it (team/AskBar.tsx). */
export const UnderTheAsk = createContext<ReactNode>(null);

/** Opens the thread menu's people list with this message as the step (threads/ThreadMenu.tsx). */
export const askAboutStep = (text: string) => window.dispatchEvent(new CustomEvent('zero:ask-step', { detail: stepOf(text) }));

/** On the ask you sent, as its giver, under the message that asked: who has it, and the way back to your thread. */
export function AskSentLine({ task, onOpenThread }: { task: WorkItem; onOpenThread: () => void }) {
  const team = useContext(TeamContext);
  if (!team || !task.ask || !task.assignee) return null;
  const person = team.byId.get(task.assignee) ?? null;
  const first = firstName(person) || 'Your teammate';
  const back = !askIsOpen(task);
  return (
    <div className="ask-bar ask-under" role="status">
      <p className="ask-sent-words">{back
        ? 'The thread is yours again.'
        : task.ask.kind === 'help' ? `${first} is helping on your thread.` : `${first} is reviewing your thread.`}</p>
      <div className="ask-bar-acts"><button type="button" onClick={onOpenThread}>Open your thread</button></div>
    </div>
  );
}

/** In the thread's header while someone you asked has it: small, and the rest on pressing it. */
export function AsksChip({ item, items, now = Date.now(), onTakeBack, onMessage }: {
  item: WorkItem;
  items: readonly WorkItem[];
  now?: number;
  onTakeBack: (task: WorkItem) => void;
  /** Nudging them is a message about this thread, not taking it back. */
  onMessage?: (personId: string) => void;
}) {
  const team = useContext(TeamContext);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  if (!team) return null;
  const asks = asksOnThread(items, team.me, item.id).filter((a) => a.open);
  if (!asks.length) return null;
  const seenOf = (row: { id: string; assignee?: string | null; product?: string }) => team.state.seen?.[`${row.product}/${row.id}`]?.[row.assignee ?? ''] ?? 0;
  // The board's own words, so the chip and the row never disagree about whether it was opened.
  const label = askedOutWord(items, team.me, item.id, (id) => team.byId.get(id)?.name ?? '', seenOf);
  return (
    <span className="asks-chip-wrap" ref={box}>
      <button type="button" className="ts-done asks-chip" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="asks-faces">{[...new Set(asks.map((a) => a.to))].map((to) => <Face key={to} person={team.byId.get(to) ?? null} size={18} />)}</span>
        {label}
      </button>
      {open && <div className="th-menu asks-pop" role="dialog" aria-label="Who you asked">
        {asks.map((a) => {
          const first = firstName(team.byId.get(a.to) ?? null) || 'Someone';
          const seenAt = team.state.seen?.[`${(a.row as WorkItem).product}/${a.row.id}`]?.[a.to] ?? 0;
          return (
            <div key={a.row.id} className="asks-pop-one">
              <p className="asks-pop-what">{a.ask.kind === 'help'
                ? <><b>{first}</b> can write to your agent until they hand it back.</>
                : <><b>{first}</b> reviews this and hands it back.</>}</p>
              {a.ask.note && <p className="asks-note">{a.ask.note}</p>}
              <div className="asks-pop-foot">
                <span className="asks-when">{seenAt >= a.at ? `Seen ${updatedWords(seenAt, now)}` : `Asked ${updatedWords(a.at, now)}, not opened yet`}</span>
                {onMessage && <button type="button" className="asks-take" onClick={() => { setOpen(false); onMessage(a.to); }}>Message {first}</button>}
                <button type="button" className="asks-take" onClick={() => { setOpen(false); onTakeBack(a.row as WorkItem); }}>Take it back</button>
              </div>
            </div>
          );
        })}
      </div>}
    </span>
  );
}
