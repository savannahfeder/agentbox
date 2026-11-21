// A thread a teammate's run sent you says whose it is before its title.
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
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
  return t ? { face: <span className="th-mate" style={{ '--mate-tint': tintOf(t.name) } as CSSProperties}><TeammateMark t={t} /></span>, name: t.name } : null;
}

// The pastels of the faces drawn for AI teammates, so a letter already wears the colour its face will.
const TINTS = ['#c0aede', '#b6e3f4', '#ffd5dc', '#d1d4f9', '#ffdfbf'];
const tintOf = (name: string) => TINTS[[...name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length];

export function TeammateLead({ item }: { item: Pick<WorkItem, 'labels'> }) {
  const who = useTeammateWho(item);
  return who ? <span className="tq-from">{who.face}<b>{who.name}</b></span> : null;
}
