// PEOPLE IN THE WINDOW: faces, and the one object every team piece of the
// window reads (`TeamView`). Built once per snapshot in App and handed down
// through `TeamContext`, so no component has to know where the team came from.
// The pure rules (names, due days, who a row is from) are in ./company.ts.
import { createContext } from 'react';
import type { Person, Product, TeamState, WorkItem } from '../types';
import { isShared } from '../../../shared/team-rules.mjs';
import { dueWords, firstName, sentFrom } from './company';
import './team.css';

export { dueWords, firstName };

export interface TeamView {
  state: TeamState;
  me: string | null;
  byId: Map<string, Person>;
  products: Map<string, Product>;
}

/** The team, for anything deep in the window that draws a person (the thread,
 *  the opened task's header, the composer). Null unless someone is signed in. */
export const TeamContext = createContext<TeamView | null>(null);

export function teamView(state: TeamState | null | undefined, products: Product[]): TeamView | null {
  if (!state?.signedIn || !state.me) return null;
  return {
    state,
    me: state.me.id,
    byId: new Map(state.people.map((p) => [p.id, p])),
    products: new Map(products.map((p) => [p.slug, p])),
  };
}

const initials = (person: Person | undefined | null) => firstName(person).slice(0, 2);

/** A square face: their photo when they have one, else their initials. */
export function Face({ person, me, agent, size }: { person?: Person | null; me?: boolean; agent?: boolean; size?: 'lg' | 'sm' }) {
  const cls = `tm-av${me ? ' you' : ''}${agent ? ' bot' : ''}${size ? ` ${size}` : ''}`;
  if (person?.avatarUrl && !agent) return <img className={`${cls} tm-ph`} src={person.avatarUrl} alt="" referrerPolicy="no-referrer" />;
  return <span className={cls} aria-hidden="true">{initials(person)}</span>;
}

/** The row end's who-or-where: a teammate's face and name on a row from them,
 *  the project's name otherwise, with a lock on a private project once you are
 *  on a team, and the due day in the accent when there is one. */
export function TeamRowEnd({ item, team }: { item: WorkItem; team: TeamView | null }) {
  const product = team?.products.get(item.product);
  const sent = team ? sentFrom(item, product, team.me) : null;
  const person = sent ? team!.byId.get(sent.from) : undefined;
  const due = item.assignee === team?.me ? dueWords(item.due) : null;
  // Privacy is per thread now (approved 2026-10-01), so the lock follows the
  // thread's own choice, not whether its project is shared.
  const locked = !!team && item.visibility === 'private';
  return <>
    {sent
      ? <span className="tm-who"><Face person={person} agent={sent.agent} />{sent.agent ? `${firstName(person)}’s agent` : firstName(person)}</span>
      : <span className={`product${locked ? ' tm-lock' : ''}`}>{locked && <LockIcon />}{item.productName}</span>}
    {due && <span className="tm-due">{due}</span>}
  </>;
}

export function LockIcon() {
  return <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-label="Private"><rect x="2.5" y="5.5" width="7" height="5" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" /></svg>;
}
