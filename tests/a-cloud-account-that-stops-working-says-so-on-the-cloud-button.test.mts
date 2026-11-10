// A CLOUD ACCOUNT THAT STOPS WORKING SAYS SO ON THE CLOUD BUTTON (w-e63b44523a).
//
// The cloud was on and set to Everything when one of three cloud accounts lost
// its sign-in and the one it ran on was at its limit. Every thread ran on this
// Mac for hours, and nobody knew. The only sign was the accent dot on the cloud
// button, the same dot the button always wears, and a line inside its menu.
// Drawn with ?fixtures&accounts=two&cloudmissing=a1&cloudstopped: an icon with
// a dot, nothing else.
//
// Now the button says "Sign in again" until the menu that names the problem
// has been opened once. Then it is the icon and the dot again, so an account
// you meant to let go does not ask for ever. An account that is signed in
// again or removed drops out of what was seen, so it asks again if it stops
// working later, and so does a different account that stops.
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { HeaderActions } from '../renderer/src/threads/Pages.tsx';
import { SETUP, BROKEN_SEEN_KEY, brokenAccounts, buttonAsksSignIn, seenAfter } from '../renderer/src/cloud-setup';

globalThis.React = React;

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
beforeEach(() => store.clear());

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const display = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const acct = (key, state = 'ready', engine = 'claude') => ({ key, engine, name: `${key}@example.com`, ready: state === 'ready', state });
const cloud = (accounts, more = {}) => ({ setUp: true, managed: false, mode: 'all', whenOn: 'all', running: 0, accounts, signIns: [], month: { runs: 0, agentHours: 0 }, ...more });
const draw = (c) => renderToStaticMarkup(React.createElement(HeaderActions, {
  page: 'inbox', display, onDisplay: () => {}, products: [], onCompose: () => {}, cloud: c,
}));
const button = (html) => {
  const at = html.lastIndexOf('<button', html.indexOf('th-cloud'));
  return html.slice(at, html.indexOf('</button>', at) + '</button>'.length);
};

describe('an account that stopped working, not looked at yet', () => {
  const c = cloud([acct('a1', 'limited'), acct('a2', 'broken')]);
  it('puts the words on the button, beside the icon', () => {
    const b = button(draw(c));
    expect(text(b)).toContain(SETUP.again);
    expect(b).toContain('th-cloud-word');
    expect(b).toMatch(/th-cloud[^"]*named/);
  });
  it('and keeps the dot', () => {
    expect(button(draw(c))).toContain('<i>');
  });
  it('says the same to a screen reader', () => {
    expect(draw(c)).toContain(`aria-label="${SETUP.menuBroken}"`);
  });
  it('even while threads run in the cloud on another account, in place of the count', () => {
    const b = button(draw(cloud([acct('a1'), acct('a2', 'broken')], { running: 3 })));
    expect(text(b)).toContain(SETUP.again);
    expect(b).not.toContain('<b>3</b>');
  });
  it('and with the cloud off too', () => {
    expect(text(button(draw(cloud([acct('a2', 'broken')], { mode: 'mac' }))))).toContain(SETUP.again);
  });
});

describe('once the menu has been opened', () => {
  it('is the icon and the dot again', () => {
    localStorage.setItem(BROKEN_SEEN_KEY, JSON.stringify(['claude:a2']));
    const b = button(draw(cloud([acct('a1'), acct('a2', 'broken')])));
    expect(b).not.toContain('th-cloud-word');
    expect(b).toContain('<i>');
  });
  it('asks again when a different account stops working', () => {
    localStorage.setItem(BROKEN_SEEN_KEY, JSON.stringify(['claude:a2']));
    expect(text(button(draw(cloud([acct('a1', 'broken'), acct('a2', 'broken')]))))).toContain(SETUP.again);
  });
  it('tells a Codex account from a Claude one with the same key', () => {
    localStorage.setItem(BROKEN_SEEN_KEY, JSON.stringify(['claude:a2']));
    expect(text(button(draw(cloud([acct('a2', 'broken', 'codex')]))))).toContain(SETUP.again);
  });
  it('shrugs off a seen list that is not a list', () => {
    localStorage.setItem(BROKEN_SEEN_KEY, '{nope');
    expect(text(button(draw(cloud([acct('a2', 'broken')]))))).toContain(SETUP.again);
  });
});

describe('nothing that needs a sign-in', () => {
  for (const state of ['ready', 'limited', 'duplicate', 'renew', 'stale']) {
    it(`an account that is ${state} leaves the button alone`, () => {
      expect(button(draw(cloud([acct('a1', state)])))).not.toContain('th-cloud-word');
    });
  }
  it('nor does a cloud nobody has set up, which still says Cloud', () => {
    const html = draw({ setUp: false, offered: true, mode: 'full', whenOn: 'full', running: 0, accounts: [], signIns: [], month: null });
    expect(text(button(html))).toBe('Cloud');
  });
});

describe('what counts as seen', () => {
  const c = cloud([acct('a1'), acct('a2', 'broken'), acct('a3', 'broken', 'codex')]);
  it('names each stopped account by engine and key', () => {
    expect(brokenAccounts(c)).toEqual(['claude:a2', 'codex:a3']);
  });
  it('asks while any stopped account is unseen', () => {
    expect(buttonAsksSignIn(c, ['claude:a2'])).toBe(true);
    expect(buttonAsksSignIn(c, ['claude:a2', 'codex:a3'])).toBe(false);
  });
  it('takes in what the menu showed when it was open', () => {
    expect(seenAfter(c, [], ['claude:a2', 'codex:a3'])).toEqual(['claude:a2', 'codex:a3']);
  });
  it('lets go of an account signed in again, so it asks if it stops later', () => {
    const fixed = cloud([acct('a1'), acct('a2'), acct('a3', 'broken', 'codex')]);
    expect(seenAfter(fixed, ['claude:a2', 'codex:a3'], [])).toEqual(['codex:a3']);
  });
  it('keeps what it has while the accounts are not known yet', () => {
    expect(seenAfter(cloud([]), ['claude:a2'], [])).toEqual(['claude:a2']);
    expect(seenAfter({ ...cloud([]), accounts: undefined }, ['claude:a2'], [])).toEqual(['claude:a2']);
  });
});

describe('the words are drawn like the rest of the bar', () => {
  const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
  it('in the body colour, never the accent', () => {
    const at = css.indexOf('.th-cloud-word.ask');
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toContain('var(--text)');
    expect(rule).not.toContain('--accent');
  });
});
