// YOUR OWN ROW OPENS YOUR ACCOUNT MENU, AND SIGN OUT IS IN IT (w-a09476712f).
//
// Asked on 2026-10-04: "How do i log out of my account? I tried clicking my
// profile area in bottom right corner expecting a sign out or somthing and
// nothing." Sign out was on Settings -> Team and nowhere else. The first fix
// made the corner open that tab, and was turned down: "that ain't good. not
// obvious location (should be at bottom of settings page) but typically i
// expect you click the bottom component and a little dropup thing opens so i
// can sign out". Three drop-ups were drawn and the full account menu picked.
//
// The same answer reversed the status line under your name (w-0b54ee983f,
// pinned until now by your-own-row-says-what-you-are-up-to-not-your-email):
// "I wasn't a fan of the 'Say what you're up to' line being visible in the
// bottom-left corner at all times. I think it's better to just show the email
// as we had before." So the row is name and email again, and the status is a
// row in the menu.
//
// Pinned here:
//   - the row is ONE button, face, name and email, that opens a menu, and
//     carries no status line, said or not, in either width;
//   - the menu holds who you are, the status, Invite people, Settings and
//     Sign out, in that order, Sign out last behind a hairline;
//   - a row whose door is not handed in is not drawn (no Sign out without a
//     way to sign out);
//   - a status that is set shows in the menu, and one that ran out does not;
//   - Sign out is also the last group on Settings -> General, only while
//     someone is signed in;
//   - every sidebar press into Settings still lands on the tab it asked for
//     (the swallowed second click found on the first round).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';
import { AccountMenuList } from '../renderer/src/team/account-menu';
import { STATUS_PROMPT } from '../renderer/src/team/status';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const settings = read('renderer/src/components/Settings.tsx');

const noop = () => {};
// A made-up person on a made-up team. Nothing here is anyone's real details.
const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
const day = 86_400_000;
const team = (person) => ({ configured: true, signedIn: true, me: person, team: { id: 't-1', name: 'Northwind' }, people: [person], cards: [], lastSyncAt: null, error: null });
const draw = (extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop,
  onAccount: noop, onInvite: noop, onSettings: noop, onSignOut: noop, team: team(me), ...extra,
}));
const row = (html) => html.slice(html.indexOf('class="th-me"'));
const menu = (person = me, doors = { onAccount: noop, onInvite: noop, onSettings: noop, onSignOut: noop }) =>
  renderToStaticMarkup(createElement(AccountMenuList, { me: person, now: Date.now(), onStatus: noop, ...doors }));
const order = (html, words) => words.map((w) => html.indexOf(w));

describe('your own row at the foot of the sidebar', () => {
  it('is one button with your face, name and email', () => {
    const r = row(draw());
    expect((r.match(/<button/g) ?? []).length).toBe(1);
    expect(r).toContain('aria-label="Your account"');
    expect(r).toContain('Ada Lovelace');
    expect(r).toContain('<small>ada@example.test</small>');
    expect(r).toContain('tm-av');
  });

  it('says it opens a menu, and starts closed', () => {
    const r = row(draw());
    expect(r).toContain('aria-haspopup="menu"');
    expect(r).toContain('aria-expanded="false"');
    expect(r).not.toContain('th-acct-menu');
  });

  it('carries no status line, whether or not one is said', () => {
    const quiet = row(draw());
    const said = row(draw({ team: team({ ...me, status: { text: 'In meetings until Thursday', until: Date.now() + day } }) }));
    for (const r of [quiet, said]) {
      expect(r).not.toContain('In meetings');
      expect(r).not.toContain(STATUS_PROMPT);
      expect(r).not.toContain('Say what you are up to');
      expect(r).not.toContain('th-me-status');
    }
  });

  it('is the same one button in the collapsed rail', () => {
    const r = row(draw({ collapsed: true }));
    expect((r.match(/<button/g) ?? []).length).toBe(1);
    expect(r).toContain('title="Your account"');
  });

  // THE CASE THAT MUST NOT MATCH: drawn with nowhere to go, the row is the
  // plain picture and words it always was, not a button that does nothing.
  it('is not a button when there is no account to open', () => {
    const r = row(draw({ onAccount: undefined }));
    expect(r).not.toContain('<button');
    expect(r).toContain('<small>ada@example.test</small>');
  });
});

describe('your account menu', () => {
  it('holds who you are, the status, Invite people, Settings, then Sign out', () => {
    const m = menu();
    const at = order(m, ['ada@example.test', STATUS_PROMPT, 'Invite people', '>Settings<', 'Sign out']);
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('puts Sign out behind a hairline of its own', () => {
    const m = menu();
    expect(m.lastIndexOf('th-acct-rule')).toBeGreaterThan(m.indexOf('>Settings<'));
    expect(m.lastIndexOf('th-acct-rule')).toBeLessThan(m.indexOf('Sign out'));
  });

  it('is a menu of menu items', () => {
    const m = menu();
    expect(m).toContain('role="menu"');
    expect((m.match(/role="menuitem"/g) ?? []).length).toBe(5);
  });

  it('draws no Sign out without a way to sign out, and no row for a missing door', () => {
    const m = menu(me, { onSettings: noop });
    expect(m).not.toContain('Sign out');
    expect(m).not.toContain('Invite people');
    expect(m).toContain('>Settings<');
  });

  it('shows the status you set, with how long it holds', () => {
    const m = menu({ ...me, status: { text: 'In meetings until Thursday', until: Date.now() + 2 * day } });
    expect(m).toContain('In meetings until Thursday');
    expect(m).not.toContain(STATUS_PROMPT);
  });

  // THE WORDS AND THE ICON SHE PICKED, 2026-10-04: "'Set a status' is the
  // copy that wins ... the little smiley face. I think that works well."
  it('asks with "Set a status" and a smiley', () => {
    expect(STATUS_PROMPT).toBe('Set a status');
    const status = menu().match(/<button[^>]*th-acct-status[\s\S]*?<\/button>/)[0];
    expect(status).toContain('th-acct-smile');
    expect(status).toContain('Set a status');
  });

  // "if people have really long statuses, we don't want it to flow over too
  // many times so it should be a maximum of two rows of space."
  it('gives a long status two lines at most', () => {
    const css = read('renderer/src/team/team.css');
    const rule = css.match(/\.th-acct-row\.said > span \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/-webkit-line-clamp:\s*2/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).not.toMatch(/line-clamp:\s*[13-9]/);
  });

  it('asks again once a status has run out', () => {
    const m = menu({ ...me, status: { text: 'Away last week', until: Date.now() - 60_000 } });
    expect(m).not.toContain('Away last week');
    expect(m).toContain(STATUS_PROMPT);
  });
});

describe('Sign out is the last thing on Settings -> General', () => {
  it('is an Account group with a Sign out button', () => {
    // The group carries an `id` since the redraw (w-ccadd13c46): it is where
    // a search for "log out" lands.
    expect(settings).toMatch(/<Group id="account" label="Account">[\s\S]*?Signed in as \$\{account\.email\}[\s\S]*?onClick=\{account\.onSignOut\}>Sign out</);
  });

  it('comes after every other group on the page', () => {
    const general = settings.slice(settings.indexOf("pane === 'general' && ("), settings.indexOf("pane === 'claude' && enginePage"));
    const groups = [...general.matchAll(/<Group\b/g)].map((m) => m.index);
    expect(groups.length).toBeGreaterThan(1);
    expect(general.lastIndexOf('<Group id="account" label="Account">')).toBe(groups.at(-1));
  });

  it('is only there while someone is signed in', () => {
    expect(app).toMatch(/account=\{snap\?\.team\?\.signedIn && snap\.team\.me \?/);
    expect(settings).toContain('{account && (');
  });

  it('signs out through the team, from the menu and from Settings', () => {
    expect((app.match(/api\.teamSignOut\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(app).toMatch(/onSignOut=\{\(\) => \{ void api\.teamSignOut\(\)/);
  });
});

describe('a press that opens Settings always lands on the tab it asked for', () => {
  it('keys the Settings screen on the visit as well as the tab', () => {
    expect(app).toMatch(/key=\{`\$\{settingsPane \?\? 'general'\}:\$\{settingsVisit\}`\}/);
  });

  for (const door of ['onAccount', 'onInvite', 'onSettings']) {
    it(`counts a new visit from ${door}`, () => {
      const at = app.indexOf(`${door}={() => {`);
      expect(at).toBeGreaterThan(-1);
      expect(app.slice(at, app.indexOf('}}', at))).toContain('setSettingsVisit(');
    });
  }
});
