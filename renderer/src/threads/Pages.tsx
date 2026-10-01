// THE INBOX AND TEAM PAGES' PIECES (approved 2026-10-01, w-e731ca9376).
//
// The header's right end (Search, New thread, Display), the state tabs, the
// cells of a thread row in the inbox's table, and the Team page with its
// Everyone and project pickers over a board or a list. The rules they follow
// are in ./page-rules.ts; the look is ./pages.css, ported from the drawings
// she approved.
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import './pages.css';

/* ------------------------------------------------------------ icons */
export const PenIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 20h8" /><path d="m4 20 1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /></svg>;
const SearchGlyph = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>;
const SlidersIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
const ListIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
const BoardIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3.5" y="4" width="5" height="16" rx="1" /><rect x="10.5" y="4" width="5" height="11" rx="1" /><rect x="17.5" y="4" width="3" height="7" rx="1" /></svg>;
const CaretIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
export const PeopleIcon = () => <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="9" cy="9" r="3.2" /><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7" /></svg>;
export const LockMark = () => <svg className="th-lock" width="11" height="12" viewBox="0 0 11 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-label="Private"><rect x="1.5" y="5.5" width="8" height="6" rx="1" /><path d="M3.5 5.5V3.8a2 2 0 0 1 4 0v1.7" /></svg>;

/* ------------------------------------------------------------ marks */
export function StateGlyph({ state }: { state: ThreadStateWord }) {
  return <span className={`th-st s-${state}`} aria-hidden="true" />;
}

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
  { view: 'progress', label: 'Running' },
  { view: 'snoozed', label: 'Scheduled' },
  { view: 'done', label: DONE.short },
  { view: 'all', label: 'All' },
];

export function StateTabs({ view, counts, onView }: { view: TabView; counts: Partial<Record<TabView, number>>; onView: (v: TabView) => void }) {
  return <div className="th-bar"><div className="tm-tabs">
    {INBOX_TABS.map((t) => <button type="button" key={t.view} className={`tm-tab${view === t.view ? ' on' : ''}`} onClick={() => onView(t.view)}>{t.label}{counts[t.view] !== undefined && <b>{counts[t.view]}</b>}</button>)}
  </div></div>;
}

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
    done: 'Nothing finished yet.',
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
export function RowCells({ title, hidden = false, lock = false, where, person, priority, updatedAt, now }: {
  title: ReactNode; hidden?: boolean; lock?: boolean; where: ReactNode; person?: ReactNode;
  priority: number | null; updatedAt: number; now: number;
}) {
  const id = priority === null ? null : priorityIdOf(priority);
  return <div className={`row-main th-grid${person !== undefined ? ' with-person' : ''}`}>
    <div className={`th-cell-title subject${hidden ? ' hidden' : ''}`}>{title}{lock && <LockMark />}</div>
    <div className="th-cell-proj">{where}</div>
    {person !== undefined && <div className="th-cell-person">{person}</div>}
    <div className={`th-cell-prio${id === 'urgent' ? ' urgent' : ''}`}>{id && <><PriorityMark id={id} />{priorityLabelOf(id)}</>}</div>
    <div className="th-cell-when num">{updatedWords(updatedAt, now)}</div>
  </div>;
}

/** The cells of one row in the inbox's table: thread, project (or who a message is from), priority, updated. */
export function ThreadCells({ item, product, now }: { item: WorkItem; product: Product | undefined; now: number }) {
  const team = useContext(TeamContext);
  let where: ReactNode = product?.name ?? '';
  if (isDirect(product)) {
    const otherId = otherPerson(item, team?.me ?? null);
    const other = otherId ? team?.byId.get(otherId) ?? null : null;
    const fromThem = item.createdBy && item.createdBy !== team?.me;
    where = <>{other && <Face person={other} />}{fromThem ? 'From ' : 'To '}{firstName(other)}</>;
  }
  // A conversation with a person reads as its latest message, the way a chat
  // list does; every other row keeps its title.
  const latest = isDirect(product) ? (item.answer || item.body || '').trim().split('\n')[0] : '';
  return <RowCells title={latest || rowTitle(item)} lock={item.visibility === 'private'} where={where}
    priority={isDirect(product) ? null : item.priority ?? 0} updatedAt={item.updatedAt} now={now} />;
}

/* ------------------------------------------------------------ the Team page */
function Picker({ label, open, setOpen, children }: { label: ReactNode; open: boolean; setOpen: (o: boolean) => void; children: ReactNode }) {
  const ref = useOutside(open, () => setOpen(false));
  return <span ref={(el) => { ref.current = el; }} style={{ position: 'relative', display: 'inline-flex' }}>
    <button type="button" className={`th-scope${open ? ' open' : ''}`} onClick={() => setOpen(!open)}>{label}<CaretIcon /></button>
    {open && <div className="th-menu" role="listbox">{children}</div>}
  </span>;
}

export function TeamView({ items, products, cards, display, now, onOpenItem, onOpenCard }: {
  items: WorkItem[]; products: Product[]; cards: ThreadCard[]; display: Display; now: number;
  onOpenItem: (item: WorkItem) => void; onOpenCard: (card: ThreadCard) => void;
}) {
  const team = useContext(TeamContext);
  const me = team?.me ?? null;
  const [person, setPerson] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const everyone: Person[] = team ? [...team.byId.values()] : [];
  const mine = everyone.find((p) => p.id === me) ?? null;
  const others = everyone.filter((p) => p.id !== me).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const all = useMemo(() => teamEntries({ items, products, cards, me, now }), [items, products, cards, me, now]);
  const entries = all.filter((e) => teamKeeps(e, { person, projectName }, display, now));
  const projectNames = [...new Set(all.map((e) => e.project).filter((p): p is string => !!p))].sort();
  const who = person ? team?.byId.get(person) ?? null : null;
  const open = (e: BoardEntry) => (e.item ? onOpenItem(e.item) : e.card && onOpenCard(e.card));
  const nameOf = (id: string | null) => (id === me ? 'You' : firstName(id ? team?.byId.get(id) ?? null : null));

  return <div className="list hm-all">
    <div className="th-bar"><span className="th-scopes">
      <Picker open={peopleOpen} setOpen={setPeopleOpen} label={who ? <><Face person={who} me={who.id === me} />{who.id === me ? 'You' : who.name}</> : <><PeopleIcon />Everyone</>}>
        <button type="button" className={`row-i${!person ? ' on' : ''}`} onClick={() => { setPerson(null); setPeopleOpen(false); }}><span className="ico"><PeopleIcon /></span>Everyone</button>
        <span className="sep" />
        {mine && <button type="button" className={`row-i${person === mine.id ? ' on' : ''}`} onClick={() => { setPerson(mine.id); setPeopleOpen(false); }}><Face person={mine} me />You</button>}
        {others.map((p) => <button type="button" key={p.id} className={`row-i${person === p.id ? ' on' : ''}`} onClick={() => { setPerson(p.id); setPeopleOpen(false); }}><Face person={p} />{p.name}</button>)}
      </Picker>
      <span className="th-dot">·</span>
      <Picker open={projectsOpen} setOpen={setProjectsOpen} label={projectName ?? 'All projects'}>
        <button type="button" className={`row-i${!projectName ? ' on' : ''}`} onClick={() => { setProjectName(null); setProjectsOpen(false); }}>All projects</button>
        {projectNames.length > 0 && <span className="sep" />}
        {projectNames.map((n) => <button type="button" key={n} className={`row-i${projectName === n ? ' on' : ''}`} onClick={() => { setProjectName(n); setProjectsOpen(false); }}>{n}</button>)}
      </Picker>
    </span></div>
    {display.view === 'board' ? <div className="th-board">
      {BOARD_COLUMNS.map((col) => {
        const rows = entries.filter((e) => e.state === col.state);
        return <div key={col.state}>
          <div className="th-col-h"><StateGlyph state={col.state} />{col.label}<b>{rows.length}</b></div>
          {rows.map((e) => <button type="button" key={e.key} className="th-card" onClick={() => open(e)}>
            <div className={`t${e.title === null ? ' hidden' : ''}`}>{e.title ?? 'Private thread'}{(e.title === null || e.item?.visibility === 'private') && <LockMark />}</div>
            <div className="m">{e.priority !== null && <PriorityMark id={priorityIdOf(e.priority)} />}<span className="p">{e.project ?? 'Hidden'}</span><Face person={e.ownerId ? team?.byId.get(e.ownerId) ?? null : null} me={e.ownerId === me} /></div>
          </button>)}
        </div>;
      })}
    </div> : <div className="th-table">
      <TableHead person />
      {entries.length === 0 && <div className="th-empty">Nothing here.</div>}
      {entries.map((e) => <div key={e.key} className="row" onClick={() => open(e)}>
        <span className="mark" aria-hidden="true" />
        <RowCells title={e.title ?? 'Private thread'} hidden={e.title === null} lock={e.title === null || e.item?.visibility === 'private'}
          where={e.project ?? 'Hidden'}
          person={<><Face person={e.ownerId ? team?.byId.get(e.ownerId) ?? null : null} me={e.ownerId === me} />{nameOf(e.ownerId)}</>}
          priority={e.priority} updatedAt={e.updatedAt} now={now} />
      </div>)}
    </div>}
  </div>;
}

/** Your own threads as a board, when the Inbox's Display says Board. */
export function InboxBoard({ items, products, display, now, onOpenItem }: {
  items: WorkItem[]; products: Product[]; display: Display; now: number; onOpenItem: (item: WorkItem) => void;
}) {
  const team = useContext(TeamContext);
  const me = team?.me ?? null;
  const entries = teamEntries({ items, products, cards: [], me, now })
    .filter((e) => !e.item || (display.projects.length === 0 || display.projects.includes(e.item.product)))
    .filter((e) => teamKeeps(e, { person: null, projectName: null }, display, now));
  return <div className="list hm-me"><div className="th-board">
    {BOARD_COLUMNS.map((col) => {
      const rows = entries.filter((e) => e.state === col.state);
      return <div key={col.state}>
        {/* Your own board says what the tab says: what waits on you needs you. */}
        <div className="th-col-h"><StateGlyph state={col.state} />{col.state === 'waiting' ? 'Needs you' : col.label}<b>{rows.length}</b></div>
        {rows.length === 0 && <div className="th-col-empty">Nothing here.</div>}
        {rows.map((e) => <button type="button" key={e.key} className="th-card" onClick={() => e.item && onOpenItem(e.item)}>
          <div className="t">{e.title}{e.item?.visibility === 'private' && <LockMark />}</div>
          <div className="m">{e.priority !== null && <PriorityMark id={priorityIdOf(e.priority)} />}<span className="p">{e.project}</span></div>
        </button>)}
      </div>;
    })}
  </div></div>;
}
