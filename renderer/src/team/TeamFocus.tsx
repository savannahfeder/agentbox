// AN OPENED SHARED TASK: who it came from, the people on it, and, on a task a
// teammate gave you, the three ways to route it with one click. Drawn with the
// app's own option-strip classes so it reads as the same control as any other
// row's options (approved 2026-09-30, screen 3 of the team design).
import { useContext, useState } from 'react';
import type { Product, WorkItem } from '../types';
import { api } from '../api';
import { isShared, heldByAPerson } from '../../../shared/team-rules.mjs';
import { peopleInConversation } from '../threads/page-rules';
import { Face, TeamContext, dueWords, firstName, type TeamView } from './people';

/** Is this a shared row given to a person? Then the team draws its header. */
export function teamHeld(item: WorkItem, team: TeamView | null): boolean {
  return !!team && isShared(team.products.get(item.product)) && heldByAPerson(item);
}

/** The line under the task's name on a row given to a person:
 *  "NORTHWIND · MAYA GAVE YOU THIS · DUE SAT" or "NORTHWIND · WITH THEO · DUE SAT". */
export function TeamSaid({ item }: { item: WorkItem }) {
  const team = useContext(TeamContext);
  if (!team) return null;
  const mine = item.assignee === team.me;
  const other = mine ? (item.people ?? []).find((p) => p !== team.me) ?? item.createdBy : item.assignee;
  const name = firstName(team.byId.get(other ?? ''));
  const due = dueWords(item.due);
  return <span className="fm-said">
    {item.productName} · {mine ? `${name} gave you this` : `with ${name}`}
    {due && <> · <span className="tm-due-word">{due}</span></>}
  </span>;
}

/** Who is on the row: their faces, the person it is with first. */
export function TeamPeople({ item }: { item: WorkItem }) {
  const team = useContext(TeamContext);
  if (!team) return null;
  const ids = [...new Set([...(item.people ?? []), item.createdBy, item.assignee].filter((p): p is string => !!p && p !== 'agent'))];
  if (ids.length < 2) return null;
  return <span className="tm-people" style={{ marginLeft: 'auto' }}>
    {ids.map((id) => <Face key={id} person={team.byId.get(id)} me={id === team.me} />)}
  </span>;
}

/**
 * ADD PEOPLE, beside the faces at the top of a conversation (w-71e6af492d).
 *
 * The conversation page named who was in it and offered no way to reach the
 * one with one more person in it, so the only route to a group was to start a
 * New thread and type every name again.
 *
 * IT ADDS NOBODY TO THIS CONVERSATION. Slack's rule, and the one the founder
 * asked for: adding someone makes the group's conversation and the old one
 * stays exactly as it was. So this opens New thread with everyone already here
 * in To, and the composer's own group rule takes it from there: one
 * conversation per exact group (main/team/index.mjs directWith), already
 * started or new.
 *
 * On conversation pages only, which `peopleInConversation` decides, so no
 * other page can grow this control by accident.
 */
export function AddPeople({ product, onAdd }: {
  product: Product | undefined | null;
  onAdd: (who: { to: string; also: string[] }) => void;
}) {
  const team = useContext(TeamContext);
  const who = peopleInConversation(product, team?.me ?? null);
  if (!who) return null;
  return <button type="button" className="tm-add-people" title="Add people to a new conversation" onClick={() => onAdd(who)}>
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.75 13c0-2.2 1.9-3.6 4.25-3.6 1 0 1.9.25 2.6.7" />
      <path d="M12 9v5M9.5 11.5h5" />
    </svg>
    Add people
  </button>;
}

/** On a task a teammate gave you: give it to an agent, keep it, or hand it back. */
export function TeamRouteStrip({ item }: { item: WorkItem }) {
  const team = useContext(TeamContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!team || !teamHeld(item, team) || item.assignee !== team.me) return null;
  // A message is talk, not a task (approved 2026-10-01): its page offers the
  // one way to make work of it, "Hand it to an agent", and nothing else.
  if ((team.products.get(item.product) as { team?: { direct?: boolean } } | undefined)?.team?.direct) return null;
  // Once you have chosen to keep it, the choices go away.
  if (item.wrote?.assignee?.by === team.me) return null;
  const from = (item.people ?? []).find((p) => p !== team.me) ?? item.createdBy ?? undefined;
  const choices: [string, 'agent' | 'me' | 'back'][] = [
    ['Give it to an agent', 'agent'],
    ['Do it myself', 'me'],
    [`Hand it back to ${firstName(team.byId.get(from ?? ''))}`, 'back'],
  ];
  const route = async (r: 'agent' | 'me' | 'back') => {
    setBusy(true); setError(null);
    const out = await api.teamRoute({ product: item.product, id: item.id, route: r });
    setBusy(false);
    if (!out.ok) setError(out.error ?? 'That did not work.');
  };
  const ask = (item.body ?? item.title).split('\n').find((l) => l.trim())?.replace(/\*\*/g, '').trim() ?? item.title;
  return <div className="opt-strip">
    <div className="opt-head opt-head-ask"><span>{ask}</span></div>
    {choices.map(([label, r], i) => <button key={r} className="opt-row" disabled={busy} onClick={() => route(r)}>
      <span className="opt-key">{i + 1}</span><span className="opt-text">{label}</span>
    </button>)}
    {error && <div className="opt-head"><span className="tm-error">{error}</span></div>}
  </div>;
}

export { Face };
