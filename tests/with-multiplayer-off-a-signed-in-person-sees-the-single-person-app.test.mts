// With Multiplayer off, the main process hands the window no team
// (teamForWindow) but keeps the sign-in, because the phone needs it. The window
// read "signed in" as "on a team", so a download user who signed in for the
// phone got team controls: a "Who sees it: Team" chip on a new thread, Invite
// people and Set a status in the account menu, share buttons in Settings ›
// Projects, a People filter, "What shipped this week" in ⌘K, and "Waits on…"
// in the thread menu, which parked the thread in Later with nothing to bring it
// back (only the team sync does, and it needs a team). Found by a read of every
// team gate on 2026-11-04, before a release with Multiplayer off.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { teamView } from '../renderer/src/team/people';
import { AccountMenuList } from '../renderer/src/team/account-menu';
import { STATUS_PROMPT } from '../renderer/src/team/status';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');

// A made-up person. Nothing here is anyone's real details.
const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
const signedIn = { configured: false, signedIn: true, me, team: null, people: [], cards: [], invites: [], sent: [], lastSyncAt: null, error: null };

describe('the team the window draws from', () => {
  it('is none with Multiplayer off, even when signed in', () => {
    expect(teamView(signedIn, [], false)).toBeNull();
  });

  it('is the signed-in person with Multiplayer on', () => {
    expect(teamView(signedIn, [], true)?.me).toBe('u-1');
  });

  it('is unchanged where the snapshot does not say (the phone site)', () => {
    expect(teamView(signedIn, [], undefined)?.me).toBe('u-1');
  });

  it('is none when nobody is signed in, either way', () => {
    expect(teamView({ ...signedIn, signedIn: false }, [], true)).toBeNull();
  });

  it('is read with the Multiplayer switch everywhere the window reads it', () => {
    const calls = app.match(/teamView\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatch(/snap\?\.alpha\?\.multiplayer\)$/);
  });
});

describe('the account menu with Multiplayer off', () => {
  const noop = () => {};
  const menu = (doors) => renderToStaticMarkup(createElement(AccountMenuList, { me, now: Date.now(), onSettings: noop, onSignOut: noop, ...doors }));

  it('has no status row when no way to set one is handed in', () => {
    expect(menu({})).not.toContain(STATUS_PROMPT);
    expect(menu({ onStatus: noop })).toContain(STATUS_PROMPT);
  });

  it('keeps who you are, Settings and Sign out', () => {
    const html = menu({});
    for (const w of ['Ada Lovelace', 'Settings', 'Sign out']) expect(html).toContain(w);
    expect(html).not.toContain('Invite people');
  });

  it('is handed Invite people and the status only with Multiplayer on', () => {
    expect(app).toMatch(/onInvite=\{multiplayer \? \(\) => \{/);
    expect(app).toMatch(/statuses=\{multiplayer\}/);
  });
});
