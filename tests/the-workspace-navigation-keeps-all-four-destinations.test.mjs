// THE SIDEBAR AS APPROVED ON 2026-10-01 (w-e731ca9376), AND EVERY CONTROL ON IT
// STAYS REACHABLE IN EITHER WIDTH.
//
// The file name is older than the sidebar it now checks. Until 2026-10-01 this
// pinned four places in the sidebar (Inbox, In progress, Scheduled when
// something was scheduled, and Done) plus a search button and a New thread
// button. The redesign approved that day took all of that out on purpose:
// Needs you, Running, Scheduled, Done and All are tabs on the Inbox page
// (StateTabs in renderer/src/threads/Pages.tsx), and Search and New thread sit
// at the right end of the header (HeaderActions in the same file).
//
// What the sidebar is now, and what this file pins:
//   - the team's mark and name at the top, with the collapse toggle beside
//     them, at the top beside the company name as is standard (2026-10-01);
//     collapsed, the mark
//     itself is the toggle;
//   - one list tab, Inbox, lit on every list view, since every list is a tab
//     on the Inbox page, and not lit on the Team page, Settings or members;
//   - no Team tab, in any state (w-05ff3d1438, 2026-10-01): the Inbox and the
//     Team page were one question on two pages, so the faces on the Inbox's
//     tab bar pick whose threads are listed, and the sidebar keeps one list;
//   - at the foot, Invite people (only when signed in to a team),
//     Instructions, Settings, then the signed-in person's face, name and
//     email. Team members was there too until 2026-10-01 (w-8415594d19), when
//     team management moved into Settings and Invite people became the
//     shortcut into it: two rows opening one page is one row.
// The promise that survives from the old file is the accessible one: in the
// collapsed rail the words are hidden, so every button has to carry its name
// in an aria-label or it is a blank square.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';
import { Name } from '../shared/product-name.mjs';

const noop = () => {};
const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop, ...extra,
}));

// A made-up person on a made-up team. Nothing here is anyone's real details.
const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
const onATeam = { configured: true, signedIn: true, me, team: { id: 't-1', name: 'Northwind' }, people: [me], cards: [], lastSyncAt: null, error: null };
const signedInNoTeam = { ...onATeam, team: null };
const signedOut = { ...onATeam, signedIn: false, me: null, team: null };

// One whole <button>...</button>, found by a piece of text inside its opening tag.
const buttonWith = (html, marker) => {
  const at = html.indexOf(marker);
  if (at < 0) return '';
  const start = html.lastIndexOf('<button', at);
  return html.slice(start, html.indexOf('</button>', at) + '</button>'.length);
};
const inboxTab = (html) => buttonWith(html, 'data-tab="inbox"');

describe('one list tab, and it is lit wherever her threads are listed', () => {
  // approved 2026-10-01 (w-e731ca9376): In progress, Scheduled and Done are
  // tabs on the Inbox page now, so standing on any of them is standing in the
  // Inbox, and the one tab the sidebar has for them stays lit.
  it.each(['inbox', 'progress', 'snoozed', 'done', 'all'])('lights Inbox on the %s list', (view) => {
    const html = draw({ view });
    expect(inboxTab(html)).toContain('workspace-tab active');
    expect(inboxTab(html)).toContain('aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('lights nothing while the team setup page is up, since no tab leads there', () => {
    const html = draw({ teamPage: true, hasTeam: true, onTeam: noop });
    expect(inboxTab(html)).not.toContain('active');
    expect(inboxTab(html)).not.toContain('aria-current');
    expect(html).not.toContain('data-tab="team"');
  });

  it('lights Settings and not Inbox while Settings is open', () => {
    const html = draw({ page: 'settings', onSettings: noop });
    expect(inboxTab(html)).not.toContain('aria-current');
    expect(buttonWith(html, 'aria-label="Settings"')).toContain('aria-current="page"');
  });

  // THE MEMBERS PAGE IS GONE (w-8415594d19, 2026-10-01): team management is a
  // pane in Settings and Invite people is the shortcut into it, so the row
  // that lights while that pane is up is Invite people. The detail is pinned
  // in team-management-lives-in-settings.test.mjs.
  it('lights Invite people and not Inbox while the Settings team pane is open', () => {
    const html = draw({ page: 'invite', team: onATeam, onInvite: noop, hasTeam: true, onTeam: noop });
    expect(inboxTab(html)).not.toContain('aria-current');
    expect(buttonWith(html, 'data-tab="team"')).not.toContain('aria-current');
    expect(buttonWith(html, 'aria-label="Invite people"')).toContain('aria-current="page"');
  });

  it('draws none of the places and buttons that moved to the Inbox page and its header', () => {
    // approved 2026-10-01 (w-e731ca9376): the state tabs live on the Inbox
    // page, and Search and New thread live in the header. A second copy of any
    // of them here would be two doors to one room that can drift apart.
    const html = draw({ view: 'snoozed', scheduledCount: 4, onSettings: noop, onInstructions: noop });
    expect(html.match(/data-tab=/g)).toHaveLength(1);
    for (const gone of ['progress', 'snoozed', 'done', 'all']) expect(html).not.toContain(`data-tab="${gone}"`);
    expect(html).not.toContain('New thread');
    expect(html).not.toContain('Search');
    expect(html).not.toContain('workspace-create');
    expect(html).not.toContain('Active agents');
  });
});

describe('there is no Team tab', () => {
  // Before w-05ff3d1438 the first case drew one. Now no combination does: the
  // team is on the Inbox, behind the faces in its tab bar.
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])('with hasTeam=%s and a way to open it=%s, draws no Team tab', (hasTeam, withOnTeam) => {
    const html = draw({ hasTeam, team: onATeam, ...(withOnTeam ? { onTeam: noop } : {}) });
    expect(html).not.toContain('data-tab="team"');
    expect(html.match(/data-tab=/g)).toHaveLength(1);
  });
});

describe('the foot of the sidebar', () => {
  // ONE TEAM ROW, NOT TWO (w-8415594d19, 2026-10-01). Team members was the
  // same door as Invite people and left the sidebar; `onAccount` is your own
  // row at the bottom, which opens the same Settings pane.
  const both = { onInvite: noop, onAccount: noop };

  it('offers Invite people to someone signed in to a team, and no members row', () => {
    const html = draw({ team: onATeam, ...both });
    expect(html).toContain('aria-label="Invite people"');
    expect(html).not.toContain('Team members');
  });

  // Signed in with no team yet, it is offered and opens the page that starts
  // one, because without it there was no way to reach the invite page (2026-10-01).
  it('offers it to someone signed in who is on no team yet', () => {
    const html = draw({ team: signedInNoTeam, ...both });
    expect(html).toContain('aria-label="Invite people"');
  });

  it.each([
    ['signed out', signedOut],
    ['with no team cloud at all', null],
  ])('offers neither when %s', (_, team) => {
    const html = draw({ team, ...both });
    expect(html).not.toContain('Invite people');
    expect(html).not.toContain('Team members');
  });

  it('offers neither when nothing is wired to open them, even on a team', () => {
    const html = draw({ team: onATeam });
    expect(html).not.toContain('Invite people');
    expect(html).not.toContain('Team members');
  });

  it('keeps Instructions and Settings at the foot, under the tabs, in that order', () => {
    const html = draw({ team: onATeam, ...both, onInstructions: noop, onSettings: noop, hasTeam: true, onTeam: noop });
    const foot = html.slice(html.indexOf('workspace-bottom'));
    const order = ['Invite people', 'Instructions', 'Settings'].map((l) => foot.indexOf(`aria-label="${l}"`));
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.indexOf('workspace-tabs')).toBeLessThan(html.indexOf('workspace-bottom'));
  });

  it('shows the signed-in person, name and email, and the toggle sits at the top instead', () => {
    const html = draw({ team: onATeam });
    const row = html.slice(html.indexOf('class="th-me"'));
    expect(row).toContain('Ada Lovelace');
    expect(row).toContain('<small>ada@example.test</small>');
    expect(row).not.toContain('workspace-toggle');
    expect(html.slice(0, html.indexOf('workspace-tabs'))).toContain('workspace-toggle');
  });

  it('offers to sign in instead when the team cloud is set up and nobody is signed in', () => {
    const html = draw({ team: signedOut, onTeam: noop });
    expect(html).toContain('Sign in to your team');
    expect(html).not.toContain('@example.test');
  });

  it('shows nobody when there is no team cloud at all', () => {
    const html = draw({ team: null });
    expect(html).not.toContain('Sign in to your team');
    expect(html).not.toContain('<small>');
  });
});

describe('the top of the sidebar', () => {
  it('carries the team name and its first letter as the mark', () => {
    const html = draw({ team: onATeam });
    const top = html.slice(0, html.indexOf('workspace-tabs'));
    expect(top).toContain('>N</span>');
    expect(top).toContain('>Northwind</span>');
  });

  // With no team the corner names the app, so it wears the app's icon (the
  // launch film's "On the grid" logo) rather than a letter (w-a514b58055).
  it('falls back to the app name and the app icon when there is no team', () => {
    const html = draw();
    const top = html.slice(0, html.indexOf('workspace-tabs'));
    expect(top).toContain(`>${Name}</span>`);
    expect(top).toContain('th-mark-app');
    expect(top).toMatch(/<img[^>]*class="product-mark app-mark"/);
    expect(top).not.toContain(`>${Name.slice(0, 1).toUpperCase()}</span>`);
  });
});

describe('every control keeps its name in either width', () => {
  it.each([false, true])('names every button with an aria-label when collapsed=%s', (collapsed) => {
    const html = draw({
      collapsed, team: onATeam, hasTeam: true, onTeam: noop, onInvite: noop, onAccount: noop,
      onInstructions: noop, onSettings: noop, inboxCount: 2,
    });
    const buttons = html.match(/<button[^>]*>/g);
    // Inbox, Invite people, Instructions, Settings, the toggle and your own
    // row (it opens your account). Team left with w-05ff3d1438, and Team
    // members with w-8415594d19.
    //
    // The seventh when the sidebar is open is the line under your name, which
    // opens the box you say what you are up to in (w-0b54ee983f). A collapsed
    // sidebar is icons only and that line is words, so it is not drawn there.
    expect(buttons).toHaveLength(collapsed ? 6 : 7);
    for (const b of buttons) expect(b).toMatch(/aria-label="[^"]+"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it.each([
    [false, 'Collapse sidebar'],
    [true, 'Expand sidebar'],
  ])('labels the toggle for what it will do when collapsed=%s', (collapsed, label) => {
    const toggle = buttonWith(draw({ collapsed }), 'workspace-toggle');
    expect(toggle).toContain(`aria-label="${label}"`);
    expect(toggle).toContain(`title="${label}"`);
    expect(toggle).toContain('data-hint="sidebar"');
  });

  // The tab is named Threads since w-05ff3d1438; its internal name is still inbox.
  it('titles the Threads tab in the collapsed rail, where its word is hidden', () => {
    expect(inboxTab(draw({ collapsed: true }))).toContain('title="Threads"');
    expect(inboxTab(draw({ collapsed: false }))).not.toContain('title=');
  });
});
