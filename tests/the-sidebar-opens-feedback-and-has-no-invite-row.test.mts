// FEEDBACK IS THE TOP ROW OF THE SIDEBAR'S FOOT, AND INVITE PEOPLE LEFT IT
// (w-1b574413db, 2026-10-04).
//
// Chosen over four rounds of drawings: a row named "Feedback", wearing the
// folded paper plane, first in the bottom section above Instructions and
// Settings. It opens the feedback card over whatever is on screen.
//
// The same day: "get rid of the invite people shortcut in the sidebar. We
// don't need that one because right now we're in single-player mode for what
// we're going to launch soon." So the sidebar draws no Invite people row in
// any state. Inviting is still reachable from your own account menu and from
// Settings, and the row that lights while the Settings team pane is up is
// Settings, since there is no shortcut row left to light instead.
//
// What this pins: the row, its place, its icon, that it is only drawn when
// something opens it, that it has a name in the collapsed rail, that the App
// wires it to the card, and that Invite people is gone from the sidebar in
// every state while the account menu keeps it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

const noop = () => {};
const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop, ...extra,
}));

// A made-up person on a made-up team. Nothing here is anyone's real details.
const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
const onATeam = { configured: true, signedIn: true, me, team: { id: 't-1', name: 'Northwind' }, people: [me], cards: [], lastSyncAt: null, error: null };
const signedInNoTeam = { ...onATeam, team: null };
const signedOut = { ...onATeam, signedIn: false, me: null, team: null };

const buttonWith = (html, marker) => {
  const at = html.indexOf(marker);
  if (at < 0) return '';
  const start = html.lastIndexOf('<button', at);
  return html.slice(start, html.indexOf('</button>', at) + '</button>'.length);
};
// The folded plane's fold line: the stroke from the nose back to the crease.
const FOLD = 'M11.5 14.5 21.5 3';

describe('the Feedback row', () => {
  const full = { team: onATeam, onAccount: noop, onInvite: noop, onInstructions: noop, onSettings: noop, onFeedback: noop };

  it('is the top row of the foot, above Instructions and Settings', () => {
    const foot = draw(full).split('workspace-bottom')[1];
    const order = ['Feedback', 'Instructions', 'Settings'].map((l) => foot.indexOf(`aria-label="${l}"`));
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(foot.indexOf('<button')).toBe(foot.indexOf('<button aria-label="Feedback"'));
  });

  it('wears the folded paper plane and says Feedback', () => {
    const row = buttonWith(draw(full), 'aria-label="Feedback"');
    expect(row).toContain(FOLD);
    expect(row).toContain('<span>Feedback</span>');
  });

  it('is there for someone signed out, or with no team cloud at all', () => {
    expect(draw({ team: signedOut, onFeedback: noop })).toContain('aria-label="Feedback"');
    expect(draw({ team: null, onFeedback: noop })).toContain('aria-label="Feedback"');
  });

  it('is not drawn when nothing opens it', () => {
    expect(draw({ team: onATeam, onSettings: noop })).not.toContain('aria-label="Feedback"');
  });

  it('keeps its name in the collapsed rail, where the word is hidden', () => {
    const row = buttonWith(draw({ ...full, collapsed: true }), 'aria-label="Feedback"');
    expect(row).toContain('title="Feedback"');
  });

  it('opens the feedback card in the App', () => {
    expect(app).toContain('onFeedback={() => setFeedbackOpen(true)}');
    expect(app).toMatch(/\{feedbackOpen && <FeedbackCard[^>]*onClose=\{\(\) => setFeedbackOpen\(false\)\}/);
  });
});

describe('Invite people is gone from the sidebar', () => {
  it.each([
    ['on a team', onATeam],
    ['signed in on no team yet', signedInNoTeam],
    ['signed out', signedOut],
    ['with no team cloud', null],
  ])('draws no Invite people row %s, even with a way to open it', (_, team) => {
    for (const collapsed of [false, true]) {
      const html = draw({ team, collapsed, onInvite: noop, onAccount: noop, hasTeam: true, onTeam: noop });
      expect(html.split('class="th-me"')[0]).not.toContain('Invite people');
    }
  });

  it('lights Settings, not a row that is gone, while the Settings team pane is up', () => {
    expect(app).toContain("page={settingsOpen ? 'settings' : null}");
    expect(app).not.toContain("settingsPage === 'team' ? 'invite'");
  });

  it('keeps inviting reachable from your own account menu', () => {
    // The menu is handed the same door; see your-own-row-opens-your-account-menu-with-sign-out.
    expect(fs.readFileSync(path.join(root, 'renderer/src/components/WorkspaceNavigation.tsx'), 'utf8'))
      .toMatch(/<AccountMenu[^>]*onInvite=\{onInvite\}/);
  });
});
