// A thread a teammate's run sent you says whose it is before its title.
import { createContext, useContext, type ReactNode } from 'react';
import type { Teammate, WorkItem } from '../types';
import { teammateIdOf, OFFER_LABEL } from '../../../shared/teammates.mts';
import { REACH_LABEL } from '../../../shared/teammate-reach.mts';
import { Name } from '../../../shared/product-name.mjs';
import { TeammateMark } from './TeammatesRail';

export const TeammatesContext = createContext<Map<string, Teammate>>(new Map());

/** Whose a teammate's thread is, as a face and a name; null on anything else. */
export function useTeammateWho(item: Pick<WorkItem, 'labels'>): { face: ReactNode; name: string } | null {
  const team = useContext(TeammatesContext);
  if ((item.labels ?? []).some((l) => l === OFFER_LABEL || l === REACH_LABEL)) return { face: <i className="tq tq-sm tq-hash" aria-hidden="true">+</i>, name: Name };
  const id = teammateIdOf(item);
  const t = id ? team.get(id) : undefined;
  return t ? { face: <TeammateMark t={t} />, name: t.name } : null;
}

export function TeammateLead({ item }: { item: Pick<WorkItem, 'labels'> }) {
  const team = useContext(TeammatesContext);
  if ((item.labels ?? []).some((l) => l === OFFER_LABEL || l === REACH_LABEL)) return <span className="tq-from"><i className="tq tq-sm tq-hash" aria-hidden="true">+</i><b>{Name}</b></span>;
  const id = teammateIdOf(item);
  const t = id ? team.get(id) : undefined;
  if (!t) return null;
  return <span className="tq-from"><TeammateMark t={t} /><b>{t.name}</b></span>;
}
