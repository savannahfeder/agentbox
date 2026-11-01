// AN OPENED SHARED TASK: who it came from, the people on it, and, on a task a
// teammate gave you, the three ways to route it with one click. Drawn with the
// app's own option-strip classes so it reads as the same control as any other
// row's options (approved 2026-09-30, screen 3 of the team design).
import { useContext, useEffect, useRef, useState } from 'react';
import type { Product, WorkItem } from '../types';
import { api } from '../api';
import { isGivenTask, isShared, heldByAPerson, taskGiver } from '../../../shared/team-rules.mjs';
import { isDirect, peopleInConversation, peopleToAdd } from '../threads/page-rules';
import { shownPriority } from '../../../shared/rank.mjs';
import { priorityIdOf, priorityLabelOf } from '../priority';
import { Face, TeamContext, dueWords, firstName, type TeamView } from './people';
import { agentOnTask } from './tasks';
import { TeammatesContext } from '../teammates/row-lead';
import { shownTitle } from '../../../shared/thread-title.mjs';

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
  const task = isGivenTask(item, team.products.get(item.product));
  const closer = item.wrote?.status?.by;
  const said = task && item.status === 'done'
    ? `${closer === team.me ? 'you' : firstName(team.byId.get(closer ?? '') ?? team.byId.get(other ?? ''))} marked this done`
    : mine ? `${name} gave you this` : `with ${name}`;
  return <span className="fm-said">
    {task ? 'Task' : item.productName} · {said}
    {task && <> · {priorityLabelOf(priorityIdOf(shownPriority(item)))}</>}
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
 * An agent thread is not a conversation: there it is a small menu, and the
 * person picked joins the thread's chosen people.
 */
export function AddPeople({ item, product, onAdd }: {
  item: WorkItem;
  product: Product | undefined | null;
  onAdd: (item: WorkItem, person?: string) => void;
}) {
  const team = useContext(TeamContext);
  const [open, setOpen] = useState(false);
  const here = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const ask = () => { if (isDirect(product)) onAdd(item); else setOpen(true); };
    window.addEventListener('zero:add-people', ask);
    return () => window.removeEventListener('zero:add-people', ask);
  }, [item, product, onAdd]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => { if (!here.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  const mark = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
    <circle cx="6" cy="5.5" r="2.5" />
    <path d="M1.75 13c0-2.2 1.9-3.6 4.25-3.6 1 0 1.9.25 2.6.7" />
    <path d="M12 9v5M9.5 11.5h5" />
  </svg>;
  if (isDirect(product)) {
    if (!peopleInConversation(product, team?.me ?? null, team?.state.people ?? [])) return null;
    return <button type="button" className="tm-add-people" title="Add people to a new conversation" onClick={() => onAdd(item)}>
      {mark}
      Add people
    </button>;
  }
  const offered = peopleToAdd({ item, me: team?.me ?? null, company: team?.state.people ?? [] });
  if (!offered.length) return null;
  return <span className="tm-add-wrap" ref={here}>
    <button type="button" className="tm-add-people" title="Add someone to this thread" aria-expanded={open} onClick={() => setOpen((was) => !was)}>
      {mark}
      Add people
    </button>
    {open && <div className="tm-add-menu" role="menu" aria-label="Add to this thread">
      <p>They will see this thread.</p>
      {offered.map((p) => (
        <button key={p.id} type="button" role="menuitem" onClick={() => { setOpen(false); onAdd(item, p.id); }}>
          <Face person={p} /><span>{p.name}</span>
        </button>
      ))}
    </div>}
  </span>;
}

/** On a task a teammate gave you, the three ways to route it, which the strip
 *  below and ⌘K both offer. None once you have chosen. */
export function teamRouteChoices(item: WorkItem, team: TeamView | null): { route: 'agent' | 'me' | 'back'; label: string }[] {
  if (!team || !teamHeld(item, team) || item.assignee !== team.me) return [];
  // A task someone gave you stays yours and writing back does not return it, so
  // the one choice is who does the work.
  if (isGivenTask(item, team.products.get(item.product))) return item.status === 'done' ? [] : [{ route: 'agent', label: 'Give it to an agent' }];
  // A message is talk, not a task (approved 2026-10-01): work comes out of it
  // only by @-mentioning an agent in the reply box, which works in the project
  // its mention names. There is no line under the conversation offering to
  // hand it all to an agent (taken out 2026-10-05), and nothing else here.
  if ((team.products.get(item.product) as { team?: { direct?: boolean } } | undefined)?.team?.direct) return [];
  // Once you have chosen to keep it, the choices go away.
  if (item.wrote?.assignee?.by === team.me) return [];
  const from = taskGiver(item) ?? undefined;
  return [
    { route: 'agent', label: 'Give it to an agent' },
    { route: 'me', label: 'Do it myself' },
    { route: 'back', label: `Hand it back to ${firstName(team.byId.get(from ?? ''))}` },
  ];
}

/** On a task a teammate gave you: give it to an agent, keep it, or hand it back. */
export function TeamRouteStrip({ item, onHandToAgent, items = [], onOpenItem }: { item: WorkItem; onHandToAgent?: (item: WorkItem) => void; items?: readonly WorkItem[]; onOpenItem?: (item: WorkItem) => void }) {
  const team = useContext(TeamContext);
  const mates = useContext(TeammatesContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = teamRouteChoices(item, team);
  const on = isGivenTask(item, team?.products.get(item.product)) ? agentOnTask(items, item, [...mates.values()]) : null;
  if (on && item.status !== 'done') {
    return <div className="opt-strip">
      <button type="button" className="opt-row" onClick={() => onOpenItem?.(on.item)}>
        <span className="opt-text">With {on.name}</span><span className="tm-with-thread">{shownTitle(on.item)}</span>
      </button>
    </div>;
  }
  if (!choices.length) return null;
  const route = async (r: 'agent' | 'me' | 'back') => {
    if (isGivenTask(item, team?.products.get(item.product))) { onHandToAgent?.(item); return; }
    setBusy(true); setError(null);
    const out = await api.teamRoute({ product: item.product, id: item.id, route: r });
    setBusy(false);
    if (!out.ok) setError(out.error ?? 'That did not work.');
  };
  const ask = (item.body ?? item.title).split('\n').find((l) => l.trim())?.replace(/\*\*/g, '').trim() ?? item.title;
  return <div className="opt-strip">
    {!isGivenTask(item, team?.products.get(item.product)) && <div className="opt-head opt-head-ask"><span>{ask}</span></div>}
    {choices.map(({ label, route: r }, i) => <button key={r} className="opt-row" disabled={busy} onClick={() => route(r)}>
      <span className="opt-key">{i + 1}</span><span className="opt-text">{label}</span>
    </button>)}
    {error && <div className="opt-head"><span className="tm-error">{error}</span></div>}
  </div>;
}

export { Face };
