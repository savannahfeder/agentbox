// THE INBOX AND TEAM PAGES' PIECES (approved 2026-10-01, w-e731ca9376).
//
// The header's right end (Search, New thread, Display), the state tabs, the
// cells of a thread row in the inbox's table, and the Team page with its
// Everyone and project pickers over a board or a list. The rules they follow
// are in ./page-rules.ts; the look is ./pages.css, ported from the drawings
// she approved.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Person, Product, ThreadCard, ThreadStateWord, View, WorkItem } from '../types';
import { priorityIdOf, priorityLabelOf, PRIORITIES, type PriorityId } from '../priority';
import { Face, TeamContext, firstName } from '../team/people';
import { PriorityIcon } from '../components/Priority';
import { notStarted, rowTitle } from '../list-rules';
import { DONE } from '../done-word';
import {
  boardColumns, columnTo, DEFAULT_COLUMN_ORDER, filteredEmptyWords, finishedAt, isDirect, isFiltered, nextPrivacy, projectChoices, slotUnder,
  timeHeading, updatedWords,
  type BoardEntry, type Display, type PageId, type Privacy, type UpdatedWindow,
} from './page-rules';
import { messageLine, messagePriority, rowSharing, sharePatch } from './page-rules';
import { facesOnButton, peopleWorthADot, togglePicked, whoseWord } from './people-rules';
import { shownToPeople } from '../../../shared/thread-cards.mjs';
import { api } from '../api';
import './pages.css';

// Before the frame is drawn in the app; a plain effect where there is no
// window (the tests draw the board to a string, and React warns otherwise).
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const SETTLE = { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' };

/* ------------------------------------------------------------ icons */
const GripIcon = () => <svg className="th-col-grip" viewBox="0 0 10 16" width="8" height="13" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4" /><circle cx="7.5" cy="3" r="1.4" /><circle cx="2.5" cy="8" r="1.4" /><circle cx="7.5" cy="8" r="1.4" /><circle cx="2.5" cy="13" r="1.4" /><circle cx="7.5" cy="13" r="1.4" /></svg>;
export const PenIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 20h8" /><path d="m4 20 1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /></svg>;
const SearchGlyph = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>;
const SlidersIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
const ListIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
const BoardIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3.5" y="4" width="5" height="16" rx="1" /><rect x="10.5" y="4" width="5" height="11" rx="1" /><rect x="17.5" y="4" width="3" height="7" rx="1" /></svg>;
export const PeopleIcon = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="9" cy="9" r="3.2" /><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7" /></svg>;
export const LockMark = () => <svg className="th-lock" width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-label="Private"><rect x="1.5" y="5.5" width="8" height="6" rx="1" /><path d="M3.5 5.5V3.8a2 2 0 0 1 4 0v1.7" /></svg>;
/** A title with a mark after it, where the mark never wraps onto a line by
 *  itself: "the icon flows over but the text doesn't" (w-49cace6736). A line
 *  may break right before an inline picture, so the last word and the mark sit
 *  in one span that does not break, and move down together. A last word longer
 *  than KEEP_WHOLE keeps only its last letters with the mark; the card lets the
 *  rest break anywhere, so a long link never pushes the card wider. */
const KEEP_WHOLE = 16;
export function TitleThenMark({ title, mark }: { title: string; mark: ReactNode }) {
  if (!mark) return <>{title}</>;
  const text = title.trimEnd();
  const lastWord = Math.max(0, text.search(/\S+$/));
  const cut = text.length - lastWord > KEEP_WHOLE ? text.length - 3 : lastWord;
  return <>{text.slice(0, cut)}<span className="th-keep">{text.slice(cut)}{mark}</span></>;
}
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
/** Whose threads are on the page, and how to change it (App.tsx holds it). */
export type PeoplePick = { everyone: Person[]; picked: string[]; me: string | null; onPick: (picked: string[]) => void };

/** Search, New thread and the Display icon, at the right of the Inbox and Team headers. */
export function HeaderActions({ page, display, onDisplay, products, items, onSearch, onCompose, shown, total, tab, people }: {
  page: PageId; display: Display; onDisplay: (d: Display) => void; products: Product[]; items?: WorkItem[];
  onSearch: () => void; onCompose: () => void; shown?: number; total?: number; tab?: string;
  people?: PeoplePick;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  // WHOSE THREADS, AS FACES ON THIS BUTTON (w-14bb56c833). The Everyone control
  // had a row of its own over the board, 40px of nothing but one small button.
  // Its faces sit here now and its choice is the first line of the menu.
  const worn = people ? facesOnButton(people.everyone, people.picked, people.me) : null;
  const whose = worn && people ? whoseWord(people.everyone, people.picked, people.me) : null;
  // Just you, on a team, lights no dot at all, whatever its own remembered
  // filters say: it is the everyday state (asked for 2026-10-04).
  const justYou = !!worn && !!people?.me && people.picked.length === 1 && people.picked[0] === people.me;
  const dot = !justYou && (isFiltered(display) || (!!people && peopleWorthADot(people.everyone, people.picked, people.me)));
  // NO "/" ON ITS FACE (w-facfc092e1): a shortcut shows on hover, through the
  // hint plate, and is never printed on the control.
  return <div className="th-right">
    <button type="button" className="th-search" data-hint="search" data-hint-text="span" onClick={onSearch} title="Search threads (/)" aria-label="Search threads"><SearchGlyph /><span>Search</span></button>
    <button type="button" className="th-new" data-hint="new-task" onClick={onCompose} title="New thread (N)"><PenIcon />New thread</button>
    <span ref={(el) => { ref.current = el; }} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className={`th-disp${worn ? ' faces' : ''}${open ? ' open' : ''}`}
        aria-label={whose ? `View and filters, showing ${whose}` : 'View and filters'} title={whose ? `${whose} · View and filters` : 'View and filters'}
        onClick={() => setOpen((o) => !o)}>
        {worn && <span className="th-faces">
          {worn.faces.map((p) => <Face key={p.id} person={p} me={p.id === people!.me} />)}
          {worn.more > 0 && <span className="th-faces-more">+{worn.more}</span>}
        </span>}
        <SlidersIcon />{dot && <i />}
      </button>
      {open && <DisplayMenu page={page} display={display} onDisplay={onDisplay} products={products} items={items} shown={shown} total={total} tab={tab} people={people} />}
    </span>
  </div>;
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** View, sort, and the filters: priority, project and when it was updated. */
export function DisplayMenu({ page, display, onDisplay, products, items = [], shown, total, tab, people }: {
  page: PageId; display: Display; onDisplay: (d: Display) => void; products: Product[];
  /** The tab the page is on, which Done's own order depends on. */
  tab?: string;
  /** Her threads, to rank the projects by the one she used most recently. */
  items?: WorkItem[];
  shown?: number; total?: number;
  /** Whose threads are on the page; no People line without a teammate. */
  people?: PeoplePick;
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
  const privacies: [Exclude<Privacy, 'any'>, string][] = [['private', 'Private'], ['shared', 'Shared']];
  const privacy = display.privacy ?? 'any';
  return <div className="th-pop" role="dialog" aria-label={page === 'inbox' ? 'Inbox view and filters' : 'Team view and filters'}>
    {people && <PeopleLine {...people} />}
    <div className="line"><span className="lab">View</span><span className="opts">
      <button type="button" className={display.view === 'list' ? 'on' : ''} title="List (B)" onClick={() => set({ view: 'list' })}><ListIcon />List</button>
      <button type="button" className={display.view === 'board' ? 'on' : ''} title="Board (B)" onClick={() => set({ view: 'board' })}><BoardIcon />Board</button>
    </span></div>
    <div className="line"><span className="lab">Sort by</span><span className="opts">
      <button type="button" className={display.sort === 'priority' ? 'on' : ''} onClick={() => set({ sort: 'priority' })}>Priority</button>
      <button type="button" className={display.sort === 'updated' ? 'on' : ''} onClick={() => set({ sort: 'updated' })}>Updated</button>
      {/* Done ignores this, on purpose (w-c61f5bf497), and says so where the
          choice is made rather than leaving the list to look broken. */}
      {tab === 'done' && <span className="th-pop-note">Done runs newest first</span>}
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
    {/* PRIVACY: PRIVATE | SHARED (w-f6ea56b89a), in the words asked for;
        Shared is for when somebody is looking at your screen. Picked and let
        go like Priority. All / Hide private / Only private and then Show /
        Hide were both sent back as confusing. Only on a team, where a thread
        can be private at all; `people` is there exactly when you are on one. */}
    {people && <div className="line"><span className="lab">Privacy</span><span className="opts">
      {privacies.map(([p, label]) => <button type="button" key={p} className={privacy === p ? 'on' : ''} onClick={() => set({ privacy: nextPrivacy(privacy, p) })}>{label}</button>)}
    </span></div>}
    <div className="line"><span className="lab">Updated</span><span className="opts">
      {windows.map(([w, label]) => <button type="button" key={w} className={display.updated === w ? 'on' : ''} onClick={() => set({ updated: w })}>{label}</button>)}
    </span></div>
    <div className="rule" />
    <div className="foot"><span>{shown !== undefined && total !== undefined ? `Showing ${shown} of ${total}` : ''}</span>
      {isFiltered(display) && <button type="button" onClick={() => set({ priorities: [], projects: [], updated: 'any', privacy: 'any' })}>Clear filters</button>}
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

/** `needs` renames the first tab (Waiting, once a teammate is on the page). */
export function StateTabs({ view, counts, onView, needs }: {
  view: TabView; counts: Partial<Record<TabView, number>>; onView: (v: TabView) => void; needs?: string;
}) {
  return <div className="th-bar"><div className="tm-tabs">
    {/* Every tab wears the Tab plate (hint-plate.ts, 'state-tab'). */}
    {INBOX_TABS.map((t) => <button type="button" key={t.view} data-hint="state-tab" className={`tm-tab${view === t.view ? ' on' : ''}`} onClick={() => onView(t.view)}>{t.view === 'inbox' && needs ? needs : t.label}{COUNTED.includes(t.view) && !!counts[t.view] && <b>{counts[t.view]}</b>}</button>)}
  </div></div>;
}

/* ------------------------------------------------------------ whose threads */
/**
 * WHOSE THREADS, THE FIRST LINE OF THE VIEW AND FILTERS MENU (w-14bb56c833).
 * It was a dropdown of its own, at the end of the tab bar and in a row of its
 * own over the board; the button that opens this menu wears the faces now.
 * Everyone, Just you, then each person as a switch; the last one picked stays
 * picked, so the page is never nobody's. Nothing for a person alone on a team.
 */
function PeopleLine({ everyone, picked, me, onPick }: PeoplePick) {
  if (!everyone.some((p) => p.id !== me)) return null;
  const name = (p: Person) => (p.id === me ? 'You' : p.name || p.email || 'Someone');
  const sorted = [...everyone.filter((p) => p.id === me), ...everyone.filter((p) => p.id !== me).sort((a, b) => name(a).localeCompare(name(b)))];
  const all = sorted.every((p) => picked.includes(p.id));
  const justYou = !!me && picked.length === 1 && picked[0] === me;
  return <>
    <div className="line"><span className="lab">People</span><span className="opts">
      <button type="button" className={all ? 'on' : ''} onClick={() => onPick(sorted.map((p) => p.id))}>Everyone</button>
      {me && <button type="button" className={justYou ? 'on' : ''} onClick={() => onPick([me])}>Just you</button>}
      {sorted.map((p) => <button type="button" key={p.id} aria-pressed={picked.includes(p.id)} className={picked.includes(p.id) ? 'on' : ''}
        onClick={() => onPick(togglePicked(picked, p.id, me))}>
        <Face person={p} me={p.id === me} />{name(p)}
      </button>)}
    </span></div>
    <div className="rule" />
  </>;
}

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
export function TableHead({ person = false, tab }: { person?: boolean; tab?: string }) {
  return <div className="row th-head"><span className="mark" aria-hidden="true" /><div className={`row-main th-grid${person ? ' with-person' : ''}`}>
    <div>Thread</div><div>Project</div>{person && <div>Person</div>}<div>Priority</div><div className="num">{timeHeading(tab)}</div>
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
/** A repeating task's mark, before its title where the live mark would sit (w-4189a5c1a0). */
export const RepeatMark = () => <svg className="th-repeat" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-label="Repeats">
  <path d="M13 6.5A5.5 5.5 0 0 0 3.2 4.8M3 2.5v2.6h2.6" /><path d="M3 9.5a5.5 5.5 0 0 0 9.8 1.7M13 13.5v-2.6h-2.6" />
</svg>;

export function RowCells({ live = false, lead, title, hidden = false, lock = false, shared = false, chosen = 0, held = false, aside, where, person, priority, updatedAt, when, now, action }: {
  /** An agent is on this thread right now: a turning mark before its name. */
  live?: boolean;
  title: ReactNode; hidden?: boolean; lock?: boolean; shared?: boolean; where: ReactNode; person?: ReactNode;
  /** How many people a thread shared with chosen people reaches; 0 for the team. */
  chosen?: number;
  /** Added to Later and not started: the row says so in a tag (w-afb66e6661). */
  held?: boolean;
  /** A mark before the title when nothing is live: a repeating task's RepeatMark. */
  lead?: ReactNode;
  /** Faint words after the title: a repeating task's schedule. */
  aside?: string;
  priority: number | null; updatedAt: number; now: number; action?: ReactNode;
  /** Words for the time cell instead of how long ago: a repeating task's next run. */
  when?: string;
}) {
  const id = priority === null ? null : priorityIdOf(priority);
  return <div className={`row-main th-grid${person !== undefined ? ' with-person' : ''}`}>
    {/* THE MARK SAYS WHICH KIND OF SHARED, QUIETLY (w-41ff964775): the two
        people with a small count beside them for a thread only a few people
        see. The whole team, the default, carries nothing (2026-10-02). */}
    <div className={`th-cell-title subject${hidden ? ' hidden' : ''}`}>{live ? <StateGlyph state="running" live /> : lead}{title}{aside && <span className="th-aside">{aside}</span>}{shared && <SharedMark label={chosen ? `Visible to ${chosen} ${chosen === 1 ? 'person' : 'people'}` : 'Visible to the team'} />}{chosen > 0 && <span className="th-shared-n" aria-hidden="true">{chosen}</span>}{lock && <LockMark />}{held && <span className="th-tag">Not started</span>}</div>
    <div className="th-cell-proj">{where}</div>
    {person !== undefined && <div className="th-cell-person">{person}</div>}
    <div className={`th-cell-prio${id === 'urgent' ? ' urgent' : ''}`}>{id && <><PriorityMark id={id} />{priorityLabelOf(id)}</>}</div>
    {/* The row's one hover action, if it has one, covers the time while the
        pointer is on the row (pages.css .th-row-act). */}
    <div className={`th-cell-when num${action ? ' has-act' : ''}`}><span className="th-when">{when ?? updatedWords(updatedAt, now)}</span>{action}</div>
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
export function ThreadCells({ item, product, now, person, tab }: {
  item: WorkItem; product: Product | undefined; now: number; person?: ReactNode;
  /** On Done the time is when the thread was finished, which is its order. */
  tab?: string;
}) {
  const when = tab === 'done' ? finishedAt(item) : item.updatedAt;
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
  const chosen = seen === 'people' ? shownToPeople(item, product).length : 0;
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
      priority={messagePriority(item)} updatedAt={when} now={now} action={action} />;
  }
  // ONLY THE UNUSUAL CASE WEARS A MARK (2026-10-02). Shared with the team is
  // the default, so it carries nothing; the lock is on a thread only you can
  // see, and the people mark with its count on one a few chosen people see.
  // Neither depends on whose faces are lit at the top of the page: a mark that
  // comes and goes with an unrelated control cannot be read. Both follow the
  // click at once, the way the Share button does.
  const lock = seen === 'private';
  return <RowCells live={liveIds.has(item.id)} title={rowTitle(item)} shared={seen === 'people'} chosen={chosen} lock={lock} held={notStarted(item)} where={product?.name ?? ''} person={person}
    priority={item.priority ?? 0} updatedAt={when} now={now} action={action} />;
}

/* ------------------------------------------------------------ the board */
// THE TEAM PAGE THAT STOOD HERE IS GONE (w-05ff3d1438): its Everyone picker
// became the faces on the Inbox's tab bar, and its board is the one below.
/** THE PAGE AS A BOARD, when the Display says Board: your threads and, once
 *  you pick them, your teammates' (w-05ff3d1438). Every thread of yours is on
 *  it, the private ones included; with a teammate in view, those wear a lock
 *  and every card names its person. Whose threads is picked on the header's
 *  filters button (w-14bb56c833), so the columns start right under it. */
export function InboxBoard({ items, products, display, now, onOpenItem, stateOf, cards = [], picked, onOpenCard, selected, columnOrder = DEFAULT_COLUMN_ORDER, onReorderColumns, projectOrder }: {
  items: WorkItem[]; products: Product[]; display: Display; now: number; onOpenItem: (item: WorkItem) => void;
  /** The column each thread sits in, by the Inbox tabs' rule (App.tsx). */
  stateOf?: (item: WorkItem) => ThreadStateWord | null;
  cards?: ThreadCard[]; picked?: string[]; onOpenCard?: (card: ThreadCard) => void;
  /** The thread the keyboard is on (App.tsx's `current`), drawn as selected. */
  selected?: WorkItem | null;
  /** The columns left to right, and where a dragged order goes to be kept. */
  columnOrder?: ThreadStateWord[]; onReorderColumns?: (order: ThreadStateWord[]) => void;
  /** Your running order of projects, which Sort by Priority reads first. */
  projectOrder?: string[];
}) {
  const liveIds = useContext(LiveContext);
  const team = useContext(TeamContext);
  const me = team?.me ?? null;
  const who = picked ?? (me ? [me] : []);
  const withOthers = who.some((p) => p !== me);
  const since = team?.state.since ?? null;
  // A COLUMN IS LIFTED AND CARRIED (w-23fc91bff5, fourth round): it rides the
  // pointer both ways, raised over the board, while the others slide aside;
  // letting go keeps the order, and Escape puts it back. Pointer events, not
  // the browser's drag and drop: that one cancelled itself when the column was
  // redrawn, drew a ghost, and only ever moved the column sideways, which "doesn't
  // feel like I've even processed it".
  const [dragging, setDragging] = useState<ThreadStateWord | null>(null);
  const [preview, setPreview] = useState<ThreadStateWord[] | null>(null);
  const shown = preview ?? columnOrder;
  // One copy of what the board holds and in what order, which App.tsx also
  // walks with J and K (`boardColumns`, page-rules.ts).
  // Held between renders, because J re-renders the board on every press and
  // the columns do not change when only the keyboard's card does.
  const columns = useMemo(
    () => boardColumns({ items, products, display, now, stateOf, cards, picked, me, since, live: liveIds, order: shown, projectOrder }),
    [items, products, display, now, stateOf, cards, picked, me, since, liveIds, shown, projectOrder],
  );
  // THE OTHER COLUMNS SLIDE TO THEIR NEW PLACES (2026-10-02): they used to
  // jump, which read as "weird ... when I'm moving things around". Measured
  // from where each column sat in the old order and the pitch between two
  // columns now, so a window resized since the last move cannot throw it off.
  const colEls = useRef(new Map<ThreadStateWord, HTMLDivElement>());
  const lastOrder = useRef(shown);
  const shownNow = useRef(shown);
  shownNow.current = shown;
  // The drag in hand: where it started, the slots' centres measured once at
  // its start, and where the pointer is. A ref, so a move costs no render.
  const drag = useRef<{
    state: ThreadStateWord; el: HTMLDivElement; startX: number; startY: number; x: number; y: number;
    started: boolean; startIndex: number; slots: number[]; pitch: number;
  } | null>(null);
  // Keep the carried column under the pointer: its box sits in whatever slot
  // the order gives it, so the offset takes that slot back out.
  const follow = () => {
    const d = drag.current;
    if (!d?.started) return;
    const el = d.el;
    const x = d.x - d.startX - (shownNow.current.indexOf(d.state) - d.startIndex) * d.pitch;
    // Up only a little: the board's top edge clips, and a column carried up
    // past it lost its heading (photographed 2026-10-02). Down and across freely.
    const y = Math.max(-6, d.y - d.startY);
    el.style.transform = `translate(${x}px, ${y}px) scale(1.02)`;
  };
  useBeforePaint(() => {
    const before = lastOrder.current;
    lastOrder.current = shown;
    follow();
    if (before === shown) return;
    const lefts = shown.map((s) => colEls.current.get(s)?.offsetLeft ?? 0);
    const pitch = lefts.length > 1 ? lefts[1] - lefts[0] : 0;
    shown.forEach((state, i) => {
      if (state === dragging) return;
      const was = before.indexOf(state);
      const el = colEls.current.get(state);
      if (was < 0 || was === i || !el?.animate) return;
      el.animate([{ transform: `translateX(${(was - i) * pitch}px)` }, { transform: 'translateX(0)' }], SETTLE);
    });
  }, [shown]);
  const putDown = (keep: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.started) return;
    if (keep) onReorderColumns?.(shownNow.current);
    // From wherever it was let go into its slot, rather than snapping there.
    const from = d.el.style.transform;
    d.el.style.transform = '';
    if (from && d.el.animate) d.el.animate([{ transform: from }, { transform: 'none' }], SETTLE);
    setDragging(null);
    setPreview(null);
  };
  // The newest putDown, for the window's listeners, which outlive the render
  // that set them up.
  const putDownNow = useRef(putDown);
  putDownNow.current = putDown;
  const moveDrag = (x: number, y: number) => {
    const d = drag.current;
    if (!d) return;
    d.x = x; d.y = y;
    if (!d.started) {
      // A press that barely moves is a click, not a lift.
      if (Math.hypot(d.x - d.startX, d.y - d.startY) < 4) return;
      // THE SLOTS ARE MEASURED ONCE, HERE, and the place is worked out from
      // them and the pointer alone (`slotUnder`). Reading it off the column
      // drawn under the pointer made a swap undo itself every frame while the
      // columns slid.
      const order = shownNow.current;
      d.slots = order.map((s) => { const r = colEls.current.get(s)?.getBoundingClientRect(); return r ? r.left + r.width / 2 : 0; });
      d.pitch = d.slots.length > 1 ? d.slots[1] - d.slots[0] : 0;
      d.startIndex = order.indexOf(d.state);
      d.started = true;
      setDragging(d.state);
    }
    const want = slotUnder(d.slots, d.slots[d.startIndex] + (d.x - d.startX));
    if (want >= 0 && want !== shownNow.current.indexOf(d.state)) setPreview(columnTo(shownNow.current, d.state, want));
    follow();
  };
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); putDown(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  const sharing = (it: WorkItem) => rowSharing(it, products.find((p) => p.slug === it.product), team ? { me, since } : null);
  const isSelected = (it: WorkItem | null) => !!it && !!selected && it.id === selected.id && it.product === selected.product;
  // The keyboard's card stays on the screen as J, K and the arrows move it,
  // and only when it moves, so a refresh never scrolls the board out from
  // under the pointer. Before the frame is drawn, not after: after, a card
  // below the fold was painted where it was and then scrolled to a frame
  // later, which is a jump on every press down a long column.
  const boardRef = useRef<HTMLDivElement>(null);
  useBeforePaint(() => {
    // Never while a column is being carried: the board stays where you put it.
    if (drag.current?.started) return;
    const card = boardRef.current?.querySelector('.th-card.selected');
    if (!card) return;
    // On a column's first card, bring its heading into view too: the card
    // alone left the heading above the top of the board.
    const col = card.parentElement;
    const first = col?.querySelector('.th-card') === card;
    (first ? col?.querySelector('.th-col-h') ?? card : card).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selected?.id, selected?.product]);
  return <div className="list hm-me">
    <div className={`th-board${dragging ? ' dragging' : ''}`} ref={boardRef}>
    {columns.map((col) => {
      const rows = col.rows;
      return <div key={col.state} className={`th-col${dragging === col.state ? ' lifted' : ''}`}
        ref={(el) => { if (el) colEls.current.set(col.state, el); else colEls.current.delete(col.state); }}>
        {/* Your own board says what the tab says: what waits on you needs you.
            The heading is the handle: grab it to move the whole column. */}
        <div className={`th-col-h${onReorderColumns ? ' movable' : ''}`}
          onPointerDown={(e) => {
            if (!onReorderColumns || e.button !== 0) return;
            const el = colEls.current.get(col.state);
            if (!el) return;
            e.preventDefault();
            drag.current = { state: col.state, el, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, started: false, startIndex: 0, slots: [], pitch: 0 };
            // THE WHOLE WINDOW LISTENS UNTIL THE PRESS ENDS. Holding the
            // pointer on the heading broke on the first change of order: that
            // moves the column in the page, which lets go of the pointer, and
            // the column stopped after one place ("it only moves one row at a
            // time").
            const move = (ev: PointerEvent) => moveDrag(ev.clientX, ev.clientY);
            const stop = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
              window.removeEventListener('pointercancel', cancel);
            };
            const up = () => { stop(); putDownNow.current(true); };
            const cancel = () => { stop(); putDownNow.current(false); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', cancel);
          }}><StateGlyph state={col.state} />{col.state === 'waiting' && !withOthers ? 'Needs you' : col.label}<b>{rows.length}</b>
          {/* THE HANDLE COMES UP WHEN YOU ARE OVER THE COLUMN: "a little drag
              icon comes up subtly". Only where a drag does something. */}
          {onReorderColumns && <GripIcon />}</div>
        {rows.length === 0 && <div className="th-col-empty">Nothing here.</div>}
        {/* A card says who can see it the way a row does: the lock on what
            only you can see, the people mark on what a few chosen people
            can, and nothing on what the whole team can, the default. */}
        {rows.map((e) => <button type="button" key={e.key} className={`th-card${isSelected(e.item) ? ' selected' : ''}`} onClick={() => (e.item ? onOpenItem(e.item) : e.card && onOpenCard?.(e.card))}>
          <div className="t">{e.message
            ? <MessageTitle people={e.message.people} fromMe={e.message.fromMe} text={e.title ?? ''} />
            : <TitleThenMark title={e.title ?? ''} mark={
              e.item && sharing(e.item) === 'people' ? <SharedMark label="Visible to the people on it" />
                : e.item && sharing(e.item) === 'private' ? <LockMark /> : null} />}
          </div>
          <div className="m">{e.live && <StateGlyph state="running" live />}{e.priority !== null && <PriorityMark id={priorityIdOf(e.priority)} />}<span className="p">{e.project}</span>
            {withOthers && <Face person={e.ownerId ? team?.byId.get(e.ownerId) ?? null : null} me={e.ownerId === me} />}</div>
        </button>)}
      </div>;
    })}
  </div></div>;
}
