import { sectionHint } from '../hint-plate';
import type { ReactNode } from 'react';
import { SettingsIcon } from './SettingsIcon';
import type { View } from '../types';
import { SidebarIcon } from './SidebarIcon';
import { SidebarToggleIcon } from './SidebarToggleIcon';
import { SearchIcon } from './SearchIcon';
import { ComposeIcon } from './ComposeIcon';
import { workspaceDestinations } from '../workspace-navigation.mjs';
import { DONE } from '../done-word';
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
export function WorkspaceNavigation({ view, collapsed, onToggle, onView, onSearch, onCompose, inboxCount = 0, scheduledCount = 0, usage, onSettings, onInstructions, page, hasTeam = false, onTeam }: {
  page?: string | null; inboxCount?: number; scheduledCount?: number; usage?: ReactNode; onSettings?: () => void; onInstructions?: () => void;
  // THE TEAM TAB, the one thing the team version adds to the sidebar. No
  // people and no counts here: approved 2026-09-30, a list of who is busy is
  // not worth seeing all the time, and the Team page is where you look.
  hasTeam?: boolean; onTeam?: () => void;
  view: View; collapsed: boolean; onToggle: () => void; onView: (view: View) => void; onSearch: () => void; onCompose: () => void;
}) {
  const waiting = Number.isFinite(inboxCount) ? Math.max(0, Math.floor(inboxCount)) : 0;
  const waitingDescription = `${waiting} ${waiting === 1 ? 'task' : 'tasks'} waiting`;
  const scheduled = Number.isFinite(scheduledCount) ? Math.max(0, Math.floor(scheduledCount)) : 0;
  // The last tab's word is the button's (w-581dbc6cc4): both read `DONE`, so
  // they cannot disagree the way Close and Done did.
  const destinations = workspaceDestinations({ scheduledCount: scheduled, view, doneNoun: DONE.noun }) as [View, string][];
  // The one tab that carries a number, and the words a screen reader gets for it.
  const badgeOf = (key: View) => key === 'inbox' ? waiting : 0;
  const badgeWords = (_key: View) => waitingDescription;
  // CLOSED LIVES AT THE BOTTOM, WITH THE STACK (w-6c5534a58d, 2026-09-26). Inbox
  // and In progress sit at the top, and Closed joins the stack at the bottom.
  // The reason was clutter: Closed is not used often but is used enough to keep,
  // so it leaves the lists she works and joins the places she
  // visits. It is still a destination in `workspaceDestinations`, so Tab still
  // rotates through it and its hint keeps its slot number; only where it is
  // drawn moved. It keeps `data-tab` so anything looking for the tab finds it.
  //
  // SCHEDULED JOINED IT THE SAME DAY, AND SHORTCUTS LEFT. The top reads better
  // with only Inbox and In progress; Scheduled sitting third there looked worse.
  // The Shortcuts tab stopped mattering once shortcuts showed on hover, and
  // Scheduled is only visible when something is actually scheduled. So the bottom is
  // Scheduled (when it exists), Closed, Settings. The Shortcuts page is still in
  // Settings and in ⌘K.
  const BELOW: View[] = ['snoozed', 'done'];
  const tab =([key, label]: [View, string], slot: number) => <button key={key} data-tab={key} data-hint={sectionHint(slot + 1)} data-hint-text="span" className={`workspace-tab${!page && view===key ? ' active' : ''}${badgeOf(key) > 0 ? ' has-count' : ''}`} aria-label={label} aria-current={!page && view===key ? 'page' : undefined} title={badgeOf(key) > 0 ? `${label} · ${badgeWords(key)}` : collapsed ? label : undefined} onClick={()=>onView(key)}><SidebarIcon view={key}/><span>{label}</span>{badgeOf(key) > 0 && <small className="workspace-running" aria-label={badgeWords(key)}>{badgeOf(key)}</small>}</button>;
  const place = ([key, label]: [View, string], slot: number) => <button key={key} data-tab={key} data-hint={sectionHint(slot + 1)} data-hint-text="span" aria-label={label} aria-current={!page && view === key ? 'page' : undefined} title={collapsed ? label : undefined} onClick={() => onView(key)}><SidebarIcon view={key}/><span>{label}</span></button>;
  return <aside className="workspace-navigation" aria-label="Workspace">
    <button className="workspace-search" data-hint="search" data-hint-text="span" title="Search tasks (/)" aria-label="Search tasks" onClick={onSearch}><SearchIcon/><span>Search</span><kbd>/</kbd></button>
    <div className="workspace-section"><span>Workspace</span></div>
    <nav className="workspace-tabs" aria-label="Tasks">{destinations.map((d, slot) => BELOW.includes(d[0]) ? null : tab(d, slot))}
      {hasTeam && onTeam && <button data-tab="team" className={`workspace-tab${page === 'team' ? ' active' : ''}`} aria-label="Team" aria-current={page === 'team' ? 'page' : undefined} title={collapsed ? 'Team' : undefined} onClick={onTeam}>
        <svg className="workspace-nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><circle cx="5.5" cy="5.5" r="2.2"/><path d="M1.8 13.2c.5-2.3 2-3.5 3.7-3.5s3.2 1.2 3.7 3.5"/><circle cx="11" cy="6" r="1.9"/><path d="M10.2 9.8c.3-.1.5-.1.8-.1 1.5 0 2.8 1 3.2 3.2"/></svg>
        <span>Team</span>
      </button>}
    </nav>
    <div className="workspace-bottom">
      <div className="workspace-utilities">
        {/* Projects used to be the first row here (w-d19d6d387c). It came out
            because the row did not earn its place. Every project's page is still one click inside
            Settings, which has its own Projects entry. */}
        {destinations.map((d, slot) => BELOW.includes(d[0]) ? place(d, slot) : null)}
        {onInstructions && <button aria-label="Instructions" aria-current={page === 'instructions' ? 'page' : undefined} title="Instructions for every agent" onClick={onInstructions}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M6 3.5h8l4 4V20H6zM14 3.5V8h4M9 12h6M9 16h6"/></svg><span>Instructions</span></button>}
        {onSettings && <button aria-label="Settings" aria-current={page === 'settings' ? 'page' : undefined} title="Settings" onClick={onSettings}><SettingsIcon/><span>Settings</span></button>}
      </div>
      {usage && <div className="workspace-usage">{usage}</div>}
    <div className="workspace-footer"><button className="workspace-create" data-hint="new-task" title="New thread (N)" onClick={onCompose}><ComposeIcon/><span>New thread</span></button><button className="workspace-toggle" data-hint="sidebar" data-hint-align="right" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}><SidebarToggleIcon collapsed={collapsed}/></button></div>
    </div>
  </aside>;
}
