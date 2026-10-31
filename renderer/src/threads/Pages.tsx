// THE INBOX AND TEAM PAGES' PIECES (approved 2026-10-01, w-e731ca9376).
//
// The header's right end (Search, New thread, Display), the state tabs, the
// cells of a thread row in the inbox's table, and the Team page with its
// Everyone and project pickers over a board or a list. The rules they follow
// are in ./page-rules.ts; the look is ./pages.css, ported from the drawings
// she approved.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRowDrag } from './row-drag';
import { chord } from '../this-keyboard';
import type { Person, Product, ThreadCard, ThreadStateWord, View, WorkItem } from '../types';
import { priorityIdOf, priorityLabelOf, PRIORITIES, type PriorityId } from '../priority';
import { Face, TeamContext, firstName, personOf } from '../team/people';
import { PriorityIcon } from '../components/Priority';
import { notStarted, rowTitle } from '../list-rules';
import { toApproveWords } from '../threads-made';
import { DONE } from '../done-word';
import {
  boardColumns, columnTo, conversationSlugs, DEFAULT_COLUMN_ORDER, emptyTabWords, entryScore, filteredEmptyWords, finishedAt, sentAt, isDirect, isFiltered, nextPrivacy, dropWithPins, projectChoices, slotUnder,
  backWords, timeHeading, updatedWords,
  type BoardEntry, type Display, type PageId, type Privacy, type UpdatedWindow,
} from './page-rules';
import { messageLine, messagePriority, rowSharing, sharePatch } from './page-rules';
import { facesOnButton, peopleWorthADot, togglePicked, whoseWord } from './people-rules';
import { stopKey } from './walk-rules';
import { PinMark } from './ThreadMenu';
import { cardClickIntent, cardsUnder, clickMarks, marqueeBox, marqueeMarks, type Box } from './board-select';
import { shownToPeople } from '../../../shared/thread-cards.mjs';
import { Name } from '../../../shared/product-name.mjs';
import { FleetContext } from '../fleet';
import { TeammateLead } from '../teammates/row-lead';
import { factsFor, saysOnCard, statusCell, type StatusCell } from '../status-word';
import { shownPriority } from '../../../shared/rank.mjs';
import { api } from '../api';
import { CLOUD_KEY, CLOUD_WHEN_ON, cloudButtonCount, cloudFootLine, cloudIsOn, cloudMonthLine, cloudMoveLine, countedAccounts, type CloudMode, type CloudStatus } from '../cloud-menu';
import { brokenAccounts, buttonAsksSignIn, menuSetupLine, readBrokenSeen, seenAfter, SETUP, writeBrokenSeen } from '../cloud-setup';
import type { Offer, OfferGo } from '../cloud-upgrade';
import './pages.css';

// Before the frame is drawn in the app; a plain effect where there is no
// window (the tests draw the board to a string, and React warns otherwise).
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const SETTLE = { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' };

/* ------------------------------------------------------------ icons */
const GripIcon = () => <svg className="th-col-grip" viewBox="0 0 10 16" width="8" height="13" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4" /><circle cx="7.5" cy="3" r="1.4" /><circle cx="2.5" cy="8" r="1.4" /><circle cx="7.5" cy="8" r="1.4" /><circle cx="2.5" cy="13" r="1.4" /><circle cx="7.5" cy="13" r="1.4" /></svg>;
export const PenIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 20h8" /><path d="m4 20 1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /></svg>;
const SearchGlyph = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>;
export const SlidersIcon = () => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
const ListIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
export const BoardIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3.5" y="4" width="5" height="16" rx="1" /><rect x="10.5" y="4" width="5" height="11" rx="1" /><rect x="17.5" y="4" width="3" height="7" rx="1" /></svg>;
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
/** A thread's state mark. `live` pulses it: an agent is on the thread now,
 *  rather than the thread waiting its turn. */
export function StateGlyph({ state, live = false }: { state: ThreadStateWord; live?: boolean }) {
  return <span className={`th-st s-${state}${live ? ' live' : ''}`} aria-hidden="true" title={live ? 'An agent is on it now' : undefined} ref={live ? inStep : undefined} />;
}

/** Every running mark pulses on one beat: each starts on the page's clock, not when its row appeared. */
export function inStep(el: Element | null) {
  for (const a of el?.getAnimations?.() ?? []) a.startTime = 0;
}

/** The threads an agent is on right now, by id (App.tsx provides it). */
export const LiveContext = createContext<Set<string>>(new Set());
/** The ones of those running in the cloud rather than on this Mac. */
export const CloudContext = createContext<Set<string>>(new Set());
/** Runs on this Mac the cloud could take now, and the press that moves one (CloudStatus `movable`). */
export const MoveToCloudContext = createContext<{ ids: Set<string>; move: (id: string, product: string) => void } | null>(null);

/**
 * The mark in the Status cell: the running one where an agent is on it, the
 * still ring where one is waiting its turn or held, and NOTHING AT ALL on the
 * words that are the thread's own state.
 *
 * Not a blank of the mark's width either, which is what shipped first and what
 * she caught: "STATUS isn't properly lined up, it's off to the side". A whole
 * tab of Waiting rows wore the spacer, so every word in the column sat 21px
 * right of its own heading. The cell starts at the column's edge, mark or no
 * mark, which is how Project and Priority read (status-word.ts).
 */
export function StatusMark({ status }: { status: StatusCell }) {
  if (!status.agent) return null;
  if (status.live) return <RunningMark cloud={status.cloud} />;
  return <span className={`th-st s-${status.mark}`} aria-hidden="true" />;
}

/** An agent is on the thread now: the half-dot on this Mac, a cloud in the cloud, both pulsing. */
export function RunningMark({ cloud = false }: { cloud?: boolean }) {
  if (!cloud) return <StateGlyph state="running" live />;
  return <svg className="th-st-cloud" ref={inStep} width="14" height="11" viewBox="2 5 21 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" role="img" aria-label="An agent is on it now, in the cloud">
    <title>An agent is on it now, in the cloud</title><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  </svg>;
}

/** How many tasks each thread filed are waiting for a yes, by `product/id`
 *  (App.tsx provides it, off `waitingCounts` in ../threads-made). */
export const WaitingContext = createContext<Map<string, number>>(new Map());

/** The threads queued while this Mac runs all it can (App.tsx provides it). */
export const FreeAgentContext = createContext<Set<string>>(new Set());

/** The cloud's offer at the end of In progress, and what its button does (../cloud-upgrade.ts). */
export const CloudOfferContext = createContext<{ offer: Offer; onGo: (go: OfferGo) => void } | null>(null);

// THE OFFER, NEVER A POP-UP (2026-10-13, w-1dc7ee2408): the last row of the
// list, and a card at the foot of the board's In progress column.
export function CloudOfferRow() {
  const at = useContext(CloudOfferContext);
  if (!at) return null;
  const { offer, onGo } = at;
  return <div className="row th-offer-row">
    <span className="mark" aria-hidden="true" />
    <div className="row-main th-offer-main">
      <span className="th-offer-ic"><CloudIcon /></span>
      <span className="th-offer-say">{offer.say} <span className="th-offer-wait">{offer.waiting}</span></span>
      {offer.go && <button type="button" className="th-offer-go" onClick={() => onGo(offer.go!)}><CloudIcon />{offer.go.label}</button>}
    </div>
  </div>;
}

function CloudOfferCard() {
  const at = useContext(CloudOfferContext);
  if (!at) return null;
  const { offer, onGo } = at;
  return <div className="th-card th-offer-card">
    <div className="t">{offer.say.replace(/\.$/, '')}</div>
    <div className="m"><span className="th-offer-count"><CloudIcon /><span className="p">{offer.waiting.replace(/ (is|are) waiting\.$/, ' waiting').replace(/threads? /, '')}</span></span>
      {offer.go && <button type="button" className="th-offer-card-go" onClick={() => onGo(offer.go!)}>{offer.go.act === 'pay' ? offer.go.label.replace(/ · .*/, '') : 'Start in the cloud'}<span aria-hidden="true">→</span></button>}</div>
  </div>;
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
/** Whose threads are on the page, and how to change it (App.tsx holds it). */
export type PeoplePick = { everyone: Person[]; picked: string[]; me: string | null; onPick: (picked: string[]) => void };

/**
 * SEARCH IS A MAGNIFIER WITH NO WORD (w-3c51d02de5, 2026-10-14): the header's
 * right end had grown to four controls and read as cluttered. It sits at the
 * right end of the tabs row; the board has no tabs row, so there it stays in
 * the header. NO "/" ON ITS FACE (w-facfc092e1): the key shows on hover,
 * through the hint plate.
 */
export function SearchButton({ onSearch }: { onSearch: () => void }) {
  return <button type="button" className="th-search" data-hint="search" onClick={onSearch} title="Search threads (/)" aria-label="Search threads"><SearchGlyph /></button>;
}

/** New thread, the cloud and the Display icon (and Search on the board), at the right of the Inbox header. */
export function HeaderActions({ page, display, onDisplay, products, items, onSearch, onCompose, shown, total, tab, people, cloud, onCloudMode, onCloudWhenOn, onCloudSetUp, onCloudMove, filters = true, view = null }: {
  /** False over a room, where there is no list to view or filter. */
  filters?: boolean;
  /** What stands in the filters button's place when `filters` is false: a room's own View button. */
  view?: ReactNode;
  page: PageId; display: Display; onDisplay: (d: Display) => void; products: Product[]; items?: WorkItem[];
  /** Only where no tabs row draws it (the board). */
  onSearch?: () => void; onCompose: () => void; shown?: number; total?: number; tab?: string;
  people?: PeoplePick;
  /** Where threads run; no button at all on a Mac not set up for the cloud. */
  cloud?: CloudStatus | null; onCloudMode?: (mode: CloudMode) => void; onCloudWhenOn?: (mode: Exclude<CloudMode, 'mac'>) => void; onCloudSetUp?: () => void;
  onCloudMove?: (ids: string[]) => void;
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
  return <div className="th-right">
    {onSearch && <SearchButton onSearch={onSearch} />}
    <button type="button" className="th-new" data-hint="new-task" onClick={onCompose} title="New thread (N)"><PenIcon />New thread</button>
    {(cloud?.setUp || cloud?.offered) && <CloudButton cloud={cloud} onMode={onCloudMode} onWhenOn={onCloudWhenOn} onSetUp={onCloudSetUp} onMove={onCloudMove} />}
    {filters && <span ref={(el) => { ref.current = el; }} style={{ position: 'relative', display: 'inline-flex' }}>
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
    </span>}
    {!filters && view}
  </div>;
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** View, sort, and the filters: priority, project and when it was updated. */
// WHERE THREADS RUN (approved 2026-10-13): a square button beside the filters
// button, the same shape, wearing how many run in the cloud while any do. Its
// menu is built like the filters menu: one line of three choices with the
// picked one in orange, one line saying what it does, then this month's use
// (renderer/src/cloud-menu.ts, tests/the-cloud-button-chooses-where-threads-run).
const CloudIcon = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg>;

function CloudButton({ cloud, onMode, onWhenOn, onSetUp, onMove }: { cloud: CloudStatus; onMode?: (mode: CloudMode) => void; onWhenOn?: (mode: Exclude<CloudMode, 'mac'>) => void; onSetUp?: () => void; onMove?: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const count = cloudButtonCount(cloud);
  // ON OR OFF, THEN WHAT "ON" MEANS (2026-10-16). The meaning is kept while
  // the cloud is off, so turning it back on goes where it went before.
  const on = cloudIsOn(cloud);
  const whenOn = cloud.whenOn ?? (cloud.mode === 'all' ? 'all' : 'full');
  const meaning = CLOUD_WHEN_ON.find((c) => c.id === whenOn) ?? CLOUD_WHEN_ON[0];
  const move = cloudMoveLine({ mode: cloud.mode, movable: cloud.movable?.length ?? 0 });
  // NOT SET UP IS THE WHOLE MENU, NOT A ROW IN IT (2026-10-14: the "Setup"
  // row was "very strange and I don't even notice it"). Until one account can
  // run in the cloud, the choices of where threads run mean nothing, so the
  // menu is an invitation with one button (picked 2026-10-14 over a banner
  // above greyed choices), and the button wears the accent dot the filters
  // button uses. Once some are set up, one line says how many are left.
  // Picking a choice never opens a screen by itself.
  const accounts = cloud.accounts || [];
  // The invitation is for a cloud with no account at all, and none on its way.
  const nobodyReady = !accounts.length && !(cloud.signIns || []).length;
  const setup = menuSetupLine(cloud);
  // A STOPPED ACCOUNT IS SAID IN WORDS until the menu has been opened on it
  // (../cloud-setup.ts). It counts as seen when the menu closes, so the button
  // does not shrink under a menu that is open.
  const [seen, setSeen] = useState(readBrokenSeen);
  const looked = useRef<string[]>([]);
  useEffect(() => {
    if (open) { looked.current = [...new Set([...looked.current, ...brokenAccounts(cloud)])]; return; }
    const next = seenAfter(cloud, seen, looked.current);
    looked.current = [];
    if (next.join() !== seen.join()) { setSeen(next); writeBrokenSeen(next); }
  }, [open, cloud, seen]);
  const asks = !nobodyReady && buttonAsksSignIn(cloud, seen);
  const goSetUp = () => { setOpen(false); onSetUp?.(); };
  // TRY AGAIN ON ONE THAT WAS NOT ADDED starts it again and opens the setup on
  // its sign-in, rather than on a list with a second Try again on it.
  const failed = (cloud.signIns || []).find((s) => s.state === 'failed');
  const retry = async () => {
    if (failed) {
      const mine = (cloud.accounts || []).some((a) => a.key === failed.key);
      await api.cloudSignIn({ action: 'cancel', engine: failed.engine, key: failed.key });
      await api.cloudSignIn({ action: 'start', engine: failed.engine, key: mine ? failed.key : null });
    }
    goSetUp();
  };
  return <span ref={(el) => { ref.current = el; }} style={{ position: 'relative', display: 'inline-flex' }}>
    <button type="button" className={`th-disp th-cloud${count && !asks ? ' count' : ''}${asks || (!count && nobodyReady) ? ' named' : ''}${open ? ' open' : ''}${on && !nobodyReady ? ' lit' : ''}`}
      aria-label={asks ? SETUP.menuBroken : count ? `Cloud on, ${count} running there` : nobodyReady ? 'Cloud, not set up yet' : on ? 'Cloud on' : 'Cloud off'} title={asks ? SETUP.menuBroken : nobodyReady ? SETUP.inviteGo : `Cloud ${on ? 'on' : 'off'} (${chord(CLOUD_KEY)})`}
      data-hint="cloud" data-hint-align="center" onClick={() => setOpen((o) => !o)}>
      {/* The word until it is set up: a new user found no other way in, and nothing saying what the icon was (F-97). */}
      <CloudIcon />{asks
        ? <span className="th-cloud-word ask">{SETUP.again}</span>
        : count ? <b>{count}</b> : nobodyReady && <span className="th-cloud-word">Cloud</span>}{(asks || (!count && (nobodyReady || setup))) && <i />}
    </button>
    {open && nobodyReady && <div className="th-pop th-cloud-pop th-cloud-invite" role="dialog" aria-label={SETUP.inviteHead}>
      <span className="th-cloud-invite-ic"><CloudIcon /></span>
      <div className="th-cloud-invite-head">{SETUP.inviteHead}</div>
      <p className="th-cloud-invite-line">{SETUP.inviteLine}</p>
      <button type="button" className="th-cloud-invite-go" onClick={goSetUp}>{SETUP.inviteGo}</button>
    </div>}
    {open && !nobodyReady && <div className="th-pop th-cloud-pop" role="dialog" aria-label="Where threads run">
      {setup && <div className="th-cloud-banner">
        <div className="th-cloud-banner-say">{!setup.go && <span className="cs-busy" aria-hidden="true" />}<b>{setup.say}</b></div>
        {setup.go && <button type="button" className="th-cloud-go" onClick={() => void (failed && setup.go === SETUP.tryAgain ? retry() : goSetUp())}>{setup.go}</button>}
      </div>}
      <div className="line"><span className="lab">Cloud</span><span className="th-cloud-onoff">
        <span className="opts">
          <button type="button" className={on ? 'on picked' : ''} aria-pressed={on} onClick={() => onMode?.(whenOn)}>{on && <i className="th-cloud-on-dot" aria-hidden="true" />}On</button>
          <button type="button" className={on ? '' : 'on picked'} aria-pressed={!on} onClick={() => onMode?.('mac')}>Off</button>
        </span>
        <span className="th-cloud-keysay">turn on or off with <kbd>{chord(CLOUD_KEY)}</kbd></span>
      </span></div>
      <div className="line"><span className="lab">When on</span><span className="opts">
        {CLOUD_WHEN_ON.map((c) => <button type="button" key={c.id} className={c.id === whenOn ? 'on picked' : ''} aria-pressed={c.id === whenOn} onClick={() => onWhenOn?.(c.id)}>{c.label}</button>)}
      </span></div>
      <div className="line th-cloud-note"><span className="lab" /><span>{on ? meaning.note : 'Off: every thread runs on this Mac.'}</span></div>
      {move && <div className="line th-cloud-setup"><span className="lab">This Mac</span><span className="th-cloud-setup-row">
        <span className="th-cloud-setup-say">{move.say}</span>
        {move.go && <button type="button" className="th-cloud-manage" onClick={() => { setOpen(false); onMove?.(cloud.movable ?? []); }}>{move.go}</button>}
      </span></div>}
      <div className="rule" />
      <div className="line th-cloud-setup"><span className="lab">Accounts</span><span className="th-cloud-setup-row">
        <span className="th-cloud-setup-say">{SETUP.menuAccounts(countedAccounts(accounts).length)}</span>
        <button type="button" className="th-cloud-manage" onClick={goSetUp}>{SETUP.menuManage}</button>
      </span></div>
      <div className="line"><span className="lab">This month</span><span className="th-cloud-use">{cloudMonthLine(cloud.month)}</span></div>
      <div className="rule" />
      <div className="foot"><span>{cloudFootLine(cloud)}</span></div>
    </div>}
  </span>;
}

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
      <button type="button" className={display.sort === 'updated' ? 'on' : ''} onClick={() => set({ sort: 'updated' })}>Sent</button>
      {/* Done and In progress ignore this, on purpose (w-c61f5bf497,
          w-21b638d821), and say so where the choice is made rather than
          leaving the list to look broken. */}
      {tab === 'done' && <span className="th-pop-note">Done runs newest first</span>}
      {tab === 'progress' && <span className="th-pop-note">In progress runs newest sent first</span>}
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
    <div className="line"><span className="lab">Sent</span><span className="opts">
      {windows.map(([w, label]) => <button type="button" key={w} className={display.updated === w ? 'on' : ''} onClick={() => set({ updated: w })}>{label}</button>)}
    </span></div>
    <div className="rule" />
    <div className="foot"><span>{shown !== undefined && total !== undefined ? `Showing ${shown} of ${total}` : ''}</span>
      {isFiltered(display) && <button type="button" onClick={() => set({ priorities: [], projects: [], updated: 'any', privacy: 'any' })}>Clear filters</button>}
    </div>
  </div>;
}

/* ------------------------------------------------------------ the tabs */
// NO ALL (w-313907fa49, 2026-10-14): "not sure if 'all' is actually useful of
// a filter. we can remove it". It was the other four poured into one list.
export type TabView = View;
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
];

/**
 * A TAB CARRIES A NUMBER ONLY WHERE THE NUMBER CHANGES WHAT YOU DO (w-57034cf3c0).
 * The strip read DONE 1036 on a real inbox: the archive counting itself, the
 * same four digits every day, and the widest thing on the row. It is a word
 * now, and the three tabs that are still ahead of
 * you keep their number while there is something in them. A zero is not drawn
 * either: an empty tab says so by being empty.
 */
const COUNTED: TabView[] = ['inbox', 'progress', 'snoozed'];

/** With a team on the page (w-b5f23cff71): two tabs, Needs you and Everything else, and the team's faces at the end. */
export type TeamTabs = { on: boolean; onNeeds: () => void; onEverything: () => void; corner?: ReactNode };
export const EVERYTHING_ELSE = 'Everything else';

/** `needs` renames the first tab (Waiting, once a teammate is on the page). */
export function StateTabs({ view, counts, onView, needs, onSearch, lit = false, after, dim = false, into = null, team = null }: {
  view: TabView; counts: Partial<Record<TabView, number>>; onView: (v: TabView) => void; needs?: string;
  /** Draws Search at the row's right end (w-3c51d02de5). */
  onSearch?: () => void;
  /** Something landed in Needs You since it was last open (w-22da913d00). */
  lit?: boolean;
  /** After Done: the room tab (team/rooms/RoomTab.tsx); `dim` while its room is open. */
  after?: ReactNode; dim?: boolean;
  /** Drawn here instead of in place: the top bar, where the page's title was. */
  into?: HTMLElement | null;
  team?: TeamTabs | null;
}) {
  const row = <StateTabsRow view={view} counts={counts} onView={onView} needs={needs} onSearch={onSearch} lit={lit} after={after} dim={dim} team={team} />;
  return into ? createPortal(row, into) : row;
}

function StateTabsRow({ view, counts, onView, needs, onSearch, lit = false, after, dim = false, team = null }: {
  view: TabView; counts: Partial<Record<TabView, number>>; onView: (v: TabView) => void; needs?: string;
  onSearch?: () => void; lit?: boolean; after?: ReactNode; dim?: boolean; team?: TeamTabs | null;
}) {
  // In progress, Later and Done are your own card's tabs on Everything else.
  const tabs = team ? INBOX_TABS.filter((t) => t.view === 'inbox') : INBOX_TABS;
  const on = (t: TabView) => (team ? t === 'inbox' && !team.on : view === t && !dim);
  return <div className="th-bar"><div className="tm-tabs">
    {/* Every tab wears the Tab plate (hint-plate.ts, 'state-tab'). */}
    {tabs.map((t) => <button type="button" key={t.view} data-hint="state-tab" className={`tm-tab${on(t.view) ? ' on' : ''}${!team && t.view === 'inbox' && lit && view !== 'inbox' ? ' fresh' : ''}${team?.on && t.view === 'inbox' && lit ? ' fresh' : ''}`} onClick={() => (team ? team.onNeeds() : onView(t.view))}>{t.view === 'inbox' && needs ? needs : t.label}{COUNTED.includes(t.view) && !!counts[t.view] && <b>{counts[t.view]}</b>}</button>)}
    {team && <button type="button" data-hint="state-tab" className={`tm-tab${team.on ? ' on' : ''}`} onClick={team.onEverything}>{EVERYTHING_ELSE}</button>}
    {after}
  </div>{team?.corner}{onSearch && <SearchButton onSearch={onSearch} />}</div>;
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
export function ConnectComputer({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const as = email ? <> as <b>{email}</b></> : null;
  return <div className="th-clear th-start th-connect">
    <div className="th-connect-group">
      <h2>Connect your computer</h2>
      <ol>
        <li><span>Open {Name} on your computer.</span></li>
        <li><span>In Settings › Phone, sign in{as}.</span></li>
        <li><span>Your threads show up here within a minute.</span></li>
      </ol>
      <div className="th-clear-acts">
        <button type="button" className="th-connect-out" onClick={onSignOut}>Use another account</button>
      </div>
    </div>
  </div>;
}

/** THE EMPTY INBOX IS WHERE THE NEXT THREAD STARTS (w-4e9f957f97). The
 *  heading, and under it the New thread box drawn open on the page: App.tsx
 *  puts the one composer into `slot`. What is in progress has its own tab and
 *  is not counted here. */
export function InboxClear({ slot }: { slot: (el: HTMLDivElement | null) => void }) {
  return <div className="th-clear th-start">
    <h2>Nothing needs you</h2>
    <div className="th-clear-compose" ref={slot} />
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

/** The other tabs, empty: one quiet line where the rows would be. The words
 *  are in ./page-rules (`emptyTabWords`), where a test can read them. */
export function EmptyTab({ view, starting = false, waiting = 0 }: { view: TabView; starting?: boolean; waiting?: number }) {
  return <div className="th-empty"><span>{emptyTabWords(view, starting, waiting)}</span></div>;
}

/* ------------------------------------------------------------ one thread's cells */
export function TableHead({ person = false, tab }: { person?: boolean; tab?: string }) {
  return <div className="row th-head"><span className="mark" aria-hidden="true" /><div className={`row-main th-grid${person ? ' with-person' : ''}`}>
    <div>Thread</div><div>Status</div><div className="th-col-proj">Project</div>{person && <div>Person</div>}<div className="th-col-prio">Priority</div><div className="num">{timeHeading(tab)}</div>
  </div></div>;
}

/** A section of Your threads (./stack-rules): its name and count where Thread is, a click folds it, and its own time column. */
export function SectionHead({ label, count, tab, folded, onFold }: { label: string; count: number; tab: string; folded: boolean; onFold: () => void }) {
  return <div className={`row th-head th-section${folded ? ' folded' : ''}`}><span className="mark" aria-hidden="true" /><div className="row-main th-grid">
    <div><button type="button" className="th-fold" aria-expanded={!folded} onClick={onFold}>
      <svg className="th-fold-mark" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      {label}<b>{count}</b>
    </button></div><div /><div className="th-col-proj" /><div className="th-col-prio" /><div className="num">{timeHeading(tab)}</div>
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

export function RowCells({ status, lead, title, hidden = false, lock = false, shared = false, chosen = 0, held = false, pinned = false, aside, where, person, priority, updatedAt, when, now, action }: {
  /** Pinned to the top of the list (w-20323283e6): a faint pin after the title. */
  pinned?: boolean;
  /**
   * WHAT IS HAPPENING ON THIS THREAD, in the column of its own (w-ec2b04d449).
   * The turning mark used to lead the title and was the only thing on the row
   * about an agent, so a queued thread and a working one were one picture. It
   * is in this cell now, the cloud shape included, and the title is the title.
   * Absent on the rows that are not threads: a repeating rule, a teammate's
   * card. The cell is still drawn, or the columns under it step left. */
  status?: StatusCell;
  title: ReactNode; hidden?: boolean; lock?: boolean; shared?: boolean; where: ReactNode; person?: ReactNode;
  /** How many people a thread shared with chosen people reaches; 0 for the team. */
  chosen?: number;
  /** Added to Later and not started (w-afb66e6661): faint words after the title (w-4189a5c1a0). */
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
    <div className={`th-cell-title subject${hidden ? ' hidden' : ''}`}>{lead}{title}{aside && <span className="th-aside">{aside}</span>}{held && <span className="th-aside">not started</span>}{shared && <SharedMark label={chosen ? `Visible to ${chosen} ${chosen === 1 ? 'person' : 'people'}` : 'Visible to the team'} />}{chosen > 0 && <span className="th-shared-n" aria-hidden="true">{chosen}</span>}{lock && <LockMark />}{pinned && <PinMark size={13} className="th-pin" />}</div>
    <div className={`th-cell-state${status?.why ? ' has-card' : ''}`} title={status?.why ? undefined : status?.title}>{status && <><StatusMark status={status} />{status.word}</>}
      {status?.why && <span className="th-why-card" role="tooltip"><b>{status.why.head}</b><span>{status.why.body}</span></span>}</div>
    <div className="th-cell-proj th-col-proj">{where}</div>
    {person !== undefined && <div className="th-cell-person">{person}</div>}
    <div className={`th-cell-prio th-col-prio${id === 'urgent' ? ' urgent' : ''}`}>{id && <><PriorityMark id={id} />{priorityLabelOf(id)}</>}</div>
    {/* The row's one hover action, if it has one, covers the time while the
        pointer is on the row (pages.css .th-row-act). */}
    <div className={`th-cell-when num${action ? ' has-act' : ''}`}><span className="th-when">{when ?? updatedWords(updatedAt, now)}</span>{action}</div>
  </div>;
}

/** A message's line: the other person's face and name, then what was said,
 *  "You: " first when you spoke last. A group names everyone else. `mark`
 *  follows the name, because on a card the words are cut to one line. */
export function MessageTitle({ people, fromMe, text, mark }: { people: string[]; fromMe: boolean; text: string; mark?: ReactNode }) {
  const team = useContext(TeamContext);
  const first = people.length ? team?.byId.get(people[0]) ?? null : null;
  const names = people.map((id) => (people.length > 1 ? firstName(team?.byId.get(id) ?? null) : team?.byId.get(id)?.name || firstName(team?.byId.get(id) ?? null))).join(', ');
  return <span className="th-msg">
    <Face person={first} />
    <b className="th-msg-who">{names}{mark}</b>
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
  const when = tab === 'done' ? finishedAt(item) : sentAt(item);
  // ON LATER THE TIME COLUMN IS WHEN IT COMES BACK (power-test-1, issue 18),
  // not how long ago it was touched, which is what a page of things coming
  // back has no use for. A thread added to Later and never started comes back
  // when you say so and not on a clock, and its cell is EMPTY rather than
  // falling through to Updated, which under a heading saying Back would be a
  // return time that is not one. The row says "not started" beside its name.
  const back = tab === 'snoozed' ? backWords(item, now) : undefined;
  const waiting = useContext(WaitingContext);
  const freeWait = useContext(FreeAgentContext);
  const team = useContext(TeamContext);
  // WHAT IS HAPPENING ON IT, for the Status column. `inProgress` is the tab
  // this row is drawn under: the words about agents waiting their turn are
  // only ever true there, which is the gate live-line has always had.
  const fleet = useContext(FleetContext);
  const status = statusCell(item, { ...factsFor(fleet, item.id), inProgress: tab === 'progress', now, practice: !!product?.practice });
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
  // A run on this Mac the cloud could take: moving it is the press that matters now.
  const mover = useContext(MoveToCloudContext);
  const action = mover?.ids.has(item.id) ? (
    <button type="button" className="th-row-act" onClick={(e) => { e.stopPropagation(); mover.move(item.id, item.product); }} title="Carry on in the cloud">
      <CloudIcon />Move to cloud
    </button>
  ) : seen ? (
    <button type="button" className="th-row-act" onClick={(e) => { e.stopPropagation(); void flip(); }}
      title={seen === 'private' ? 'Show this thread to the team' : 'Stop showing this thread'}>
      <SharedMark className="th-row-act-mark" />{seen === 'private' ? 'Share' : 'Unshare'}
    </button>
  ) : undefined;
  // A CONVERSATION WITH A PERSON READS LIKE A MESSAGE, showing who it is
  // with: their face and name lead the row, then the
  // newest message, the way a chat list does. Every other row keeps its title.
  // AND IT SAYS WHAT IS WAITING ON YOU when the chat has threads (w-920461cbe6),
  // which is why it is handed your teammates' first names.
  const said = messageLine(item, product, team?.me ?? null, (id) => firstName(team?.byId.get(id) ?? null));
  if (said) {
    return <RowCells status={status} title={<MessageTitle people={said.people} fromMe={said.fromMe} text={said.text} />} pinned={!!item.pinned && item.status !== 'done'} where="Message" person={person}
      priority={messagePriority(item)} updatedAt={when} when={back} now={now} action={action} />;
  }
  // ONLY THE UNUSUAL CASE WEARS A MARK (2026-10-02). Shared with the team is
  // the default, so it carries nothing; the lock is on a thread only you can
  // see, and the people mark with its count on one a few chosen people see.
  // Neither depends on whose faces are lit at the top of the page: a mark that
  // comes and goes with an unrelated control cannot be read. Both follow the
  // click at once, the way the Share button does.
  const lock = seen === 'private';
  // AND HOW MANY TASKS IT FILED STILL WAIT FOR A YES (w-d2744c6daa), in the
  // faint words a repeating task uses for its schedule: "a little bit of text
  // that gives you extra information if you need to know."
  // "waiting for a free agent" came off this aside on the merge (w-ec2b04d449):
  // the Status column says Queued on exactly those rows, and one fact in two
  // places on one row is what the column was drawn to end. `FreeAgentContext`
  // is untouched and still decides whether the cloud offers itself.
  return <RowCells status={status} lead={<TeammateLead item={item} />} title={rowTitle(item)} aside={toApproveWords(waiting.get(`${item.product}/${item.id}`))} shared={seen === 'people'} chosen={chosen} lock={lock} held={notStarted(item)} pinned={!!item.pinned && item.status !== 'done'} where={product?.name ?? ''} person={person}
    priority={shownPriority(item)} updatedAt={when} when={back} now={now} action={action} />;
}

/* ------------------------------------------------------------ the board */
// THE TEAM PAGE THAT STOOD HERE IS GONE (w-05ff3d1438): its Everyone picker
// became the faces on the Inbox's tab bar, and its board is the one below.
/** THE PAGE AS A BOARD, when the Display says Board: your threads and, once
 *  you pick them, your teammates' (w-05ff3d1438). Every thread of yours is on
 *  it, the private ones included; with a teammate in view, those wear a lock
 *  and every card names its person. Whose threads is picked on the header's
 *  filters button (w-14bb56c833), so the columns start right under it. */
export function InboxBoard({ items, products, display, now, onOpenItem, stateOf, cards = [], picked, onOpenCard, selected, selectedCard = null, columnOrder = DEFAULT_COLUMN_ORDER, onReorderColumns, projectOrder, onPlaces, marked, onMark }: {
  items: WorkItem[]; products: Product[]; display: Display; now: number; onOpenItem: (item: WorkItem) => void;
  /** The column each thread sits in, by the Inbox tabs' rule (App.tsx). */
  stateOf?: (item: WorkItem) => ThreadStateWord | null;
  cards?: ThreadCard[]; picked?: string[]; onOpenCard?: (card: ThreadCard) => void;
  /** The thread the keyboard is on (App.tsx's `current`), drawn as selected. */
  selected?: WorkItem | null;
  /** Or the teammate's card it is on, by `stopKey` (walk-rules.ts, w-fb16bcaeba). */
  selectedCard?: string | null;
  /** The columns left to right, and where a dragged order goes to be kept. */
  columnOrder?: ThreadStateWord[]; onReorderColumns?: (order: ThreadStateWord[]) => void;
  /** Your running order of projects, which Sort by Priority reads first. */
  projectOrder?: string[];
  /** Where a card dragged up or down its column goes to be kept
   *  (w-6e5b532a95). Absent where the order is not yours to set. */
  onPlaces?: (places: Record<string, number>, dropped: string, pin?: boolean | null) => void;
  /** The threads picked for a bulk command (App.tsx's `multiSel`), and where a
   *  new pick goes: ⌘- or Shift-click on a card, or a box dragged across the
   *  board's empty space (board-select.ts, w-2e3819913c). */
  marked?: ReadonlySet<string>; onMark?: (ids: Set<string>) => void;
}) {
  const liveIds = useContext(LiveContext);
  const cloudIds = useContext(CloudContext);
  const fleet = useContext(FleetContext);
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
    () => boardColumns({ items, products, display, now, stateOf, cards, picked, me, since, live: liveIds, order: shown, projectOrder, nameOf: (id) => firstName(personOf(team, id)) }),
    [items, products, display, now, stateOf, cards, picked, me, since, liveIds, shown, projectOrder, team],
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
  // A CARD CARRIED UP OR DOWN ITS OWN COLUMN (w-6e5b532a95) keeps that place,
  // worked out by the same rule as a row in the list. Not across columns: a
  // column is a thread's state, and dragging does not change what state is.
  const direct = useMemo(() => conversationSlugs(products), [products]);
  const cardDrag = useRowDrag(onPlaces ? (id, beforeId, drawn) => {
    const col = columns.find((c) => c.rows.some((e) => e.item?.id === id));
    if (!col) return;
    // In the order the cards were drawn, so the neighbours are the two the gap was between.
    const byId = new Map(col.rows.filter((e) => e.item).map((e) => [e.item!.id, e]));
    const rows = drawn.flatMap((d) => { const e = byId.get(d); return e ? [{ id: d, score: entryScore(e, projectOrder, direct), pinned: !!e.item?.pinned }] : []; });
    // Across the line between pinned and the rest, it pins or unpins too (w-20323283e6).
    const { places, pin } = dropWithPins(rows, id, beforeId);
    if (places) onPlaces(places, id, pin);
  } : undefined, 'copy');
  const sharing = (it: WorkItem) => rowSharing(it, products.find((p) => p.slug === it.product), team ? { me, since } : null);
  const isSelected = (e: BoardEntry) => (e.card
    ? selectedCard === stopKey({ card: e.card })
    : !selectedCard && !!e.item && !!selected && e.item.id === selected.id && e.item.product === selected.product);
  // The card you are on, if it is one of yours on this board: the first Shift-
  // or ⌘-click takes it into the pick (board-select.ts `clickMarks`).
  const cursorId = !selectedCard && selected && columns.some((c) => c.rows.some((r) => !!r.item && isSelected(r))) ? selected.id : null;
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
  }, [selected?.id, selected?.product, selectedCard]);
  // A BOX DRAGGED ACROSS THE BOARD'S EMPTY SPACE PICKS EVERY CARD IT CROSSES
  // (w-2e3819913c): "highlight the background, just like in PowerPoint". It is
  // measured in the board's own coordinates, so the board scrolling under the
  // pointer cannot throw it off, and the pick follows the box as it is drawn.
  // A press that barely moves is a click on empty space, which clears the pick.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [band, setBand] = useState<Box | null>(null);
  const markNow = useRef(onMark);
  markNow.current = onMark;
  const startBand = (e: ReactPointerEvent) => {
    // A finger on the ground scrolls the board; the preventDefault below
    // would stop that scroll outright (2026-10-12).
    if (e.pointerType === 'touch') return;
    if (!onMark || e.button !== 0) return;
    // Cards open and headings carry their column; only the ground draws a box.
    if ((e.target as Element).closest('.th-card, .th-col-h, button, a, input, textarea')) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    e.preventDefault();
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = wrap.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const start = at(e);
    const before = new Set(marked ?? []);
    const add = e.shiftKey || e.metaKey || e.ctrlKey;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = at(ev);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 4) return;
      moved = true;
      const b = marqueeBox(start, p);
      setBand(b);
      const r = wrap.getBoundingClientRect();
      const under = [...wrap.querySelectorAll<HTMLElement>('[data-board-id]')].map((el) => {
        const c = el.getBoundingClientRect();
        return { id: el.dataset.boardId ?? '', box: { left: c.left - r.left, top: c.top - r.top, right: c.right - r.left, bottom: c.bottom - r.top } };
      });
      markNow.current?.(marqueeMarks(before, cardsUnder(b, under), add));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', stop);
      setBand(null);
    };
    const up = () => { stop(); if (!moved && !add && before.size) markNow.current?.(new Set()); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', stop);
  };
  return <div className={`list hm-me th-board-wrap${band ? ' banding' : ''}`} ref={wrapRef} onPointerDown={startBand}>
    {band && <div className="th-band" aria-hidden="true" style={{ left: band.left, top: band.top, width: band.right - band.left, height: band.bottom - band.top }} />}
    <div className={`th-board${dragging ? ' dragging' : ''}`} ref={boardRef}>
    {columns.map((col) => {
      const rows = col.rows;
      const movable = !!onPlaces && col.state !== 'done' && col.state !== 'running' && display.sort === 'priority';
      return <div key={col.state} className={`th-col${dragging === col.state ? ' lifted' : ''}`} data-drag-scope=""
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
        {/* ⌘- or Shift-click adds the card to the pick or takes it away
            (board-select.ts); a plain click opens it, as before. A teammate's
            card is never picked: no bulk command can act on their thread. */}
        {/* While anything is picked a card is filled or plain, never just
            outlined: the keyboard's edge beside the fill read as "not picked"
            on a card that was (w-2e3819913c, 2026-10-07). */}
        {rows.map((e) => {
          const pick = !!e.item && !!onMark;
          const on = pick && !!marked?.has(e.item!.id);
          const edge = isSelected(e) && !marked?.size;
          // A teammate's card carries their summary and never our agents.
          const status = e.item ? statusCell(e.item, { ...factsFor(fleet, e.item.id), state: e.state, inProgress: e.state === 'running', now, practice: !!products.find((p) => p.slug === e.item!.product)?.practice }) : null;
          const seen = e.item ? sharing(e.item) : null;
          const who = seen === 'people' ? <SharedMark label="Visible to the people on it" /> : seen === 'private' ? <LockMark /> : null;
          const pin = e.item?.pinned && e.item.status !== 'done' ? <PinMark size={13} className="th-pin" /> : null;
          const marks = who || pin ? <>{who}{pin}</> : null;
          return <button type="button" key={e.key} className={`th-card${edge ? ' selected' : ''}${on ? ' picked' : ''}`}
          {...(pick ? { 'data-board-id': e.item!.id, 'aria-pressed': on } : {})}
          // A plain press and a pull up or down carries the card to a new
          // place in its column (w-6e5b532a95); ⌘ or Shift never starts one.
          {...(movable && e.item ? { 'data-drag-id': e.item.id, onPointerDown: (ev: ReactPointerEvent<HTMLButtonElement>) => cardDrag.onPointerDown(e.item!.id, ev) } : {})}
          onClick={(ev) => {
            if (cardDrag.swallowsClick()) return;
            if (pick && cardClickIntent({ shift: ev.shiftKey, meta: ev.metaKey, ctrl: ev.ctrlKey }) === 'toggle') {
              onMark!(clickMarks(marked ?? new Set(), e.item!.id, cursorId));
              return;
            }
            if (e.item) onOpenItem(e.item); else if (e.card) onOpenCard?.(e.card);
          }}>
          <div className="t">{e.item && <TeammateLead item={e.item} />}{e.message
            ? <MessageTitle people={e.message.people} fromMe={e.message.fromMe} text={e.title ?? ''} mark={pin} />
            : <TitleThenMark title={e.title ?? ''} mark={marks} />}
          </div>
          {/* WHAT IS HAPPENING ON IT, INSIDE THE CARD (w-ec2b04d449). A board
              is a board: nothing goes between the cards, and the column says
              the state over all of them, so the word is drawn on the card
              exactly where it says something the column does not (saysOnCard).
              It takes the running mark's place on the card's own line, and the
              "waiting" chip beside the project with it: Queued is the same
              fact in the place every card now says it. */}
          <div className="m">{status && saysOnCard(status, e.item!, e.state)
            ? <span className="s"><StatusMark status={status} />{status.word}</span>
            : e.live && <RunningMark cloud={!!e.item && cloudIds.has(e.item.id)} />}{e.priority !== null && <PriorityMark id={priorityIdOf(e.priority)} />}<span className="p">{e.project}</span>
            {withOthers && <Face person={personOf(team, e.ownerId)} me={e.ownerId === me} />}</div>
        </button>;
        })}
        {col.state === 'running' && <CloudOfferCard />}
      </div>;
    })}
  </div></div>;
}
