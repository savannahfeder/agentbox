// A THREAD ARRIVING WHILE YOU WRITE MOVES YOUR WORDS INTO THE DIALOG (w-8d12087e6b).
//
// "The moment a task comes into my Needs You, I've lost it." The New thread
// box on the empty inbox was drawn only while Needs you was empty, so a thread
// landing mid-sentence swapped the page for the list under your hands. The
// words survived in the saved draft, but the box, the caret and the chips
// went with it, and the next letters you typed went to the inbox's keys (E
// closes the thread you are on). Measured on the page's own rule: App.tsx drew
// InboxClear only on `list.length === 0`.
//
// Holding the page was turned down: "Let's say you're typing but then you
// decide, I want to see whatever that was." The approved answer is the second
// idea in the request: the box moves into the New thread dialog, with the list
// behind it, and carries what you had set in it.
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

let writingMovesToTheDialog, ThreadComposer;
beforeAll(async () => {
  ({ writingMovesToTheDialog } = await import('../renderer/src/threads/composer-rules'));
  ({ ThreadComposer } = await import('../renderer/src/threads/ThreadComposer'));
});

describe('when the box on the empty inbox moves into the dialog', () => {
  it('moves when a thread lands while you are writing', () => {
    expect(writingMovesToTheDialog({ waiting: 1, onScreen: true, writing: true })).toBe(true);
    expect(writingMovesToTheDialog({ waiting: 5, onScreen: true, writing: true })).toBe(true);
  });

  it('stays on the page while nothing needs you', () => {
    expect(writingMovesToTheDialog({ waiting: 0, onScreen: true, writing: true })).toBe(false);
  });

  it('does not open a dialog for an empty box nobody is in', () => {
    expect(writingMovesToTheDialog({ waiting: 1, onScreen: true, writing: false })).toBe(false);
  });

  it('never opens one over a list that is already showing', () => {
    expect(writingMovesToTheDialog({ waiting: 1, onScreen: false, writing: true })).toBe(false);
  });
});

describe('the dialog opens on what the box held', () => {
  const draw = (initial) => renderToStaticMarkup(React.createElement(ThreadComposer, {
    initial,
    products: [{ slug: 'northwind', name: 'Northwind' }],
    items: [],
    codexModels: [],
    codexModelDefault: null,
    onClose: () => {},
    onSent: () => {},
  }));

  it('with the words', () => {
    expect(draw({ body: 'Write the launch post for Friday' })).toContain('Write the launch post for Friday');
  });

  it('and is the dialog, not the box', () => {
    const card = draw({ body: 'x' });
    expect(card).toContain('role="dialog"');
    expect(card).not.toContain('tc-inline');
  });
});

describe('the app hands the box over', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const box = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');

  it('asks the rule, with whether you are writing in the box', () => {
    expect(app).toMatch(/writingMovesToTheDialog\(\{[^}]*writing: clearWriting/);
    expect(app).toContain('onWriting={setClearWriting}');
  });

  it('opens the dialog on what the box hands over, before the page paints', () => {
    const at = app.indexOf('const clearMovesNow');
    const effect = app.slice(app.indexOf('useLayoutEffect(() => {', at), app.indexOf('useLayoutEffect(() => {', at) + 400);
    expect(effect).toContain('handOver.current');
    expect(effect).toContain("setModal('compose')");
    expect(app).toContain('clearMovesNow.current = clearMoves;');
  });

  it('counts writing by where the keyboard is, so switching apps does not end it', () => {
    expect(box).toMatch(/card\.current\?\.contains\(document\.activeElement\)/);
  });

  it('counts words left in the box as writing too', () => {
    expect(box).toMatch(/onWriting\?\.\(inBox \|\| /);
  });

  it('puts the caret back where it was', () => {
    expect(box).toContain('initial?.caret');
  });
});
