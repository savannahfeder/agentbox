// YOUR OWN ROW SAYS WHAT YOU ARE UP TO, NOT YOUR EMAIL (w-0b54ee983f).
//
// The first attempt put the status on a THIRD line under your name and email.
// She turned it down on 2026-10-02: it "takes up space", "makes everything
// move" and looks "pretty wonky". All three were true and all three came from
// the same thing: the row is a fixed 46px, so a third line forced it open to
// 99px, and the corner jumped the moment you wrote a line and jumped back when
// it lapsed.
//
// So the line takes the email's place. The row keeps the two lines and the one
// height it has always had, and your email is on Settings -> Team ("Signed in
// as ..."), which is where clicking your name already goes.
//
// These pin the three things that made it wrong, so none of them can come
// back: no third line, no email in the row, and the line is its own control
// rather than part of the button that opens your account.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';

const noop = () => {};
// A made-up person on a made-up team. Nothing here is anyone's real details.
const me = { id: 'u-1', email: 'ada@example.test', name: 'Ada Lovelace', avatarUrl: null };
const withStatus = (status) => ({
  configured: true, signedIn: true, me: { ...me, status }, team: { id: 't-1', name: 'Northwind' },
  people: [{ ...me, status }], cards: [], lastSyncAt: null, error: null,
});
// The row the app actually draws: onAccount is what makes your name open the
// page your email is on.
const draw = (team, extra = {}) => renderToStaticMarkup(createElement(WorkspaceNavigation, {
  view: 'inbox', collapsed: false, onToggle: noop, onView: noop, onSearch: noop, onCompose: noop,
  onAccount: noop, team, ...extra,
}));
const row = (html) => html.slice(html.indexOf('class="th-me"'));

describe('your own row at the foot of the sidebar', () => {
  it('says what you are up to where your email used to be', () => {
    const r = row(draw(withStatus({ text: 'In meetings until Thursday', until: Date.now() + 86_400_000 })));
    expect(r).toContain('Ada Lovelace');
    expect(r).toContain('In meetings until Thursday');
    expect(r).not.toContain('ada@example.test');
  });

  it('asks, rather than sitting empty, when you have said nothing', () => {
    const r = row(draw(withStatus(null)));
    expect(r).toContain('Say what you are up to');
    expect(r).not.toContain('ada@example.test');
  });

  // THE LINE IS ITS OWN CONTROL. Your name opens your account and the line
  // opens the box you write it in, so one cannot be nested inside the other:
  // a button inside a button is not valid, and the inner one never gets the
  // click. The face sits outside the name's button for the same reason.
  it('keeps the line out of the button that opens your account', () => {
    const r = row(draw(withStatus(null)));
    const account = r.indexOf('aria-label="Your account"');
    const line = r.indexOf('th-me-status');
    expect(account).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(account);
    // the account button closes before the line's button opens
    expect(r.slice(account, line)).toContain('</button>');
  });

  // WHAT MADE IT MOVE: a third line in a row whose height is fixed. The row
  // carries exactly two lines whether or not anything is said.
  it('is the same two lines whether or not anything is said', () => {
    const said = row(draw(withStatus({ text: 'At the Acme onsite', until: Date.now() + 86_400_000 })));
    const quiet = row(draw(withStatus(null)));
    // Two lines' worth of controls and no more: your name, and the line under
    // it. The face is a button too since w-a09476712f, but it is the face,
    // not a line, so it is not counted here.
    const controls = (r) => (r.match(/<button(?![^>]*th-me-face)/g) ?? []).length;
    expect(controls(said)).toBe(2);
    expect(controls(quiet)).toBe(2);
  });

  // A STATUS THAT HAS RUN OUT IS NOT DRAWN, on the reader's own clock, so the
  // row asks again rather than showing last week's line.
  it('asks again once a line has run out', () => {
    const r = row(draw(withStatus({ text: 'Away last week', until: Date.now() - 60_000 })));
    expect(r).not.toContain('Away last week');
    expect(r).toContain('Say what you are up to');
  });

  it('shows neither the line nor the name in the collapsed rail', () => {
    const r = row(draw(withStatus({ text: 'In meetings', until: Date.now() + 86_400_000 }), { collapsed: true }));
    expect(r).not.toContain('In meetings');
  });
});
