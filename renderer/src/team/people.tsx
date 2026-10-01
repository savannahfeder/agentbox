// PEOPLE IN THE WINDOW: faces, names, due days, and the one object every team
// piece of the window reads (`TeamView`). Built once per snapshot in App and
// handed down, so no component has to know where the team came from.
import { createContext } from 'react';
import type { Person, Product, TeamState, WorkItem } from '../types';
import { isShared, heldByAPerson, runnerOf } from '../../../shared/team-rules.mjs';
import './team.css';

export interface TeamView {
  state: TeamState;
  me: string | null;
  byId: Map<string, Person>;
  products: Map<string, Product>;
}

/** The team, for anything deep in the window that draws a person (the thread,
 *  the opened task's header). Null unless someone is signed in. */
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

export const firstName = (person: Person | undefined | null) => (person?.name || person?.email || 'Someone').split(/\s+/)[0];
const initials = (person: Person | undefined | null) => firstName(person).slice(0, 2);

/** A square face: their photo when they have one, else their initials. */
export function Face({ person, me, agent, size }: { person?: Person | null; me?: boolean; agent?: boolean; size?: 'lg' | 'sm' }) {
  const cls = `tm-av${me ? ' you' : ''}${agent ? ' bot' : ''}${size ? ` ${size}` : ''}`;
  if (person?.avatarUrl && !agent) return <img className={`${cls} tm-ph`} src={person.avatarUrl} alt="" referrerPolicy="no-referrer" />;
  return <span className={cls} aria-hidden="true">{initials(person)}</span>;
}

/** "Due Thu", "Due today", "Due Oct 14": the row end's words for a due day. */
export function dueWords(due: string | undefined, now = new Date()): string | null {
  if (!due || due === 'none') return null;
  const [y, m, d] = due.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1 && days < 7) return `Due ${day.toLocaleDateString(undefined, { weekday: 'short' })}`;
  if (days < 0) return `Overdue ${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return `Due ${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** Who a shared row is FROM, for the row end: the person who sent it to me, or
 *  the teammate whose agent is asking. Null on anything of my own. */
export function sentBy(item: WorkItem, team: TeamView | null): { person: Person | undefined; agent: boolean } | null {
  if (!team) return null;
  const product = team.products.get(item.product);
  if (!isShared(product)) return null;
  const from = heldByAPerson(item) ? (item.people ?? []).find((p) => p !== team.me) ?? item.createdBy : runnerOf(item, product);
  if (!from || from === team.me) return null;
  return { person: team.byId.get(from), agent: !heldByAPerson(item) };
}

/** The row end's who-or-where: a teammate's face and name on a row from them,
 *  the project's name otherwise, with a lock on a private project once you are
 *  on a team, and the due day in the accent when there is one. */
export function TeamRowEnd({ item, team }: { item: WorkItem; team: TeamView | null }) {
  const from = sentBy(item, team);
  const due = item.assignee === team?.me ? dueWords(item.due) : null;
  const product = team?.products.get(item.product);
  const locked = !!team && !isShared(product);
  return <>
    {from
      ? <span className="tm-who"><Face person={from.person} agent={from.agent} />{from.agent ? `${firstName(from.person)}’s agent` : firstName(from.person)}</span>
      : <span className={`product${locked ? ' tm-lock' : ''}`}>{locked && <LockIcon />}{item.productName}</span>}
    {due && <span className="tm-due">{due}</span>}
  </>;
}

export function LockIcon() {
  return <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-label="Private"><rect x="2.5" y="5.5" width="7" height="5" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" /></svg>;
}
