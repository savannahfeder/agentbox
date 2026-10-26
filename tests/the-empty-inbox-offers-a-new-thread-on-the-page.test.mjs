// THE EMPTY INBOX IS WHERE THE NEXT THREAD STARTS (w-4e9f957f97).
//
// "When we clear the inbox, I don't like it": a small block in the top corner
// of a large empty page, made of a heading, a sentence counting what was
// running, a second New thread button and an "or press N" hint. Three rounds of
// drawings on the built page later, the approved one is the heading over the
// New thread box itself, drawn open on the page as one line of large text over
// a rule, with To and Model as chips in its bar. No count of what is running:
// "we don't really want to show in progress".
//
// The box is the dialog's own component, so it sends exactly as the dialog
// does. What it must not do on the page is act like a dialog: take the
// keyboard when the page opens, or treat a key pressed with nothing focused as
// a letter for the message. On the page that key belongs to the inbox (J, K,
// E, B...). Measured against the old card: `keyOnTheNewThreadCard` answered
// 'the message' for any letter with nothing focused, which is right inside a
// dialog that owns the screen and would eat every inbox shortcut on the page.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

globalThis.React = React;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

let keyOnTheNewThreadCard, InboxClear, ThreadComposer;
beforeAll(async () => {
  ({ keyOnTheNewThreadCard } = await import('../renderer/src/threads/composer-rules'));
  ({ InboxClear } = await import('../renderer/src/threads/Pages'));
  ({ ThreadComposer } = await import('../renderer/src/threads/ThreadComposer'));
});

describe('a key pressed while the box sits on the page', () => {
  const key = (on, inline) => keyOnTheNewThreadCard({ key: 'j', menuOpen: false, on, inline });

  it('is the inbox\'s when nothing has the keyboard', () => {
    expect(key('nothing', true)).toBe('leave it');
  });

  it('is the message\'s once you are in the box', () => {
    expect(key('the card', true)).toBe('the message');
  });

  it('is still the message\'s in the dialog, which owns the screen', () => {
    expect(key('nothing', false)).toBe('the message');
    expect(key('nothing', undefined)).toBe('the message');
  });

  it('leaves a field and anything outside alone either way', () => {
    expect(key('a field', true)).toBe('leave it');
    expect(key('away', true)).toBe('leave it');
  });
});

describe('the empty page', () => {
  const html = () => renderToStaticMarkup(React.createElement(InboxClear, { slot: () => {} }));

  it('says nothing needs you and makes room for the box', () => {
    expect(html()).toContain('<h2>Nothing needs you</h2>');
    expect(html()).toContain('th-clear-compose');
  });

  it('counts nothing in progress and offers no second button or key hint', () => {
    expect(html()).not.toMatch(/running|queued|scheduled/i);
    expect(html()).not.toContain('th-new');
    expect(html()).not.toContain('or press');
  });
});

describe('the box, on the page and in the dialog', () => {
  const draw = (inline) => renderToStaticMarkup(React.createElement(ThreadComposer, {
    inline,
    products: [{ slug: 'northwind', name: 'Northwind' }],
    items: [],
    codexModels: [],
    codexModelDefault: null,
    onClose: () => {},
    onSent: () => {},
  }));

  it('on the page has no veil, no dialog and no rows above the words', () => {
    const page = draw(true);
    expect(page).toContain('tc-inline');
    expect(page).not.toContain('modal-backdrop');
    expect(page).not.toContain('role="dialog"');
    expect(page).not.toContain('tc-head');
  });

  it('on the page carries To and Model as chips ahead of the project', () => {
    const page = draw(true);
    const bar = page.slice(page.indexOf('tc-bar'));
    expect(bar.indexOf('Agent')).toBeGreaterThan(-1);
    expect(bar.indexOf('Agent')).toBeLessThan(bar.indexOf('Northwind'));
    expect(bar).not.toContain('tc-label');
  });

  it('in the dialog is the card it has always been', () => {
    const card = draw(false);
    expect(card).toContain('modal-backdrop tc-veil');
    expect(card).toContain('role="dialog"');
    expect(card).toContain('tc-head');
    expect(card).not.toContain('tc-inline');
  });
});

describe('the app puts it there', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const box = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');

  it('draws the one composer into the empty page while the dialog is shut', () => {
    expect(app).toContain('inline={modal !== \'compose\'}');
    expect(app).toMatch(/createPortal\(/);
  });

  it('sends N to the box on the page rather than opening a second one', () => {
    expect(app).toContain('startThread()');
  });

  it('does not take the keyboard when the page opens', () => {
    const focus = box.slice(box.indexOf('A LAYOUT EFFECT, SO THE CARD HAS THE KEYBOARD'), box.indexOf('/* ----------------------------- the keyboard'));
    expect(focus).toMatch(/if \(inline\) return;/);
  });
});
