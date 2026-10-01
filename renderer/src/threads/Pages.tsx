// THE INBOX AND TEAM PAGES' PIECES (approved 2026-10-01, w-e731ca9376).
//
// The header's right end (Search, New thread, Display), the state tabs, the
// cells of a thread row in the inbox's table, and the Team page with its
// Everyone and project pickers over a board or a list. The rules they follow
// are in ./page-rules.ts; the look is ./pages.css, ported from the drawings
// she approved.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Person, Product, ThreadCard, ThreadStateWord, View, WorkItem } from '../types';
import { priorityIdOf, priorityLabelOf, PRIORITIES, type PriorityId } from '../priority';
import { Face, TeamContext, firstName } from '../team/people';
import { PriorityIcon } from '../components/Priority';
import { rowTitle } from '../list-rules';
import { DONE } from '../done-word';
import {
  BOARD_COLUMNS, isDirect, isFiltered, teamEntries, teamKeeps, updatedWords,
  type BoardEntry, type Display, type PageId, type UpdatedWindow,
} from './page-rules';
import { messageLine, messagePriority, rowSharing, sharePatch } from './page-rules';
import { facesShown, togglePicked } from './people-rules';
import { api } from '../api';
import './pages.css';

/* ------------------------------------------------------------ icons */
export const PenIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 20h8" /><path d="m4 20 1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /></svg>;
const SearchGlyph = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>;
const SlidersIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
const ListIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
const BoardIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3.5" y="4" width="5" height="16" rx="1" /><rect x="10.5" y="4" width="5" height="11" rx="1" /><rect x="17.5" y="4" width="3" height="7" rx="1" /></svg>;
export const PeopleIcon = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="9" cy="9" r="3.2" /><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7" /></svg>;
export const LockMark = () => <svg className="th-lock" width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-label="Private"><rect x="1.5" y="5.5" width="8" height="6" rx="1" /><path d="M3.5 5.5V3.8a2 2 0 0 1 4 0v1.7" /></svg>;
/** Two people: the team can see this thread. After the title on the inbox rows
 *  the team can see and on nothing else, and beside "Team" in the summary.
 *  `label` names it for a screen reader where no word stands beside it. */
export function SharedMark({ className = 'th-shared', label }: { className?: string; label?: string }) {
  return <svg className={className} width="14" height="12" viewBox="2 4 20 17" fill="none" stroke="currentColor" strokeWidth="1.7"
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
    <circle cx="9" cy="9" r="3.2" /><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7" />
  </svg>;
}

/* ------------------------------------------------------------ marks */
/** A thread's state mark. `live` turns it: an agent is on the thread now,
 *  rather than the thread waiting its turn. */
export function StateGlyph({ state, live = false }: { state: ThreadStateWord; live?: boolean }) {
  return <span className={`th-st s-${state}${live ? ' live' : ''}`} aria-hidden="true" title={live ? 'An agent is on it now' : undefined} />;
}

/** The threads an agent is on right now, by id (App.tsx provides it). */
export const LiveContext = createContext<Set<string>>(new Set());

// THE APP'S OWN PRIORITY BARS. Urgent is a fourth bar, never an exclamation
// mark in a box (w-bba20a03f5, Priority.tsx), whatever the drawing showed.
export function PriorityMark({ id }: { id: PriorityId }) {
  return <span className="th-prio-mark"><PriorityIcon id={id} /></span>;
}

/* ------------------------------------------------------------ outside clicks */
function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open, close]);
  return ref;
}

/* ------------------------------------------------------------ the header */
/** Search, New thread and the Display icon, at the right of the Inbox and Team headers. */
export function HeaderActions({ page, display, onDisplay, products, onSearch, onCompose, shown, total }: {
  page: PageId; display: Display; onDisplay: (d: Display) => void; products: Product[];
  onSearch: () => void; onCompose: () => void; shown?: number; total?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return <div className="th-right">
    <button type="button" className="th-search" data-hint="search" data-hint-text="span" onClick={onSearch} title="Search threads (/)" aria-label="Search threads"><SearchGlyph /><span>Search</span><kbd>/</kbd></button>
    <button type="button" className="th-new" data-hint="new-task" onClick={onCompose} title="New thread (N)"><PenIcon />New thread</button>
    <span ref={(el) => { ref.current = el; }} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className={`th-disp${open ? ' open' : ''}`} aria-label="View and filters" title="View and filters" onClick={() => setOpen((o) => !o)}>
        <SlidersIcon />{isFiltered(display) && <i />}
      </button>
      {open && <DisplayMenu page={page} display={display} onDisplay={onDisplay} products={products} shown={shown} total={total} />}
    </span>
  </div>;
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** View, sort, and the filters: priority, project and when it was updated. */
export function DisplayMenu({ page, display, onDisplay, products, shown, total }: {
  page: PageId; display: Display; onDisplay: (d: Display) => void; products: Product[]; shown?: number; total?: number;
}) {
  const projects = products.filter((p) => !isDirect(p) && !(p as { practice?: boolean }).practice);
  const set = (patch: Partial<Display>) => onDisplay({ ...display, ...patch });
  const windows: [UpdatedWindow, string][] = [['today', 'Today'], ['week', 'This week'], ['any', 'Any time']];
  return <div className="th-pop" role="dialog" aria-label={page === 'inbox' ? 'Inbox view and filters' : 'Team view and filters'}>
    <div className="line"><span className="lab">View</span><span className="opts">
      <button type="button" className={display.view === 'list' ? 'on' : ''} onClick={() => set({ view: 'list' })}><ListIcon />List</button>
      <button type="button" className={display.view === 'board' ? 'on' : ''} onClick={() => set({ view: 'board' })}><BoardIcon />Board</button>
    </span></div>
    <div className="line"><span className="lab">Sort by</span><span className="opts">
      <button type="button" className={display.sort === 'priority' ? 'on' : ''} onClick={() => set({ sort: 'priority' })}>Priority</button>
      <button type="button" className={display.sort === 'updated' ? 'on' : ''} onClick={() => set({ sort: 'updated' })}>Updated</button>
    </span></div>
    <div className="rule" />
    <div className="line"><span className="lab">Priority</span><span className="opts">
      {PRIORITIES.map((p) => <button type="button" key={p.id} className={display.priorities.includes(p.id) ? 'on' : ''} onClick={() => set({ priorities: toggle(display.priorities, p.id) })}><PriorityMark id={p.id} />{p.label}</button>)}
    </span></div>
    {page === 'inbox' && projects.length > 1 && <div className="line"><span className="lab">Project</span><span className="opts">
      {projects.map((p) => <button type="button" key={p.slug} className={display.projects.includes(p.slug) ? 'on' : ''} onClick={() => set({ projects: toggle(display.projects, p.slug) })}>{p.name}</button>)}
    </span></div>}
    <div className="line"><span className="lab">Updated</span><span className="opts">
      {windows.map(([w, label]) => <button type="button" key={w} className={display.updated === w ? 'on' : ''} onClick={() => set({ updated: w })}>{label}</button>)}
    </span></div>
    <div className="rule" />
    <div className="foot"><span>{shown !== undefined && total !== undefined ? `Showing ${shown} of ${total}` : ''}</span>
      {isFiltered(display) && <button type="button" onClick={() => set({ priorities: [], projects: [], updated: 'any' })}>Clear filters</button>}
    </div>
  </div>;
}

/* ------------------------------------------------------------ the tabs */
export type TabView = View | 'all';
export const INBOX_TABS: { view: TabView; label: string }[] = [
  { view: 'inbox', label: 'Needs you' },
  { view: 'progress', label: 'In progress' },
  { view: 'snoozed', label: 'Scheduled' },
  { view: 'done', label: DONE.short },
  { view: 'all', label: 'All' },
];

/** `needs` renames the first tab (Waiting, once a teammate is on the page);
 *  `end` is what sits at the bar's right end, the faces. */
export function StateTabs({ view, counts, onView, needs, end }: {
  view: TabView; counts: Partial<Record<TabView, number>>; onView: (v: TabView) => void; needs?: string; end?: ReactNode;
}) {
  return <div className="th-bar"><div className="tm-tabs">
    {INBOX_TABS.map((t) => <button type="button" key={t.view} className={`tm-tab${view === t.view ? ' on' : ''}`} onClick={() => onView(t.view)}>{t.view === 'inbox' && needs ? needs : t.label}{counts[t.view] !== undefined && <b>{counts[t.view]}</b>}</button>)}
  </div>{end}</div>;
}

/* ------------------------------------------------------------ whose threads */
/**
 * THE FACES THAT PICK WHOSE THREADS ARE ON THE PAGE (w-05ff3d1438). At the
 * right end of the tab bar, you first. A face is a switch: lit when that
 * person's threads are on the page, faint when not. Past four people the rest
 * fold into "+N", which opens everyone as a list. Nothing is drawn for a
 * person alone on a team, or for nobody signed in.
 */
export function PeoplePicker({ everyone, picked, me, onPick }: {
  everyone: Person[]; picked: string[]; me: string | null; onPick: (picked: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const { faces, more } = facesShown(everyone, picked, me);
  if (!faces.length) return null;
  const name = (p: Person) => (p.id === me ? 'You' : p.name || p.email || 'Someone');
  const face = (p: Person) => {
    const on = picked.includes(p.id);
    return <button type="button" key={p.id} className={`th-face${on ? ' on' : ''}`} aria-pressed={on}
      title={on ? `${name(p)}: shown. Click to hide.` : `Show ${p.id === me ? 'your' : `${firstName(p)}’s`} threads`}
      onClick={() => onPick(togglePicked(picked, p.id, me))}><Face person={p} me={p.id === me} /></button>;
  };
  const sorted = [...everyone.filter((p) => p.id === me), ...everyone.filter((p) => p.id !== me).sort((a, b) => name(a).localeCompare(name(b)))];
  const hiddenPicked = more > 0 && picked.some((id) => !faces.some((f) => f.id === id));
  return <div className="th-people" role="group" aria-label="Whose threads are shown">
    {faces.map(face)}
    {more > 0 && <span ref={(el) => { ref.current = el; }} className="th-more-wrap">
      <button type="button" className={`th-face th-more${open ? ' open' : ''}${hiddenPicked ? ' on' : ''}`} aria-haspopup="listbox" aria-expanded={open}
        title={`${more} more`} onClick={() => setOpen(!open)}>+{more}</button>
      {open && <div className="th-menu th-people-menu" role="listbox" aria-multiselectable="true">
        <button type="button" className="row-i" onClick={() => { onPick(me ? [me] : picked); setOpen(false); }}><span className="ico"><PeopleIcon /></span>Just you</button>
        <button type="button" className="row-i" onClick={() => { onPick(sorted.map((p) => p.id)); setOpen(false); }}><span className="ico"><PeopleIcon /></span>Everyone</button>
        <span className="sep" />
        {sorted.map((p) => <button type="button" key={p.id} role="option" aria-selected={picked.includes(p.id)} className={`row-i${picked.includes(p.id) ? ' on' : ''}`}
          onClick={() => onPick(togglePicked(picked, p.id, me))}>
          <Face person={p} me={p.id === me} />{name(p)}{picked.includes(p.id) && <CheckMark />}
        </button>)}
      </div>}
    </span>}
  </div>;
}
const CheckMark = () => <svg className="th-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

/* ------------------------------------------------------------ an empty tab */
/** AN EMPTY INBOX, DRAWN AGAIN FROM THE QUESTION IT ANSWERS (2026-10-01). She
 *  asked for this page redrawn from first principles. When nothing needs you,
 *  the page has three things to say: that you are clear, whether work is
 *  moving without you, and how to start the next thing. It sits where the
 *  first row would, under the tabs, left aligned with the titles, so the page
 *  does not jump when a thread lands. The tabs stay: an empty Needs you is
 *  still the Inbox, and Running is one click away. */
export function InboxClear({ running, scheduled, onView, onCompose }: {
  running: number; scheduled: number; onView: (v: TabView) => void; onCompose: () => void;
}) {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return <div className="th-clear">
    <h2>Nothing needs you</h2>
    <p>
      {running > 0
        ? <><button type="button" className="th-clear-link" onClick={() => onView('progress')}>{plural(running, 'thread is running', 'threads are running')}</button>. Each one lands here when it needs you.</>
        : scheduled > 0
          ? <><button type="button" className="th-clear-link" onClick={() => onView('snoozed')}>{plural(scheduled, 'thread is scheduled', 'threads are scheduled')}</button>. Nothing else is open.</>
          : 'Start a thread and an agent picks it up, or message a teammate.'}
    </p>
    <div className="th-clear-acts">
      <button type="button" className="th-new" onClick={onCompose}><PenIcon />New thread</button>
      <span className="th-clear-key">or press <kbd>N</kbd></span>
    </div>
  </div>;
}

/** The other tabs, empty: one quiet line where the rows would be. */
export function EmptyTab({ view }: { view: TabView }) {
  const words: Partial<Record<TabView, string>> = {
    progress: 'Nothing is running.',
    snoozed: 'Nothing is scheduled.',
    // A finished thread waits in Needs you until its owner closes it, which a
    // persona read as the app losing it.
    done: 'Nothing closed yet. A finished thread waits in Needs you until you close it.',
    all: 'No threads yet.',
  };
  return <div className="th-empty">{words[view] ?? 'Nothing here.'}</div>;
}

/* ------------------------------------------------------------ one thread's cells */
export function TableHead({ person = false }: { person?: boolean }) {
  return <div className="row th-head"><span className="mark" aria-hidden="true" /><div className={`row-main th-grid${person ? ' with-person' : ''}`}>
    <div>Thread</div><div>Project</div>{person && <div>Person</div>}<div>Priority</div><div className="num">Updated</div>
  </div></div>;
}

/** Who a message is with, from where you sit: the other person on it. */
export function otherPerson(item: WorkItem, me: string | null): string | null {
  const people = item.people ?? [];
  return people.find((p) => p !== me) ?? (item.createdBy && item.createdBy !== me ? item.createdBy : null);
}

/** ONE ROW OF THE TABLE, FOR THE INBOX AND THE TEAM PAGE BOTH. Her words on
 *  2026-10-01: "The team page in list view should be the same component...
 *  with maybe some slight differences, such as an extra column for the
 *  person". So there is one set of cells, and the Team page only adds Person. */
export function RowCells({ live = false, title, hidden = false, lock = false, shared = false, where, person, priority, updatedAt, now, action }: {
  /** An agent is on this thread right now: a turning mark before its name. */
  live?: boolean;
  title: ReactNode; hidden?: boolean; lock?: boolean; shared?: boolean; where: ReactNode; person?: ReactNode;
  priority: number | null; updatedAt: number; now: number; action?: ReactNode;
}) {
  const id = priority === null ? null : priorityIdOf(priority);
  return <div className={`row-main th-grid${person !== undefined ? ' with-person' : ''}`}>
    <div className={`th-cell-title subject${hidden ? ' hidden' : ''}`}>{live && <StateGlyph state="running" live />}{title}{shared && <SharedMark label="Visible to the team" />}{lock && <LockMark />}</div>
    <div className="th-cell-proj">{where}</div>
    {person !== undefined && <div className="th-cell-person">{person}</div>}
    <div className={`th-cell-prio${id === 'urgent' ? ' urgent' : ''}`}>{id && <><PriorityMark id={id} />{priorityLabelOf(id)}</>}</div>
    {/* The row's one hover action, if it has one, covers the time while the
        pointer is on the row (pages.css .th-row-act). */}
    <div className={`th-cell-when num${action ? ' has-act' : ''}`}><span className="th-when">{updatedWords(updatedAt, now)}</span>{action}</div>
  </div>;
}

/** A message's line: the other person's face and name, then what was said,
 *  "You: " first when you spoke last. A group names everyone else. */
export function MessageTitle({ people, fromMe, text }: { people: string[]; fromMe: boolean; text: string }) {
  const team = useContext(TeamContext);
  const first = people.length ? team?.byId.get(people[0]) ?? null : null;
  const names = people.map((id) => (people.length > 1 ? firstName(team?.byId.get(id) ?? null) : team?.byId.get(id)?.name || firstName(team?.byId.get(id) ?? null))).join(', ');
  return <span className="th-msg">
    <Face person={first} />
    <b className="th-msg-who">{names}</b>
    <span className="th-msg-text">{fromMe ? `You: ${text}` : text}</span>
  </span>;
}

/** The cells of one row in the inbox's table: thread, project (or who a message is from), priority, updated.
 *  With a teammate on the page (w-05ff3d1438) it also carries the Person
 *  cell, and a thread of yours the team cannot see wears the lock in place of
 *  the people mark. */
export function ThreadCells({ item, product, now, person, withOthers = false }: {
  item: WorkItem; product: Product | undefined; now: number; person?: ReactNode; withOthers?: boolean;
}) {
  const liveIds = useContext(LiveContext);
  const team = useContext(TeamContext);
  // WHO SEES IT, AT A GLANCE AND ONE CLICK FROM CHANGING (2026-10-01). A
  // people mark after the title of a thread the team can see and nothing on
  // the rest, which is most of her rows, so the mark only ever means one
  // thing. Hovering the row offers Share or Unshare at its end. Her click
  // shows at once; the row catches up when the store's next snapshot does.
  const sharing = rowSharing(item, product, team ? { me: team.me, since: team.state.since ?? null } : null);
  const [chosen, setChosen] = useState<'team' | 'private' | null>(null);
  useEffect(() => { setChosen(null); }, [item.visibility]);
  const seen = sharing && (chosen ?? sharing);
  const flip = async () => {
    if (!seen) return;
    const patch = sharePatch(seen);
    setChosen(patch.visibility);
    const out = await api.threadEdit(item.product, item.id, patch);
    if (!out.ok) setChosen(null);
  };
  const action = seen ? (
    <button type="button" className="th-row-act" onClick={(e) => { e.stopPropagation(); void flip(); }}
      title={seen === 'team' ? 'Stop showing this thread to the team' : 'Show this thread to the team'}>
      <SharedMark className="th-row-act-mark" />{seen === 'team' ? 'Unshare' : 'Share'}
    </button>
  ) : undefined;
  // A CONVERSATION WITH A PERSON READS LIKE A MESSAGE (w-2ad23ca814: "at least
  // I should see her profile"): their face and name lead the row, then the
  // newest message, the way a chat list does. Every other row keeps its title.
  const said = messageLine(item, product, team?.me ?? null);
  if (said) {
    return <RowCells live={liveIds.has(item.id)} title={<MessageTitle people={said.people} fromMe={said.fromMe} text={said.text} />} where="Message" person={person}
      priority={messagePriority(item)} updatedAt={item.updatedAt} now={now} action={action} />;
  }
  // A LOCK, ONCE A TEAMMATE IS ON THE PAGE (w-05ff3d1438): then "they cannot
  // see this one" is the news, so the lock marks it and the people mark,
  // which would be on every other row, steps aside.
  // It follows her click at once, the way the Share button does.
  const lock = withOthers && seen === 'private';
  return <RowCells live={liveIds.has(item.id)} title={rowTitle(item)} shared={!withOthers && seen === 'team'} lock={lock} where={product?.name ?? ''} person={person}
    priority={item.priority ?? 0} updatedAt={item.updatedAt} now={now} action={action} />;
}

/* ------------------------------------------------------------ the board */
// THE TEAM PAGE THAT STOOD HERE IS GONE (w-05ff3d1438): its Everyone picker
// became the faces on the Inbox's tab bar, and its board is the one below.
/** THE PAGE AS A BOARD, when the Display says Board: your threads and, once
 *  you pick them, your teammates' (w-05ff3d1438). Every thread of yours is on
 *  it, the private ones included; with a teammate in view, those wear a lock
 *  and every card names its person. `end` is the faces, over the board. */
export function InboxBoard({ items, products, display, now, onOpenItem, stateOf, cards = [], picked, onOpenCard, end }: {
  items: WorkItem[]; products: Product[]; display: Display; now: number; onOpenItem: (item: WorkItem) => void;
  /** The column each thread sits in, by the Inbox tabs' rule (App.tsx). */
  stateOf?: (item: WorkItem) => ThreadStateWord | null;
  cards?: ThreadCard[]; picked?: string[]; onOpenCard?: (card: ThreadCard) => void; end?: ReactNode;
}) {
  const liveIds = useContext(LiveContext);
  const team = useContext(TeamContext);
  const me = team?.me ?? null;
  const who = picked ?? (me ? [me] : []);
  const withOthers = who.some((p) => p !== me);
  const since = team?.state.since ?? null;
  const entries = teamEntries({ items: me && !who.includes(me) ? [] : items, products, cards: cards.filter((c) => who.includes(c.personId)), me, now, since, stateOf, live: liveIds, allMine: true })
    .filter((e) => !e.item || (display.projects.length === 0 || display.projects.includes(e.item.product)))
    .filter((e) => teamKeeps(e, { person: null, projectName: null }, display, now));
  const sharing = (it: WorkItem) => rowSharing(it, products.find((p) => p.slug === it.product), team ? { me, since } : null);
  return <div className="list hm-me">
    {end && <div className="th-bar th-bar-end">{end}</div>}
    <div className="th-board">
    {BOARD_COLUMNS.map((col) => {
      const rows = entries.filter((e) => e.state === col.state);
      return <div key={col.state}>
        {/* Your own board says what the tab says: what waits on you needs you. */}
        <div className="th-col-h"><StateGlyph state={col.state} />{col.state === 'waiting' && !withOthers ? 'Needs you' : col.label}<b>{rows.length}</b></div>
        {rows.length === 0 && <div className="th-col-empty">Nothing here.</div>}
        {/* On your board alone, the people mark on what the team can see. With
            a teammate beside you, the lock on what they cannot. */}
        {rows.map((e) => <button type="button" key={e.key} className="th-card" onClick={() => (e.item ? onOpenItem(e.item) : e.card && onOpenCard?.(e.card))}>
          <div className="t">{e.message ? <MessageTitle people={e.message.people} fromMe={e.message.fromMe} text={e.title ?? ''} /> : e.title}
            {e.item && !e.message && !withOthers && sharing(e.item) === 'team' && <SharedMark label="Visible to the team" />}
            {e.item && !e.message && withOthers && sharing(e.item) === 'private' && <LockMark />}
          </div>
          <div className="m">{e.live && <StateGlyph state="running" live />}{e.priority !== null && <PriorityMark id={priorityIdOf(e.priority)} />}<span className="p">{e.project}</span>
            {withOthers && <Face person={e.ownerId ? team?.byId.get(e.ownerId) ?? null : null} me={e.ownerId === me} />}</div>
        </button>)}
      </div>;
    })}
  </div></div>;
}
