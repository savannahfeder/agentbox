// ABOVE YOUR REPLY BOX, WHILE SOMEONE YOU ASKED IS ON YOUR THREAD: who, since
// when, and Take it back. What they hand back lands in the thread itself.
import { useContext } from 'react';
import { asksOnThread } from '../../../shared/thread-asks.mts';
import { updatedWords } from '../threads/page-rules';
import type { WorkItem } from '../types';
import { Face, TeamContext, firstName } from './people';
import './asks.css';

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
              {a.ask.kind === 'help'
                ? <><b>{first}</b> is helping. What they write here goes to your agent.</>
                : <><b>{first}</b> is reviewing this.</>}
              <span className="asks-when">Asked {updatedWords(a.at, now)}</span>
            </span>
            <button type="button" className="asks-take" onClick={() => onTakeBack(a.row as WorkItem)}>Take it back</button>
          </div>
        );
      })}
    </div>
  );
}
