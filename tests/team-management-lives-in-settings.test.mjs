// TEAM MANAGEMENT MOVED INTO SETTINGS (w-8415594d19, 2026-10-01).
//
// The rule: the Team members page leaves the sidebar, Invite people stays,
// and team management is a page in Settings that Invite people routes to as a
// shortcut.
//
// So the foot of the sidebar had two team buttons where it now has one. What a
// later edit could silently undo, and what this file pins:
//   - Team members is gone from the sidebar, in every state and either width;
//   - Invite people stays, and is the row that lights while the Settings Team
//     pane is up, because it is a shortcut INTO that pane;
//   - Settings has a Team row and a Team pane, and shows neither when the app
//     was built without the team cloud (the pane is handed in, so the shared
//     Settings screen keeps no team code of its own);
//   - Invite people opens Settings on that pane with the cursor in the email
//     box, and your own row at the foot opens the same pane without it;
//   - everything the old page could do is still on the pane: rename the team,
//     see roles, remove people, cancel invites, invite by email, leave.
//
// INVITE PEOPLE LEFT THE SIDEBAR ON 2026-10-04 (w-1b574413db): "we're in
// single-player mode for what we're going to launch soon." So the foot is
// Feedback, Instructions, Settings, every Settings pane lights Settings, and
// `onInvite` survives as the door your account menu uses. The sidebar half of
// that is pinned in the-sidebar-opens-feedback-and-has-no-invite-row.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const settings = read('renderer/src/components/Settings.tsx');
const teamPage = read('renderer/src/team/TeamPage.tsx');

const noop = () => {};
const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop, ...extra,
}));

// A made-up person on a made-up team. Nothing here is anyone's real details.
const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
const onATeam = { configured: true, signedIn: true, me, team: { id: 't-1', name: 'Northwind' }, people: [me], cards: [], lastSyncAt: null, error: null };

// One whole <button>...</button>, found by a piece of text inside its opening tag.
const buttonWith = (html, marker) => {
  const at = html.indexOf(marker);
  if (at < 0) return '';
  const start = html.lastIndexOf('<button', at);
  return html.slice(start, html.indexOf('</button>', at) + '</button>'.length);
};

describe('the sidebar has neither Team members nor Invite people', () => {
  const full = { team: onATeam, hasTeam: true, onTeam: noop, onInvite: noop, onAccount: noop, onInstructions: noop, onSettings: noop, onFeedback: noop };

  it('has no Team members button for someone signed in to a team', () => {
    expect(draw(full)).not.toContain('Team members');
  });

  it('has no Team members button in the collapsed rail either', () => {
    expect(draw({ ...full, collapsed: true })).not.toContain('Team members');
  });

  it('offers no Invite people row, even with a way to open it', () => {
    expect(draw(full).split('class="th-me"')[0]).not.toContain('Invite people');
  });

  it('keeps the foot in order: Feedback, Instructions, Settings', () => {
    const html = draw(full);
    const order = ['Feedback', 'Instructions', 'Settings'].map((l) => html.indexOf(`aria-label="${l}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('lights Settings on every Settings pane, the Team pane included', () => {
    const html = draw({ ...full, page: 'settings' });
    expect(buttonWith(html, 'aria-label="Settings"')).toContain('aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('still opens your own account row, and names it', () => {
    expect(buttonWith(draw(full), 'aria-label="Your account"')).toContain('th-me-btn');
  });
});

describe('Settings has the Team pane, and the shared screen holds no team code', () => {
  it('takes the pane as something handed in, not imported', () => {
    expect(settings).not.toMatch(/from '\.\.\/team\//);
    expect(settings).toContain('teamPane?: ReactNode');
  });

  it('has a Team row in the Workspace group, only when the pane exists', () => {
    // The menu lives in settings-search.ts since the redraw (w-ccadd13c46);
    // the screen leaves Team out when no pane was handed in.
    expect(read('renderer/src/settings-search.ts')).toContain("{ id: 'team', label: 'Team', group: 'Workspace' }");
    expect(settings).toContain("(p.id !== 'team' || !!teamPane)");
  });

  it("answers ?settings=team and the sidebar's shortcut with the Team pane", () => {
    expect(settings).toMatch(/want === 'team'/);
    expect(settings).toContain("pane === 'team'");
  });

  it('reports team as the open section, so the sidebar can light the shortcut', () => {
    // Every page but General reports itself (w-ccadd13c46), Team included.
    expect(settings).toContain("pane === 'general' ? null : pane");
  });
});

describe('Invite people, from the account menu, routes into Settings', () => {
  it('opens Settings on the Team pane with the cursor in the email box', () => {
    expect(app).toContain("onInvite={() => { setTeamOpen(false); setOpenCard(null); closeSearch(); setFocused(null); setInviteFocus(true); setSettingsPane('team'); setSettingsVisit((n) => n + 1); setSettingsOpen(true); }}");
  });

  it('opens the same pane from your own row, without the cursor', () => {
    expect(app).toContain("onAccount={() => { setTeamOpen(false); setOpenCard(null); closeSearch(); setFocused(null); setInviteFocus(false); setSettingsPane('team'); setSettingsVisit((n) => n + 1); setSettingsOpen(true); }}");
  });

  it('lights Settings while that pane is up, since the shortcut row is gone', () => {
    expect(app).toContain("page={settingsOpen ? 'settings' : null}");
  });

  it('hands Settings the team pane only when the team cloud is configured', () => {
    expect(app).toMatch(/teamPane=\{snap\?\.team\?\.configured/);
    expect(app).toContain('<TeamPage team={snap?.team} inviteFocus={inviteFocus} />');
  });

  it('titles the Settings screen Team while that pane is up', () => {
    expect(app).toContain("settingsPage === 'team' ? 'Team'");
  });

  it('keeps no members page of its own', () => {
    expect(app).not.toContain('membersOpen');
    expect(app).not.toContain('Team members');
  });
});

describe('the pane can do everything the page could', () => {
  it.each([
    ['rename the team', 'api.teamRename'],
    ['show a role', "'owner'"],
    ['remove someone', 'api.teamRemoveMember'],
    ['cancel an invite', 'api.teamCancelInvite'],
    ['invite by email', 'api.teamInvite'],
    ['leave', 'api.teamLeave'],
  ])('can %s', (_what, call) => {
    expect(teamPage).toContain(call);
  });
});
