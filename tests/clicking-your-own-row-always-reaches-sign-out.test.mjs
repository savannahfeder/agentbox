// CLICKING YOUR OWN ROW ALWAYS REACHES SIGN OUT (w-a09476712f, 2026-10-04).
//
// Reported as "How do i log out of my account? I tried clicking my profile
// area in bottom right corner expecting a sign out or somthing and nothing."
// The screenshot had Settings open on General.
//
// Sign out has been on Settings -> Team since 2026-10-01, and your name at the
// foot of the sidebar opens that tab. Two things kept the click from getting
// there, both read off the code on 2026-10-04:
//
//   1. THE PHOTO WAS NOT A BUTTON. Only the name was. The photo is the biggest
//      thing in the corner and the first thing a hand goes to, and with the
//      sidebar collapsed it is the only thing there, so in the rail the row
//      opened nothing at all.
//   2. A SECOND CLICK ON YOUR NAME WAS SWALLOWED. Settings is keyed on the tab
//      it was asked for. Open it from your name (asks for 'team'), move to
//      General, click your name again: it asks for 'team' again, React sees
//      the same key, nothing remounts, and you stay on General. That is the
//      screenshot. Invite people and the Settings row had the same hole.
//
// The fix: the photo is a button too, and every press that opens Settings
// counts as a new visit, so the screen always starts on the tab you asked for.
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
const nav = read('renderer/src/components/WorkspaceNavigation.tsx');
const teamPage = read('renderer/src/team/TeamPage.tsx');

const noop = () => {};
// A made-up person on a made-up team. Nothing here is anyone's real details.
const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
const withPhoto = { ...me, avatarUrl: 'https://example.test/ada.png' };
const team = (person) => ({ configured: true, signedIn: true, me: person, team: { id: 't-1', name: 'Northwind' }, people: [person], cards: [], lastSyncAt: null, error: null });
const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop,
  onAccount: noop, team: team(me), ...extra,
}));
const row = (html) => html.slice(html.indexOf('class="th-me"'));
// The opening tag of the button that wraps the face, or '' if none does.
const faceButton = (r) => {
  const face = r.indexOf('tm-av');
  const open = r.lastIndexOf('<button', face);
  if (face < 0 || open < 0 || r.slice(open, face).includes('</button>')) return '';
  return r.slice(open, r.indexOf('>', open) + 1);
};

describe('your photo opens your account, like your name does', () => {
  it('wraps the initials in a button', () => {
    expect(faceButton(row(draw()))).toContain('th-me-face');
  });

  it('wraps a real photo in a button too', () => {
    expect(faceButton(row(draw({ team: team(withPhoto) })))).toContain('th-me-face');
  });

  it('opens the same page as your name', () => {
    expect(nav).toMatch(/className="th-me-face"[^>]*onClick=\{onAccount\}/);
  });

  // With the sidebar open your name is the keyboard stop, so the photo stays
  // out of the tab order and out of a screen reader's list rather than being
  // the same control twice.
  it('is not a second tab stop beside your name', () => {
    const b = faceButton(row(draw()));
    expect(b).toContain('tabindex="-1"');
    expect(b).toContain('aria-hidden="true"');
  });

  // In the collapsed rail the name is hidden, so the photo is the only way in
  // and has to be a real, named control.
  it('is the named way in when the sidebar is collapsed', () => {
    const b = faceButton(row(draw({ collapsed: true })));
    expect(b).toContain('th-me-face');
    expect(b).toContain('aria-label="Your account"');
    expect(b).not.toContain('tabindex="-1"');
    expect(b).not.toContain('aria-hidden');
  });

  // THE CASES THAT MUST NOT MATCH: with no account page to open, the photo is
  // a picture and not a button that does nothing; signed out, there is no
  // photo at all.
  it('stays a plain picture when there is no account page to open', () => {
    expect(faceButton(row(draw({ onAccount: undefined })))).toBe('');
  });

  it('draws no account button for someone signed out', () => {
    const signedOut = { configured: true, signedIn: false, me: null, team: null, people: [], cards: [], lastSyncAt: null, error: null };
    expect(row(draw({ team: signedOut, onTeam: noop }))).not.toContain('th-me-face');
  });
});

describe('a press that opens Settings always lands on the tab it asked for', () => {
  it('keys the Settings screen on the visit as well as the tab', () => {
    expect(app).toMatch(/key=\{`\$\{settingsPane \?\? 'general'\}:\$\{settingsVisit\}`\}/);
  });

  // The swallowed second click: each of the three sidebar doors counts a visit.
  for (const door of ['onAccount', 'onInvite', 'onSettings']) {
    it(`counts a new visit from ${door}`, () => {
      const at = app.indexOf(`${door}={() => {`);
      expect(at).toBeGreaterThan(-1);
      const body = app.slice(at, app.indexOf('}}', at));
      expect(body).toContain('setSettingsVisit(');
    });
  }

  it('still has Sign out on the Team tab your name opens', () => {
    expect(app).toMatch(/onAccount=\{\(\) => \{[^}]*setSettingsPane\('team'\)/);
    expect(teamPage).toMatch(/onClick=\{\(\) => run\(\(\) => api\.teamSignOut\(\)\)\}>Sign out</);
  });
});
