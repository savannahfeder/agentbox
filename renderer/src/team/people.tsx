// PEOPLE IN THE WINDOW: faces, and the one object every team piece of the
// window reads (`TeamView`). Built once per snapshot in App and handed down
// through `TeamContext`, so no component has to know where the team came from.
// The pure rules (names, due days, who a row is from) are in ./company.ts.
import { createContext, type CSSProperties, type ReactNode } from 'react';
import type { Person, Product, TeamState, WorkItem } from '../types';
import { isShared } from '../../../shared/team-rules.mts';
import { visibilityOf } from '../../../shared/thread-cards.mts';
import { dueWords, firstName, personOf, sentFrom } from './company';
import { deadlineOf, dueSaid } from '../../../shared/team-tasks.mts';
import { initialsOf } from './rooms/room-rules';
import './team.css';

export { dueWords, firstName, personOf };

export interface TeamView {
  state: TeamState;
  me: string | null;
  byId: Map<string, Person>;
  /** People known only from my rooms, to name and draw, never to pick (company.ts personOf). */
  alsoById?: Map<string, Person>;
  products: Map<string, Product>;
}

/** The team, for anything deep in the window that draws a person (the thread,
 *  the opened task's header, the composer). Null unless someone is signed in. */
export const TeamContext = createContext<TeamView | null>(null);

export function teamView(state: TeamState | null | undefined, products: Product[], multiplayer?: boolean): TeamView | null {
  // With Multiplayer off the sign-in is kept for the phone only.
  if (multiplayer === false || !state?.signedIn || !state.me) return null;
  return {
    state,
    me: state.me.id,
    byId: new Map(state.people.map((p) => [p.id, p])),
    products: new Map(products.map((p) => [p.slug, p])),
  };
}

/** Letter size for a face `px` wide: big enough to read at 16, never shouting at 72. */
const lettersAt = (px: number) => Math.round(Math.min(px * 0.45, 6 + px * 0.2) * 2) / 2;

/** The one drawing of a person, round: a photo, else two letters. Without a
 *  numeric `size` the surrounding rule sizes it. */
export function Face({ person, name, url, me, agent, size, children }: {
  person?: Person | null;
  name?: string;
  url?: string | null;
  me?: boolean;
  agent?: boolean;
  size?: 'lg' | number;
  /** Drawn in place of the letters, when there is no name to take them from. */
  children?: ReactNode;
}) {
  const cls = `tm-av${me ? ' you' : ''}${agent ? ' bot' : ''}${size === 'lg' ? ' lg' : ''}`;
  const box: CSSProperties | undefined = typeof size === 'number'
    ? { width: size, height: size, lineHeight: `${size - 2}px`, fontSize: lettersAt(size) }
    : undefined;
  const photo = url ?? person?.avatarUrl;
  if (photo && !agent) return <img className={`${cls} tm-ph`} src={photo} style={box} alt="" referrerPolicy="no-referrer" />;
  const letters = name !== undefined ? initialsOf(name) : firstName(person).slice(0, 2);
  return <span className={cls} style={box} aria-hidden="true">{children ?? letters}</span>;
}

/** The row end's who-or-where: a teammate's face and name on a row from them,
 *  the project's name otherwise, with a lock on a private project once you are
 *  on a team, and the due day in the accent when there is one. */
export function TeamRowEnd({ item, team }: { item: WorkItem; team: TeamView | null }) {
  const product = team?.products.get(item.product);
  const sent = team ? sentFrom(item, product, team.me) : null;
  const person = sent ? team!.byId.get(sent.from) : undefined;
  const due = team ? dueSaid(deadlineOf(item, team.me), Date.now())?.word ?? null : null;
  // Privacy is per thread now (approved 2026-10-01), so the lock follows the
  // thread's own choice, not whether its project is shared.
  // In your personal project that choice is Only you until you make another.
  const locked = !!team && visibilityOf(item, product) === 'private';
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
