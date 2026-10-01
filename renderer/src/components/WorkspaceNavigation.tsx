import { sectionHint } from '../hint-plate';
import type { ReactNode } from 'react';
import { SettingsIcon } from './SettingsIcon';
import type { TeamState, View } from '../types';
import { Face } from '../team/people';
import { Name } from '../../../shared/product-name.mjs';
import { SidebarIcon } from './SidebarIcon';
import { SidebarToggleIcon } from './SidebarToggleIcon';
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
export function WorkspaceNavigation({ view, collapsed, onToggle, onView, onSearch: _onSearch, onCompose: _onCompose, inboxCount = 0, scheduledCount: _scheduledCount = 0, usage, onSettings, onInstructions, page: pageIn, hasTeam = false, onTeam, teamPage = false, team = null, onInvite, onMembers }: {
  page?: string | null; inboxCount?: number; scheduledCount?: number; usage?: ReactNode; onSettings?: () => void; onInstructions?: () => void;
  // THE TEAM TAB. No people and no counts here: approved 2026-09-30, a list of
  // who is busy is not worth seeing all the time, and the Team page is where
  // you look.
  hasTeam?: boolean; onTeam?: () => void;
  // Whether the Team page is up, which lights its tab and darkens the others.
  teamPage?: boolean;
  // THE FOOT OF THE SIDEBAR (approved 2026-10-01): invite people, the team's
  // members, settings, and you. Her words: "move it into the sidebar, along with
  // settings, team members, invite people, your profile".
  team?: TeamState | null; onInvite?: () => void; onMembers?: () => void;
  view: View; collapsed: boolean; onToggle: () => void; onView: (view: View) => void; onSearch: () => void; onCompose: () => void;
}) {
  // The Team page is a page like Settings: while it is up no list tab is lit.
  const page = pageIn ?? (teamPage ? 'team' : null);
  const waiting = Number.isFinite(inboxCount) ? Math.max(0, Math.floor(inboxCount)) : 0;
  const waitingDescription = `${waiting} ${waiting === 1 ? 'thread' : 'threads'} waiting`;
  // ONE PAGE OF YOUR THREADS (approved 2026-10-01). In progress, Scheduled and
  // Closed are tabs on the Inbox now, not places in the sidebar, so the Inbox
  // tab is lit on every one of them.
  const inboxLit = !page && (['inbox', 'progress', 'snoozed', 'done', 'all'] as string[]).includes(view);
  const me = team?.signedIn ? team.me : null;
  const teamName = team?.team?.name ?? Name;
  const onTeamNow = !!(team?.signedIn && team.team);
  return <aside className="workspace-navigation" aria-label="Workspace">
    {/* THE TOGGLE SITS BESIDE THE TEAM'S NAME, at the top, where sidebars keep
        it (her note, 2026-10-01). Collapsed, the mark itself is the way back
        open, and shows the sidebar icon under the pointer. */}
    <div className="th-team" title={collapsed ? undefined : teamName}>
      {collapsed ? (
        <button type="button" className="workspace-toggle th-mark-btn" data-hint="sidebar" aria-label="Expand sidebar" title="Expand sidebar" onClick={onToggle}>
          <span className="th-mark" aria-hidden="true">{teamName.slice(0, 1).toUpperCase()}</span>
          <span className="th-mark-open" aria-hidden="true"><SidebarToggleIcon collapsed /></span>
        </button>
      ) : <>
        <span className="th-mark" aria-hidden="true">{teamName.slice(0, 1).toUpperCase()}</span>
        <span className="th-team-name">{teamName}</span>
        <button type="button" className="workspace-toggle th-toggle" data-hint="sidebar" data-hint-align="right" aria-label="Collapse sidebar" title="Collapse sidebar" onClick={onToggle}><SidebarToggleIcon collapsed={false} /></button>
      </>}
    </div>
    <nav className="workspace-tabs" aria-label="Threads">
      <button data-tab="inbox" data-hint={sectionHint(1)} data-hint-text="span" className={`workspace-tab${inboxLit ? ' active' : ''}${waiting > 0 ? ' has-count' : ''}`} aria-label="Inbox" aria-current={inboxLit ? 'page' : undefined} title={waiting > 0 ? `Inbox · ${waitingDescription}` : collapsed ? 'Inbox' : undefined} onClick={() => onView('inbox')}><SidebarIcon view="inbox" /><span>Inbox</span>{waiting > 0 && <small className="workspace-running" aria-label={waitingDescription}>{waiting}</small>}</button>
      {hasTeam && onTeam && <button data-tab="team" className={`workspace-tab${page === 'team' ? ' active' : ''}`} aria-label="Team" aria-current={page === 'team' ? 'page' : undefined} title={collapsed ? 'Team' : undefined} onClick={onTeam}>
        <svg className="workspace-nav-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><circle cx="5.5" cy="5.5" r="2.2"/><path d="M1.8 13.2c.5-2.3 2-3.5 3.7-3.5s3.2 1.2 3.7 3.5"/><circle cx="11" cy="6" r="1.9"/><path d="M10.2 9.8c.3-.1.5-.1.8-.1 1.5 0 2.8 1 3.2 3.2"/></svg>
        <span>Team</span>
      </button>}
    </nav>
    <div className="workspace-bottom">
      <div className="workspace-utilities th-side-foot">
        {onTeamNow && onInvite && <button aria-label="Invite people" aria-current={page === 'invite' ? 'page' : undefined} title={collapsed ? 'Invite people' : undefined} onClick={onInvite}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20c.7-3.4 3.3-5.3 6.5-5.3 1.4 0 2.6.3 3.7.9"/><path d="M18 14v6M15 17h6"/></svg><span>Invite people</span></button>}
        {onTeamNow && onMembers && <button aria-label="Team members" aria-current={page === 'members' ? 'page' : undefined} title={collapsed ? 'Team members' : undefined} onClick={onMembers}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="9" cy="9" r="3.2"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7"/></svg><span>Team members</span></button>}
        {onInstructions && <button aria-label="Instructions" aria-current={page === 'instructions' ? 'page' : undefined} title="Instructions for every agent" onClick={onInstructions}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M6 3.5h8l4 4V20H6zM14 3.5V8h4M9 12h6M9 16h6"/></svg><span>Instructions</span></button>}
        {onSettings && <button aria-label="Settings" aria-current={page === 'settings' ? 'page' : undefined} title="Settings" onClick={onSettings}><SettingsIcon/><span>Settings</span></button>}
      </div>
      {usage && <div className="workspace-usage">{usage}</div>}
      <div className="th-me">
        {me ? <><Face person={me} me /><span>{me.name || me.email}<small>{me.email}</small></span></>
          : team?.configured && onTeam ? <button type="button" className="th-me-signin" aria-label="Sign in to your team" onClick={onTeam}>Sign in to your team</button>
            : <span />}
      </div>
    </div>
  </aside>;
}
