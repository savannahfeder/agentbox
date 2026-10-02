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
import { notStarted, rowTitle } from '../list-rules';
import { DONE } from '../done-word';
import {
  boardColumns, DEFAULT_COLUMN_ORDER, filteredEmptyWords, isDirect, isFiltered, moveColumn, projectChoices, updatedWords,
  type BoardEntry, type Display, type PageId, type UpdatedWindow,
} from './page-rules';
import { messageLine, messagePriority, rowSharing, sharePatch } from './page-rules';
import { togglePicked, whoseWord } from './people-rules';
import { shownToPeople } from '../../../shared/thread-cards.mjs';
import { api } from '../api';
import './pages.css';

/* ------------------------------------------------------------ icons */
const GripIcon = () => <svg className="th-col-grip" viewBox="0 0 10 16" width="8" height="13" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4" /><circle cx="7.5" cy="3" r="1.4" /><circle cx="2.5" cy="8" r="1.4" /><circle cx="7.5" cy="8" r="1.4" /><circle cx="2.5" cy="13" r="1.4" /><circle cx="7.5" cy="13" r="1.4" /></svg>;
export const PenIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 20h8" /><path d="m4 20 1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /></svg>;
const SearchGlyph = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>;
const SlidersIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
const ListIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
const BoardIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3.5" y="4" width="5" height="16" rx="1" /><rect x="10.5" y="4" width="5" height="11" rx="1" /><rect x="17.5" y="4" width="3" height="7" rx="1" /></svg>;
export const PeopleIcon = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="9" cy="9" r="3.2" /><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7" /></svg>;
export const LockMark = () => <svg className="th-lock" width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-label="Private"><rect x="1.5" y="5.5" width="8" height="6" rx="1" /><path d="M3.5 5.5V3.8a2 2 0 0 1 4 0v1.7" /></svg>;
/** Two people: others can see this thread. After the title of a row only a
 *  few chosen people see (the whole team, the default, carries no mark),
 *  inside the Share button, and beside "Team" in the summary.
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
export function HeaderActions({ page, display, onDisplay, products, items, onSearch, onCompose, shown, total }: {
  page: PageId; display: Display; onDisplay: (d: Display) => void; products: Product[]; items?: WorkItem[];
  onSearch: () => void; onCompose: () => void; shown?: number; total?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  // NO "/" ON ITS FACE (w-facfc092e1): a shortcut shows on hover, through the
  // hint plate, and is never printed on the control.
  return <div className="th-right">
    <button type="button" className="th-search" data-hint="search" data-hint-text="span" onClick={onSearch} title="Search threads (/)" aria-label="Search threads"><SearchGlyph /><span>Search</span></button>
    <button type="button" className="th-new" data-hint="new-task" onClick={onCompose} title="New thread (N)"><PenIcon />New thread</button>
    <span ref={(el) => { ref.current = el; }} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className={`th-disp${open ? ' open' : ''}`} aria-label="View and filters" title="View and filters" onClick={() => setOpen((o) => !o)}>
        <SlidersIcon />{isFiltered(display) && <i />}
      </button>
      {open && <DisplayMenu page={page} display={display} onDisplay={onDisplay} products={products} items={items} shown={shown} total={total} />}
    </span>
  </div>;
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** View, sort, and the filters: priority, project and when it was updated. */
export function DisplayMenu({ page, display, onDisplay, products, items = [], shown, total }: {
  page: PageId; display: Display; onDisplay: (d: Display) => void; products: Product[];
  /** Her threads, to rank the projects by the one she used most recently. */
  items?: WorkItem[];
  shown?: number; total?: number;
}) {
  // THE PROJECT FILTER, FOR SOMEBODY WITH FORTY PROJECTS (w-5a08121f99). The
  // eight she used most recently, the rest behind one button, and an All
  // projects chip so that "nothing picked means everything" is on the screen
  // rather than discovered by clicking a chip and watching the list grow.
  const [showAll, setShowAll] = useState(false);
  const { shown: topProjects, rest: moreProjects } = projectChoices(products, items, { picked: display.projects });
  const projects = showAll ? [...topProjects, ...moreProjects] : topProjects;
  const set = (patch: Partial<Display>) => onDisplay({ ...display, ...patch });
  const windows: [UpdatedWindow, string][] = [['today', 'Today'], ['week', 'This week'], ['any', 'Any time']];
  return <div className="th-pop" role="dialog" aria-label={page === 'inbox' ? 'Inbox view and filters' : 'Team view and filters'}>
    <div className="line"><span className="lab">View</span><span className="opts">
      <button type="button" className={display.view === 'list' ? 'on' : ''} title="List (V)" onClick={() => set({ view: 'list' })}><ListIcon />List</button>
      <button type="button" className={display.view === 'board' ? 'on' : ''} title="Board (V)" onClick={() => set({ view: 'board' })}><BoardIcon />Board</button>
    </span></div>
    <div className="line"><span className="lab">Sort by</span><span className="opts">
      <button type="button" className={display.sort === 'priority' ? 'on' : ''} onClick={() => set({ sort: 'priority' })}>Priority</button>
      <button type="button" className={display.sort === 'updated' ? 'on' : ''} onClick={() => set({ sort: 'updated' })}>Updated</button>
    </span></div>
    <div className="rule" />
    <div className="line"><span className="lab">Priority</span><span className="opts">
      {PRIORITIES.map((p) => <button type="button" key={p.id} className={display.priorities.includes(p.id) ? 'on' : ''} onClick={() => set({ priorities: toggle(display.priorities, p.id) })}><PriorityMark id={p.id} />{p.label}</button>)}
    </span></div>
    {page === 'inbox' && topProjects.length + moreProjects.length > 1 && <div className="line"><span className="lab">Project</span><span className="opts">
      <button type="button" className={display.projects.length === 0 ? 'on' : ''} onClick={() => set({ projects: [] })}>All projects</button>
      {projects.map((p) => <button type="button" key={p.slug} className={display.projects.includes(p.slug) ? 'on' : ''} onClick={() => set({ projects: toggle(display.projects, p.slug) })}>{p.name}</button>)}
      {moreProjects.length > 0 && <button type="button" className="th-pop-more" onClick={() => setShowAll(!showAll)}>
        {showAll ? 'Show fewer' : `Show all ${topProjects.length + moreProjects.length}`}
      </button>}
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
  // LATER, NOT SCHEDULED (w-afb66e6661, 2026-10-02). The tab holds two kinds of
  // thread that are not running: the ones with a moment to come back at, and
  // the ones added to Later with no moment at all, which carry a NOT STARTED
  // tag on their row. "Scheduled" was a promise of a time that half of them
  // do not have.
  { view: 'snoozed', label: 'Later' },
  { view: 'done', label: DONE.short },
  { view: 'all', label: 'All' },
];

/**
 * A TAB CARRIES A NUMBER ONLY WHERE THE NUMBER CHANGES WHAT YOU DO (w-57034cf3c0).
 * The strip read DONE 1036 on a real inbox: the archive counting itself, the
 * same four digits every day, and the widest thing on the row. All is the other
 * three added up. Both are words now, and the three tabs that are still ahead of
 * you keep their number while there is something in them. A zero is not drawn
 * either: an empty tab says so by being empty.
 */
const COUNTED: TabView[] = ['inbox', 'progress', 'snoozed'];

/** `needs` renames the first tab (Waiting, once a teammate is on the page);
 *  `end` is what sits at the bar's right end, the people filter. */
export function StateTabs({ view, counts, onView, needs, end }: {
  view: TabView; counts: Partial<Record<TabView, number>>; onView: (v: TabView) => void; needs?: string; end?: ReactNode;
}) {
  return <div className="th-bar"><div className="tm-tabs">
    {INBOX_TABS.map((t) => <button type="button" key={t.view} className={`tm-tab${view === t.view ? ' on' : ''}`} onClick={() => onView(t.view)}>{t.view === 'inbox' && needs ? needs : t.label}{COUNTED.includes(t.view) && !!counts[t.view] && <b>{counts[t.view]}</b>}</button>)}
  </div>{end}</div>;
}

/* ------------------------------------------------------------ whose threads */
/**
 * ONE FILTER AT THE END OF THE TAB BAR (w-57034cf3c0). Up to four face chips
 * and a "+N" stood here and read as clutter on the one row that has to stay
 * quiet. This says whose threads the page is showing in words, and opens the
 * same list: Just you, Everyone, then each person with a tick. Nothing is drawn
 * for a person alone on a team, or for nobody signed in.
 */
export function PeopleFilter({ everyone, picked, me, onPick }: {
  everyone: Person[]; picked: string[]; me: string | null; onPick: (picked: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  if (everyone.filter((p) => p.id !== me).length === 0) return null;
  const name = (p: Person) => (p.id === me ? 'You' : p.name || p.email || 'Someone');
  const sorted = [...everyone.filter((p) => p.id === me), ...everyone.filter((p) => p.id !== me).sort((a, b) => name(a).localeCompare(name(b)))];
  return <span className="th-pf-wrap" ref={(el) => { ref.current = el; }}>
    <button type="button" className={`th-pf${open ? ' open' : ''}`} aria-haspopup="listbox" aria-expanded={open}
      title="Whose threads are shown" onClick={() => setOpen(!open)}>
      <PeopleIcon /><span className="w">{whoseWord(everyone, picked, me)}</span>
      <svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m1 1.5 3.5 3L8 1.5" /></svg>
    </button>
    {open && <div className="th-menu th-people-menu" role="listbox" aria-multiselectable="true">
      <button type="button" className="row-i" onClick={() => { onPick(me ? [me] : picked); setOpen(false); }}><span className="ico"><PeopleIcon /></span>Just you</button>
      <button type="button" className="row-i" onClick={() => { onPick(sorted.map((p) => p.id)); setOpen(false); }}><span className="ico"><PeopleIcon /></span>Everyone</button>
      <span className="sep" />
      {sorted.map((p) => <button type="button" key={p.id} role="option" aria-selected={picked.includes(p.id)} className={`row-i${picked.includes(p.id) ? ' on' : ''}`}
        onClick={() => onPick(togglePicked(picked, p.id, me))}>
        <Face person={p} me={p.id === me} />{name(p)}{picked.includes(p.id) && <CheckMark />}
      </button>)}
    </div>}
  </span>;
}
const CheckMark = () => <svg className="th-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

/* ------------------------------------------------------------ an empty tab */
/** AN EMPTY INBOX, DRAWN AGAIN FROM THE QUESTION IT ANSWERS (2026-10-01),
 *  from first principles. When nothing needs you,
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

/**
 * A TAB THAT IS ONLY EMPTY BECAUSE OF A FILTER (w-5a08121f99).
 *
 * "Nothing needs you" was drawn over a tab still reading 13, because a filter
 * had emptied the page. Somebody who has forgotten a filter is on reads that as
 * an empty inbox when there is a pile of work behind it. Three filters live
 * behind one icon, they are remembered
 * between launches, and the page was reporting their work as her own inbox
 * being clear.
 *
 * So: the whole number that is hidden, and the one button that undoes it. It
 * sits where InboxClear sits, in the first row's place, so the page does not
 * jump when the filter comes off and the rows arrive.
 */
export function FilteredEmpty({ view, hidden, onClear }: { view: TabView; hidden: number; onClear: () => void }) {
  const { head, line } = filteredEmptyWords(view, hidden);
  return <div className="th-clear th-clear-filtered">
    <ClearMark />
    <h2>{head}</h2>
    <p>{line}</p>
    <div className="th-clear-acts">
      <button type="button" className="th-new" onClick={onClear}>Clear filters</button>
    </div>
  </div>;
}

/** THE ONE QUIET REWARD ON THIS PAGE. Her words: it "shouldn't be visually
 *  super stimulating, but it could be nicer than this". So: a small tick, the
 *  accent at half strength, one line of space above the heading. It says this
 *  view is clear, which is true whether you cleared it or never filled it. */
const ClearMark = () => <svg className="th-clear-mark" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5" /></svg>;

/** The other tabs, empty: one quiet line where the rows would be. */
export function EmptyTab({ view }: { view: TabView }) {
  const words: Partial<Record<TabView, string>> = {
    progress: 'Nothing is running.',
    snoozed: 'Nothing is waiting for later. "Add it to Later" on a new thread writes one down without starting it.',
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

/** ONE ROW OF THE TABLE, FOR THE INBOX AND THE TEAM PAGE BOTH (2026-10-01).
 *  The Team page's list view is the same component as the Inbox's, with small
 *  differences only. So there is one set of cells, and the Team page only adds Person. */
export function RowCells({ live = false, title, hidden = false, lock = false, shared = false, chosen = 0, held = false, where, person, priority, updatedAt, now, action }: {
  /** An agent is on this thread right now: a turning mark before its name. */
  live?: boolean;
  title: ReactNode; hidden?: boolean; lock?: boolean; shared?: boolean; where: ReactNode; person?: ReactNode;
  /** How many people a thread shared with chosen people reaches; 0 for the team. */
  chosen?: number;
  /** Added to Later and not started: the row says so in a tag (w-afb66e6661). */
  held?: boolean;
  priority: number | null; updatedAt: number; now: number; action?: ReactNode;
}) {
  const id = priority === null ? null : priorityIdOf(priority);
  return <div className={`row-main th-grid${person !== undefined ? ' with-person' : ''}`}>
    {/* THE MARK SAYS WHICH KIND OF SHARED, QUIETLY (w-41ff964775): the two
        people with a small count beside them for a thread only a few people
        see. The whole team, the default, carries nothing (2026-10-02). */}
    <div className={`th-cell-title subject${hidden ? ' hidden' : ''}`}>{live && <StateGlyph state="running" live />}{title}{shared && <SharedMark label={chosen ? `Visible to ${chosen} ${chosen === 1 ? 'person' : 'people'}` : 'Visible to the team'} />}{chosen > 0 && <span className="th-shared-n" aria-hidden="true">{chosen}</span>}{lock && <LockMark />}{held && <span className="th-tag">Not started</span>}</div>
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
 *  cell. Who can see the thread is said by one mark after its title, the lock
 *  or the people, and never by who else is on the page. */
export function ThreadCells({ item, product, now, person }: {
  item: WorkItem; product: Product | undefined; now: number; person?: ReactNode;
}) {
  const liveIds = useContext(LiveContext);
  const team = useContext(TeamContext);
  // WHO SEES IT, AT A GLANCE AND ONE CLICK FROM CHANGING (2026-10-01). One
  // mark after the title, always: the people on a thread the team or chosen
  // people can see, the lock on one only you can see. A thread shared with
  // chosen people (w-41ff964775) carries the same people mark and a count
  // beside it says how few. Hovering the row offers Share or Unshare at its
  // end. The click shows at once; the row catches up when the store's next
  // snapshot does.
  const sharing = rowSharing(item, product, team ? { me: team.me, since: team.state.since ?? null } : null);
  const [flipped, setFlipped] = useState<'team' | 'private' | null>(null);
  useEffect(() => { setFlipped(null); }, [item.visibility, item.visibleTo]);
  const seen = sharing && (flipped ?? sharing);
  const chosen = seen === 'people' ? shownToPeople(item).length : 0;
  const flip = async () => {
    if (!seen) return;
    const patch = sharePatch(seen);
    setFlipped(patch.visibility);
    const out = await api.threadEdit(item.product, item.id, patch);
    if (!out.ok) setFlipped(null);
  };
  const action = seen ? (
    <button type="button" className="th-row-act" onClick={(e) => { e.stopPropagation(); void flip(); }}
      title={seen === 'private' ? 'Show this thread to the team' : 'Stop showing this thread'}>
      <SharedMark className="th-row-act-mark" />{seen === 'private' ? 'Share' : 'Unshare'}
    </button>
  ) : undefined;
  // A CONVERSATION WITH A PERSON READS LIKE A MESSAGE, showing who it is
  // with: their face and name lead the row, then the
  // newest message, the way a chat list does. Every other row keeps its title.
  const said = messageLine(item, product, team?.me ?? null);
  if (said) {
    return <RowCells live={liveIds.has(item.id)} title={<MessageTitle people={said.people} fromMe={said.fromMe} text={said.text} />} where="Message" person={person}
      priority={messagePriority(item)} updatedAt={item.updatedAt} now={now} action={action} />;
  }
  // ONLY THE UNUSUAL CASE WEARS A MARK (2026-10-02). Shared with the team is
  // the default, so it carries nothing; the lock is on a thread only you can
  // see, and the people mark with its count on one a few chosen people see.
  // Neither depends on whose faces are lit at the top of the page: a mark that
  // comes and goes with an unrelated control cannot be read. Both follow the
  // click at once, the way the Share button does.
  const lock = seen === 'private';
  return <RowCells live={liveIds.has(item.id)} title={rowTitle(item)} shared={seen === 'people'} chosen={chosen} lock={lock} held={notStarted(item)} where={product?.name ?? ''} person={person}
    priority={item.priority ?? 0} updatedAt={item.updatedAt} now={now} action={action} />;
}

/* ------------------------------------------------------------ the board */
// THE TEAM PAGE THAT STOOD HERE IS GONE (w-05ff3d1438): its Everyone picker
// became the faces on the Inbox's tab bar, and its board is the one below.
/** THE PAGE AS A BOARD, when the Display says Board: your threads and, once
 *  you pick them, your teammates' (w-05ff3d1438). Every thread of yours is on
 *  it, the private ones included; with a teammate in view, those wear a lock
 *  and every card names its person. `end` is the faces, over the board. */
export function InboxBoard({ items, products, display, now, onOpenItem, stateOf, cards = [], picked, onOpenCard, end, selected, columnOrder = DEFAULT_COLUMN_ORDER, onReorderColumns }: {
  items: WorkItem[]; products: Product[]; display: Display; now: number; onOpenItem: (item: WorkItem) => void;
  /** The column each thread sits in, by the Inbox tabs' rule (App.tsx). */
  stateOf?: (item: WorkItem) => ThreadStateWord | null;
  cards?: ThreadCard[]; picked?: string[]; onOpenCard?: (card: ThreadCard) => void; end?: ReactNode;
  /** The thread the keyboard is on (App.tsx's `current`), drawn as selected. */
  selected?: WorkItem | null;
  /** The columns left to right, and where a dragged order goes to be kept. */
  columnOrder?: ThreadStateWord[]; onReorderColumns?: (order: ThreadStateWord[]) => void;
}) {
  const liveIds = useContext(LiveContext);
  const team = useContext(TeamContext);
  const me = team?.me ?? null;
  const who = picked ?? (me ? [me] : []);
  const withOthers = who.some((p) => p !== me);
  const since = team?.state.since ?? null;
  // A COLUMN BEING DRAGGED MOVES AS YOU DRAG IT (w-23fc91bff5): the others
  // make room under the pointer, and letting go keeps that order. Let go
  // anywhere else and the board goes back the way it was.
  const [dragging, setDragging] = useState<ThreadStateWord | null>(null);
  const [preview, setPreview] = useState<ThreadStateWord[] | null>(null);
  const shown = preview ?? columnOrder;
  // One copy of what the board holds and in what order, which App.tsx also
  // walks with J and K (`boardColumns`, page-rules.ts).
  const columns = boardColumns({ items, products, display, now, stateOf, cards, picked, me, since, live: liveIds, order: shown });
  const sharing = (it: WorkItem) => rowSharing(it, products.find((p) => p.slug === it.product), team ? { me, since } : null);
  const isSelected = (it: WorkItem | null) => !!it && !!selected && it.id === selected.id && it.product === selected.product;
  // The keyboard's card stays on the screen as J, K and the arrows move it,
  // and only when it moves, so a refresh never scrolls the board out from
  // under the pointer.
  const boardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boardRef.current?.querySelector('.th-card.selected')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selected?.id, selected?.product]);
  const endDrag = () => { setDragging(null); setPreview(null); };
  return <div className="list hm-me">
    {end && <div className="th-bar th-bar-end">{end}</div>}
    <div className={`th-board${dragging ? ' dragging' : ''}`} ref={boardRef}>
    {columns.map((col) => {
      const rows = col.rows;
      return <div key={col.state} className={`th-col${dragging === col.state ? ' lifted' : ''}`}
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (col.state !== dragging) setPreview(moveColumn(shown, dragging, col.state));
        }}
        onDrop={(e) => { if (!dragging) return; e.preventDefault(); onReorderColumns?.(shown); endDrag(); }}>
        {/* Your own board says what the tab says: what waits on you needs you.
            The heading is the handle: grab it to move the whole column. */}
        <div className="th-col-h" draggable={!!onReorderColumns} title={onReorderColumns ? 'Drag to move this column' : undefined}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-agentbox-column', col.state);
            const column = e.currentTarget.parentElement;
            if (column) e.dataTransfer.setDragImage(column, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
            setDragging(col.state);
          }}
          onDragEnd={endDrag}><StateGlyph state={col.state} />{col.state === 'waiting' && !withOthers ? 'Needs you' : col.label}<b>{rows.length}</b>
          {/* THE HANDLE COMES UP WHEN YOU ARE OVER THE COLUMN: "a little drag
              icon comes up subtly". Only where a drag does something. */}
          {onReorderColumns && <GripIcon />}</div>
        {rows.length === 0 && <div className="th-col-empty">Nothing here.</div>}
        {/* A card says who can see it the way a row does: the lock on what
            only you can see, the people mark on what a few chosen people
            can, and nothing on what the whole team can, the default. */}
        {rows.map((e) => <button type="button" key={e.key} className={`th-card${isSelected(e.item) ? ' selected' : ''}`} onClick={() => (e.item ? onOpenItem(e.item) : e.card && onOpenCard?.(e.card))}>
          <div className="t">{e.message ? <MessageTitle people={e.message.people} fromMe={e.message.fromMe} text={e.title ?? ''} /> : e.title}
            {e.item && !e.message && sharing(e.item) === 'people' && <SharedMark label="Visible to the people on it" />}
            {e.item && !e.message && sharing(e.item) === 'private' && <LockMark />}
          </div>
          <div className="m">{e.live && <StateGlyph state="running" live />}{e.priority !== null && <PriorityMark id={priorityIdOf(e.priority)} />}<span className="p">{e.project}</span>
            {withOthers && <Face person={e.ownerId ? team?.byId.get(e.ownerId) ?? null : null} me={e.ownerId === me} />}</div>
        </button>)}
      </div>;
    })}
  </div></div>;
}
