// A thread a teammate gave you says so, above its title: their face, when, and their note.
import { useContext } from 'react';
import type { WorkItem } from '../types';
import { Face, TeamContext, firstName } from './people';
import { handedBy } from './company';
import { updatedWords } from '../threads/page-rules';

export function HandedLine({ item, now = Date.now() }: { item: WorkItem; now?: number }) {
  const team = useContext(TeamContext);
  const h = team ? handedBy(item, team.products.get(item.product), team.me) : null;
  if (!team || !h) return null;
  const person = team.byId.get(h.from) ?? null;
  return <div className="handed-line">
    <Face person={person} size={20} />
    <span className="handed-who"><b>{firstName(person)}</b> gave you this <span className="handed-when">{updatedWords(h.at, now)}</span></span>
    {h.note && <span className="handed-note">{h.note}</span>}
  </div>;
}
