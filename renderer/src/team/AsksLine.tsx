// WHILE SOMEONE YOU ASKED IS ON YOUR THREAD: their face in the thread's header,
// and pressed, who, since when and Take it back. What they write to your agent
// and what they hand back land in the thread itself.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { askIsOpen, asksOnThread, stepOf } from '../../../shared/thread-asks.mts';
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

/** On the ask you sent, as its giver: who has it, and the way back to your thread. */
export function AskSentLine({ task, onOpenThread }: { task: WorkItem; onOpenThread: () => void }) {
  const team = useContext(TeamContext);
  if (!team || !task.ask || !task.assignee) return null;
  const person = team.byId.get(task.assignee) ?? null;
  const first = firstName(person) || 'Your teammate';
  const back = !askIsOpen(task);
  return (
    <div className="asks-line" role="status">
      <div className="asks-one">
        <Face person={person} size={22} />
        <span className="asks-words"><span>{back
          ? <>The thread is yours again.</>
          : task.ask.kind === 'help' ? <><b>{first}</b> is helping on your thread.</> : <><b>{first}</b> is reviewing your thread.</>}</span></span>
        <button type="button" className="asks-take" onClick={onOpenThread}>Open your thread</button>
      </div>
    </div>
  );
}

export function AsksLine({ item, items, now = Date.now(), onTakeBack }: {
  item: WorkItem;
  items: readonly WorkItem[];
  now?: number;
  onTakeBack: (task: WorkItem) => void;
}) {
  const team = useContext(TeamContext);
  if (!team) return null;
  const open = asksOnThread(items, team.me, item.id).filter((a) => a.open);
  if (!open.length) return null;
  return (
    <div className="asks-line" role="status">
      {open.map((a) => {
        const person = team.byId.get(a.to) ?? null;
        const first = firstName(person) || 'Someone';
        // Whether they have opened the ask yet, from the read marks the task carries.
        const seenAt = team.state.seen?.[`${(a.row as WorkItem).product}/${a.row.id}`]?.[a.to] ?? 0;
        return (
          <div key={a.row.id} className="asks-one">
            <Face person={person} size={22} />
            <span className="asks-words">
              <span>{a.ask.kind === 'help'
                ? <><b>{first}</b> is helping and can write to your agent.</>
                : <><b>{first}</b> is reviewing this.</>}</span>
              <span className="asks-when">{seenAt >= a.at ? `Seen ${updatedWords(seenAt, now)}` : `Asked ${updatedWords(a.at, now)}, not opened yet`}</span>
              {a.ask.note && <span className="asks-note">{a.ask.note}</span>}
            </span>
            <button type="button" className="asks-take" onClick={() => onTakeBack(a.row as WorkItem)}>Take it back</button>
          </div>
        );
      })}
    </div>
  );
}

/** In the thread's header while someone you asked has it: small, and the rest on pressing it. */
export function AsksChip({ item, items, now = Date.now(), onTakeBack }: {
  item: WorkItem;
  items: readonly WorkItem[];
  now?: number;
  onTakeBack: (task: WorkItem) => void;
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
  const names = asks.map((a) => firstName(team.byId.get(a.to) ?? null) || 'Someone');
  const word = asks.every((a) => a.ask.kind === 'review') ? 'reviewing' : 'helping';
  return (
    <span className="asks-chip-wrap" ref={box}>
      <button type="button" className="ts-done asks-chip" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="asks-faces">{asks.map((a) => <Face key={a.row.id} person={team.byId.get(a.to) ?? null} size={18} />)}</span>
        {names.length === 1 ? `${names[0]} is ${word}` : `${names.length} people are ${word}`}
      </button>
      {open && <div className="th-menu asks-pop" role="dialog" aria-label="Who you asked">
        {asks.map((a) => {
          const first = firstName(team.byId.get(a.to) ?? null) || 'Someone';
          const seenAt = team.state.seen?.[`${(a.row as WorkItem).product}/${a.row.id}`]?.[a.to] ?? 0;
          return (
            <div key={a.row.id} className="asks-pop-one">
              <p className="asks-pop-what">{a.ask.kind === 'help'
                ? <><b>{first}</b> can write to your agent until they hand it back.</>
                : <><b>{first}</b> is reviewing this and will hand it back.</>}</p>
              {a.ask.note && <p className="asks-note">{a.ask.note}</p>}
              <div className="asks-pop-foot">
                <span className="asks-when">{seenAt >= a.at ? `Seen ${updatedWords(seenAt, now)}` : `Asked ${updatedWords(a.at, now)}, not opened yet`}</span>
                <button type="button" className="asks-take" onClick={() => { setOpen(false); onTakeBack(a.row as WorkItem); }}>Take it back</button>
              </div>
            </div>
          );
        })}
      </div>}
    </span>
  );
}
