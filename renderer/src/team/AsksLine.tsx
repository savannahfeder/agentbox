// ABOVE YOUR REPLY BOX, WHILE SOMEONE YOU ASKED IS ON YOUR THREAD: who, since
// when, and Take it back. What they hand back lands in the thread itself.
import { createContext, useContext } from 'react';
import { asksOnThread, stepOf } from '../../../shared/thread-asks.mts';
import { updatedWords } from '../threads/page-rules';
import type { WorkItem } from '../types';
import { Face, TeamContext, firstName } from './people';
import './asks.css';

/** True on a thread of yours that a person can be asked about: an agent's message offers "Ask a teammate". */
export const AskAboutContext = createContext(false);

/** Opens the thread menu's people list with this message as the step (threads/ThreadMenu.tsx). */
export const askAboutStep = (text: string) => window.dispatchEvent(new CustomEvent('zero:ask-step', { detail: stepOf(text) }));

/** On the ask you sent, as its giver: who has it, and the way back to your thread. */
export function AskSentLine({ task, onOpenThread }: { task: WorkItem; onOpenThread: () => void }) {
  const team = useContext(TeamContext);
  if (!team || !task.ask || !task.assignee) return null;
  const person = team.byId.get(task.assignee) ?? null;
  const first = firstName(person) || 'Your teammate';
  const back = task.status === 'done';
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
        return (
          <div key={a.row.id} className="asks-one">
            <Face person={person} size={22} />
            <span className="asks-words">
              <span>{a.ask.kind === 'help'
                ? <><b>{first}</b> is helping and can write to your agent.</>
                : <><b>{first}</b> is reviewing this.</>}</span>
              <span className="asks-when">Asked {updatedWords(a.at, now)}</span>
            </span>
            <button type="button" className="asks-take" onClick={() => onTakeBack(a.row as WorkItem)}>Take it back</button>
          </div>
        );
      })}
    </div>
  );
}
