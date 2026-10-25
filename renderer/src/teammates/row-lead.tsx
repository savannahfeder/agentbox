// A thread a teammate's run sent you says whose it is before its title.
import { createContext, useContext } from 'react';
import type { Teammate, WorkItem } from '../types';
import { teammateIdOf, OFFER_LABEL } from '../../../shared/teammates.mjs';
import { Name } from '../../../shared/product-name.mjs';
import { TeammateMark } from './TeammatesRail';

export const TeammatesContext = createContext<Map<string, Teammate>>(new Map());

export function TeammateLead({ item }: { item: Pick<WorkItem, 'labels'> }) {
  const team = useContext(TeammatesContext);
  if ((item.labels ?? []).includes(OFFER_LABEL)) return <span className="tq-from"><i className="tq tq-sm tq-hash" aria-hidden="true">+</i><b>{Name}</b></span>;
  const id = teammateIdOf(item);
  const t = id ? team.get(id) : undefined;
  if (!t) return null;
  return <span className="tq-from"><TeammateMark t={t} /><b>{t.name}</b></span>;
}
