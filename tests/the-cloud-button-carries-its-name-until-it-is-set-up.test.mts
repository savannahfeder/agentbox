// THE CLOUD BUTTON CARRIES ITS NAME UNTIL IT IS SET UP.
//
// QA batch 004 (F-97, w-aaedc8f711): a new user looking for how to run a
// thread in the cloud found one entry point, an unlabelled cloud icon with an
// orange dot beside New thread, and nothing in the composer's pickers. They
// never learned what it was. The icon keeps its place, and wears the word
// Cloud while nothing has been set up yet, which is the only time anyone has
// to work out what it is. Once an account can run there the word goes and the
// square button is back, because by then the icon has been used.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { HeaderActions } from '../renderer/src/threads/Pages.tsx';

globalThis.React = React;

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const display = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const base = { setUp: false, offered: true, managed: false, mode: 'full', whenOn: 'full', running: 0, accounts: [], signIns: [], month: null };
const draw = (cloud) => renderToStaticMarkup(React.createElement(HeaderActions, {
  page: 'inbox', display, onDisplay: () => {}, products: [], onCompose: () => {}, cloud,
}));

describe('a cloud nobody has set up', () => {
  const html = draw(base);
  it('says Cloud on the button, beside the icon', () => {
    expect(text(html)).toContain('Cloud');
    expect(html).toContain('th-cloud-word');
  });
  it('and still wears the dot that says there is something to do', () => {
    expect(html).toMatch(/th-cloud[^"]*named/);
    expect(html).toContain('<i>');
  });
});

describe('a cloud already set up', () => {
  const html = draw({ ...base, setUp: true, offered: false, accounts: [{ key: 'a', engine: 'claude', state: 'ok' }] });
  it('is the square icon again, with no word', () => {
    expect(html).not.toContain('th-cloud-word');
  });
});

describe('a cloud running threads', () => {
  const html = draw({ ...base, setUp: true, offered: false, running: 1, accounts: [{ key: 'a', engine: 'claude', state: 'ok' }] });
  it('wears its count rather than the word', () => {
    expect(html).not.toContain('th-cloud-word');
    expect(html).toContain('<b>1</b>');
  });
});

describe('the word is set to sit on the button', () => {
  const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
  it('which widens for it, the way it widens for the count', () => {
    expect(css).toMatch(/\.th-cloud\.named[^{]*\{[^}]*width: auto/);
  });
  it('in the dimmer body colour, not the accent', () => {
    const rule = css.slice(css.indexOf('.th-cloud-word {'), css.indexOf('}', css.indexOf('.th-cloud-word {')));
    expect(rule).not.toContain('--accent');
  });
});
