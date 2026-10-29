import { useRef, useState, type ReactNode } from 'react';
import { SettingsIcon } from './SettingsIcon';
import type { TeamState, View } from '../types';
import { Face } from '../team/people';
import { Name } from '../../../shared/product-name.mjs';
import { SidebarIcon } from './SidebarIcon';
import { AppMark } from './AppMark';
import { SidebarMove, SidebarUpdate } from './SidebarUpdate';
import { changeLines, closedHere, readMoveClosed, readUpdateClosed, writeMoveClosed, writeUpdateClosed } from '../update-row';
import { AccountMenu } from '../team/account-menu';
import type { Invisible } from '../team/rooms/GoInvisible';
import { caps, chord } from '../this-keyboard';

// The search glass drawn at the sidebar's stroke, like Feedback's plane.
function SearchGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true"><g transform="translate(12 12) scale(.8) translate(-12 -12)" strokeWidth="1.5625"><circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6 20 20"/></g></svg>;
}
/** ONE NUMBER IN THE SIDEBAR, ON INBOX, AND IT IS DRAWN IN THE TAB'S OWN TYPE.
 *
 *  w-5f02e7b525. Only Inbox shows a number, like a classic email client, and of
 *  the four versions drawn, C2 (the number set in exactly the label's type) was
 *  the one merged.
 *
 *  A number says "this many things are waiting for you", and Inbox is the only
 *  tab in this app where that is true. In progress and Scheduled are both lists
 *  of work she does not have to touch, so a number on them counted what to
 *  ignore, in the place her eye goes first.
 *
 *  IT ALSO ENDS A NUMBER THAT WAS NEVER THE ONE IT LOOKED LIKE. The In progress
 *  badge was `supervisor.running.length`, agents alive, while the page under it
 *  lists the rows she has spoken to. Two facts, one label, nothing on the screen
 *  saying which. Measured over a real store in one evening: 13 against 7 rows,
 *  then 12 against 3, then 11 against 18. It was both higher and lower than its
 *  own page within three hours. Whatever replaces that signal, it is not a
 *  number on a tab it does not describe.
 *
 *  WHAT IS NOT CHANGED, AND IT IS THE HALF SHE ASKED FOR THE DAY BEFORE
 *  (w-4e8396ed5b, 2026-09-21): Scheduled still appears only when something is
 *  actually scheduled, and still sits after In progress. `scheduledCount` is
 *  kept for exactly that and no longer draws anything.
 *
 *  THE TYPE IS THE LABEL'S, WHICH IS THE WHOLE OF C2. At 11px and full ink the
 *  number looked wrong on a deselected tab, where it should match the font of
 *  the deselected word Inbox. So the number inherits the button's colour and weight
 *  and takes the label's 13px, in both states (workspace-navigation.css). On a
 *  deselected tab that is --text-faint at 400, exactly the word Inbox beside it;
 *  on the active one it is --text at 500. There is one rule rather than two.
 */
export function WorkspaceNavigation({ view, collapsed, onView, onSearch: _onSearch, onCompose: _onCompose, inboxCount = 0, scheduledCount: _scheduledCount = 0, usage, onSettings, onInstructions, page: pageIn, hasTeam = false, onTeam, teamPage = false, team = null, onInvite, onAccount, onSignIn, onFeedback, onSignOut, update = null, onUpdate, move = null, onMove, invisible = null, inboxLabel = 'Threads', onPalette, rail = false, onHover, groups = null, onGroupsPage = false, onTeammatesPage = false }: {
  /** Whether one of the teammates' pages is up, which unlights Threads. */
  onTeammatesPage?: boolean;
  /** The first row's name: Threads, or Inbox while its page holds groups too. */
  inboxLabel?: string;
  /** Opens ⌘K, which finds threads and commands both. */
  onPalette?: () => void;
  /** Narrow, and wide only while pointed at, with no way to pin it open (w-dcaa2c122e). False on a phone. */
  rail?: boolean; onHover?: (on: boolean) => void;
  /** The row under the first one, Groups or Chats, and whether a group is the page, which unlights it. */
  groups?: ReactNode; onGroupsPage?: boolean;
  // ROOMS (alpha): going invisible from your account menu.
  invisible?: Invisible | null;
  // A NEW VERSION WAITING (SidebarUpdate.tsx). Null when there is none.
  // `version` is what its × closes, until a newer one arrives.
  update?: { installing: boolean; version?: string | null; changes?: string[]; behind?: number | null; error?: string | null } | null; onUpdate?: () => void;
  // OR A COPY THAT CANNOT UPDATE ITSELF FROM WHERE IT IS (SidebarMove, and
  // shared/where-it-runs-from.mjs). Null on every copy that can, which is
  // nearly all of them. `place` is what its × closes.
  move?: { place: string | null; error?: string | null } | null; onMove?: () => void;
  page?: string | null; inboxCount?: number; scheduledCount?: number; usage?: ReactNode; onSettings?: () => void; onInstructions?: () => void;
  // THE TEAM TAB. No people and no counts here: approved 2026-09-30, a list of
  // who is busy is not worth seeing all the time, and the Team page is where
  // you look.
  hasTeam?: boolean; onTeam?: () => void;
  // Whether the Team page is up, which lights its tab and darkens the others.
  teamPage?: boolean;
  // THE FOOT OF THE SIDEBAR (approved 2026-10-01): settings and you, in the
  // sidebar rather than on a page. Feedback joined it on 2026-10-04 and opens
  // the feedback card.
  //
  // `onInvite` opens Settings on the team pane with the cursor in the email
  // box. It is no longer a row here (w-1b574413db: single-player for launch);
  // your account menu still offers it. `onAccount` is your own row, which
  // opens the same pane without the cursor in the email box.
  team?: TeamState | null; onInvite?: () => void; onAccount?: () => void; onSignIn?: () => void; onFeedback?: () => void;
  // The last row of your account menu.
  onSignOut?: () => void;
  // `collapsed` is true while the sidebar is narrow, which is always on a phone.
  view: View; collapsed: boolean; onView: (view: View) => void; onSearch: () => void; onCompose: () => void;
}) {
  // The Team page is a page like Settings: while it is up no list tab is lit.
  const page = pageIn ?? (teamPage ? 'team' : null);
  // The version whose card was closed with its × (SidebarUpdate.tsx).
  const [updateClosed, setUpdateClosed] = useState(() => readUpdateClosed());
  const closeUpdate = () => { const version = update?.version ?? ''; setUpdateClosed(version); writeUpdateClosed(globalThis.localStorage, version); };
  const showUpdate = !!update && !!onUpdate && !closedHere(update, updateClosed);
  // The rail widens under the pointer, so the card there stays in the row's
  // place in the foot list and grows upward (SidebarUpdate.tsx, `RailCard`).
  const asRow = collapsed || rail;
  const updateCard = showUpdate && !asRow;
  const updateView = showUpdate && update && onUpdate && <SidebarUpdate installing={update.installing} changes={changeLines(update)} error={update.error ?? null}
    collapsed={collapsed} rail={rail} onRestart={onUpdate} onClose={closeUpdate} />;
  // THE MOVE CARD STANDS WHERE THE UPDATE CARD WOULD, and never both: a
  // version on the disk is the news, and a copy that cannot update itself
  // never has one. The place whose card was closed is kept under its own key.
  const [moveClosed, setMoveClosed] = useState(() => readMoveClosed());
  const closeMove = () => { const place = move?.place ?? ''; setMoveClosed(place); writeMoveClosed(globalThis.localStorage, place); };
  const showMove = !showUpdate && !!move && !!onMove && moveClosed !== (move.place ?? '');
  const moveCard = showMove && !asRow;
  const moveView = showMove && move && onMove && <SidebarMove place={move.place} error={move.error ?? null}
    collapsed={collapsed} rail={rail} onMove={onMove} onClose={closeMove} />;
  const waiting = Number.isFinite(inboxCount) ? Math.max(0, Math.floor(inboxCount)) : 0;
  const waitingDescription = `${waiting} ${waiting === 1 ? 'thread' : 'threads'} waiting`;
  // ONE PAGE OF YOUR THREADS (approved 2026-10-01). In progress, Scheduled and
  // Closed are tabs on the Inbox now, not places in the sidebar, so the Inbox
  // tab is lit on every one of them.
  const inboxLit = !page && !onGroupsPage && !onTeammatesPage && (['inbox', 'progress', 'snoozed', 'done'] as string[]).includes(view);
  // A pointer passing over on its way somewhere else does not open it.
  const hoverAt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hover = rail && onHover ? {
    onMouseEnter: () => { hoverAt.current = setTimeout(() => onHover(true), 140); },
    onMouseLeave: () => { if (hoverAt.current) clearTimeout(hoverAt.current); hoverAt.current = null; onHover(false); },
  } : {};
  const me = team?.signedIn ? team.me : null;
  const teamName = team?.team?.name ?? Name;
  // A team wears its initial. With no team the corner names the app itself, so
  // it wears the Agentbox icon rather than a letter A.
  const mark = team?.team?.name
    ? <span className="th-mark" aria-hidden="true">{teamName.slice(0, 1).toUpperCase()}</span>
    : <span className="th-mark th-mark-app" aria-hidden="true"><AppMark size={12} /></span>;
  // THE BOTTOM-LEFT CORNER, AND IT IS NULL WHEN THERE IS NOBODY TO PUT IN IT.
  //
  // YOUR OWN ROW IS ONE BUTTON, face, name and email, and it opens your account
  // menu upward (w-a09476712f): what you are up to, Invite people, Settings and
  // Sign out. Clicking it used to open a page with Sign out somewhere on it, and
  // "I tried clicking my profile area ... expecting a sign out or somthing and
  // nothing."
  //
  // WITH NOBODY TO SHOW, NOTHING IS DRAWN AT ALL (w-b59cbe3154, 2026-10-05).
  // This used to fall through to an empty `<span />`, and `.th-me` carries its
  // own 46px height and a hairline above it, so a Mac with no team cloud and
  // nobody signed in ended on a divider with 46 points of nothing under it:
  // "There's just this empty space in the bottom-left corner because it doesn't
  // have data on the user." Five things that could sit there were drawn and she
  // picked nothing at all, so Settings is the last row. The element is absent
  // rather than hidden with `:empty`, which is what lets the foot's own
  // `:last-child` rule close the gap under Settings (workspace-navigation.css).
  const corner = me
    ? (onAccount
      ? <AccountMenu me={me} now={Date.now()} collapsed={collapsed} onAccount={onAccount} onInvite={onInvite} onSettings={onSettings} onSignOut={onSignOut} invisible={invisible} />
      : <><Face person={me} me /><span>{me.name || me.email}<small>{me.email}</small></span></>)
    : team?.configured && onTeam
      ? <button type="button" className="th-me-signin" aria-label="Sign in to your team" onClick={onTeam}>Sign in to your team</button>
      : null;
  return <aside className={`workspace-navigation${rail ? ' gt-rail-nav' : ''}`} aria-label="Workspace" {...hover}>
    <div className="th-team" title={collapsed ? undefined : teamName}>
      {mark}<span className="th-team-name">{teamName}</span>
    </div>
    <nav className="workspace-tabs" aria-label="Threads">
      <button data-tab="inbox" className={`workspace-tab${inboxLit ? ' active' : ''}${waiting > 0 ? ' has-count' : ''}`} aria-label={inboxLabel} aria-current={inboxLit ? 'page' : undefined} title={waiting > 0 ? `${inboxLabel} · ${waitingDescription}` : collapsed ? inboxLabel : undefined} onClick={() => onView('inbox')}><SidebarIcon view="inbox" /><span>{inboxLabel}</span>{waiting > 0 && <small className="workspace-running" aria-label={waitingDescription}>{waiting}</small>}</button>
      {onPalette && <button data-tab="palette" className="workspace-tab" aria-label="Search" title={`Search · ${chord('⌘K')}`} onClick={onPalette}><SearchGlyph /><span>Search</span><small className="workspace-keys" aria-hidden="true">{caps('⌘K').map((c) => <kbd key={c}>{c}</kbd>)}</small></button>}
      {/* THERE IS NO TEAM TAB (w-05ff3d1438, 2026-10-01). The Team page and
          the Inbox were one question on two pages, so they are one page: the
          faces at the end of the Inbox's tab bar pick whose threads are on
          it. `onTeam` is still the sign-in link at the foot. */}
    </nav>
    {groups}
    <div className="workspace-bottom">
      {/* The card sits above the foot list; with the sidebar shut it is a
          row inside it (SidebarUpdate.tsx). */}
      {updateCard && updateView}
      {moveCard && moveView}
      <div className="workspace-utilities th-side-foot">
        {!updateCard && updateView}
        {!moveCard && moveView}
        {/* THE SIDEBAR NEVER SAYS WHICH PLAN YOU ARE ON (w-e217e577e5,
            2026-10-07, and this is a standing rule rather than one round's
            taste). A row reading "Claude · Max 20x" shipped here for a few
            hours and came straight back out, in her words: "we have to get rid
            of this. It should never say that on the sidebar."

            What the row was answering is real and is NOT this: a new user ran
            an agent and thought "where are the tokens coming from? I didn't
            even connect my account." That is a question somebody asks ONCE, on
            their first day, and the answer belongs in the walk, where it is now
            (Onboarding.tsx, the folder screen). A permanent row is the wrong
            shape for a one-time surprise, and a plan tier printed on a glance
            surface for ever is billing detail in the corner of the eye.

            Nothing goes in this foot that is not a thing you press. */}
        {/* FEEDBACK, THE TOP ROW OF THE FOOT (w-1b574413db, 2026-10-04),
            wearing the folded paper plane picked from 24 drawings. It opens
            the feedback card over whatever is on screen, so it never lights.

            INVITE PEOPLE LEFT THE SIDEBAR THE SAME DAY: "we're in
            single-player mode for what we're going to launch soon." Inviting
            is still in your account menu and in Settings. */}
        {onSignIn && <button aria-label="Sign in" title="Sign in" onClick={onSignIn}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><g transform="translate(12 12) scale(.8) translate(-12 -12)" strokeWidth="1.5625"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/></g></svg><span>Sign in</span></button>}
        {onFeedback && <button aria-label="Feedback" title="Feedback" onClick={onFeedback}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><g transform="translate(12 12) scale(.8) translate(-12 -12)" strokeWidth="1.5625"><path d="M2.5 11.5 21.5 3l-5 18-5-6.5z"/><path d="M11.5 14.5 21.5 3"/><path d="m11.5 14.5-1.2 6 3-3.6"/></g></svg><span>Feedback</span></button>}
        {onInstructions && <button aria-label="Instructions" aria-current={page === 'instructions' ? 'page' : undefined} title="Instructions for every agent" onClick={onInstructions}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M6 3.5h8l4 4V20H6zM14 3.5V8h4M9 12h6M9 16h6"/></svg><span>Instructions</span></button>}
        {onSettings && <button aria-label="Settings" aria-current={page === 'settings' ? 'page' : undefined} title="Settings" onClick={onSettings}><SettingsIcon/><span>Settings</span></button>}
      </div>
      {usage && <div className="workspace-usage">{usage}</div>}
      {corner && <div className="th-me">{corner}</div>}
    </div>
  </aside>;
}
