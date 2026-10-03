// THE FILTERS BUTTON WEARS THE FACES OF WHOSE THREADS ARE SHOWN (w-14bb56c833).
//
// On the board the Everyone control had a row of its own, 40px tall (14px of
// padding over a 26px button), and every column sat that much lower under the
// header for one small control at the far right. In the list it hung off the
// end of the tab row. Three rounds of drawings later the pick was the faces of
// the people whose threads are on the page, drawn on the View and filters
// button itself, with the people choice as the first line of its menu. So the
// separate row is gone on both views.
//
// The dot on that button means "something is being held back from you". Just
// you is where most of the day is spent and is the expected state, so it lights
// no dot; their words: "we don't want to distract people with that little
// dot". Any other narrowing (you and Maya with Theo hidden, Maya without you)
// does light it, and so do the old filters, whatever the people say.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeaderActions, DisplayMenu, InboxBoard } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { facesOnButton, peopleWorthADot } from '../renderer/src/threads/people-rules.ts';
globalThis.React = React;

const me = { id: 'p-me', name: 'Sam Rivera', email: 'sam@example.test' };
const maya = { id: 'p-maya', name: 'Maya Chen', email: 'maya@example.test' };
const theo = { id: 'p-theo', name: 'Theo Park', email: 'theo@example.test' };
const team3 = [theo, me, maya];
const seven = [me, maya, theo, ...['Uma', 'Vic', 'Wes', 'Xia'].map((n) => ({ id: `p-${n}`, name: n, email: `${n}@example.test` }))];
const ids = (list) => list.map((p) => p.id);
const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' };

const button = (people, d = display) => renderToStaticMarkup(React.createElement(HeaderActions, {
  page: 'inbox', display: d, onDisplay: () => {}, products: [], onSearch: () => {}, onCompose: () => {}, people,
}));
const faces = (html) => (html.match(/tm-av/g) ?? []).length;
const dot = (html) => /<i><\/i>|<i\/>/.test(html);
const pick = (everyone, picked) => ({ everyone, picked, me: me.id, onPick: () => {} });

describe('which faces the button wears', () => {
  it('everyone on a team of three: you first, then the others by name', () => {
    expect(facesOnButton(team3, ids(team3), me.id)).toEqual({ faces: [me, maya, theo], more: 0 });
  });

  it('just you: your face alone', () => {
    expect(facesOnButton(team3, [me.id], me.id)).toEqual({ faces: [me], more: 0 });
  });

  it('only the picked people, so a hidden teammate has no face', () => {
    expect(facesOnButton(team3, [me.id, maya.id], me.id)).toEqual({ faces: [me, maya], more: 0 });
  });

  it('three faces and a count once more than three are shown', () => {
    expect(facesOnButton(seven, ids(seven), me.id)).toEqual({ faces: [me, maya, theo], more: 4 });
  });

  it('nothing on a team of one, which has nobody to choose between', () => {
    expect(facesOnButton([me], [me.id], me.id)).toBeNull();
  });

  it('ignores anyone who has left the team since the picked list was written', () => {
    expect(facesOnButton([me, maya], [me.id, maya.id, 'p-gone'], me.id)).toEqual({ faces: [me, maya], more: 0 });
  });
});

describe('when the people choice lights the dot', () => {
  it('not for everyone', () => expect(peopleWorthADot(team3, ids(team3), me.id)).toBe(false));
  it('not for just you, the everyday state', () => expect(peopleWorthADot(team3, [me.id], me.id)).toBe(false));
  it('for you and Maya while Theo is hidden', () => expect(peopleWorthADot(team3, [me.id, maya.id], me.id)).toBe(true));
  it('for Maya without you', () => expect(peopleWorthADot(team3, [maya.id], me.id)).toBe(true));
  it('not on a team of one', () => expect(peopleWorthADot([me], [me.id], me.id)).toBe(false));
});

describe('the button as drawn', () => {
  it('everyone: three faces, no dot, and says so to a screen reader', () => {
    const html = button(pick(team3, ids(team3)));
    expect(faces(html)).toBe(3);
    expect(dot(html)).toBe(false);
    expect(html).toContain('Everyone');
  });

  it('just you: one face and no dot', () => {
    const html = button(pick(team3, [me.id]));
    expect(faces(html)).toBe(1);
    expect(dot(html)).toBe(false);
  });

  it('you and Maya: two faces and the dot', () => {
    const html = button(pick(team3, [me.id, maya.id]));
    expect(faces(html)).toBe(2);
    expect(dot(html)).toBe(true);
  });

  it('a team of seven: three faces and +4', () => {
    const html = button(pick(seven, ids(seven)));
    expect(faces(html)).toBe(3);
    expect(html).toContain('+4');
  });

  it('just you with a priority filter on: the dot still lights for the filter', () => {
    expect(dot(button(pick(team3, [me.id]), { ...display, priorities: ['urgent'] }))).toBe(true);
  });

  it('nobody signed in, or a team of one: the plain filters icon, no faces', () => {
    expect(faces(button(undefined))).toBe(0);
    expect(faces(button(pick([me], [me.id])))).toBe(0);
  });
});

describe('the menu', () => {
  const menu = (people) => renderToStaticMarkup(React.createElement(DisplayMenu, { page: 'inbox', display, onDisplay: () => {}, products: [], people }));

  it('opens on People: Everyone, Just you, then each person by name', () => {
    const html = menu(pick(team3, [me.id]));
    expect(html).toMatch(/People[\s\S]*Everyone[\s\S]*Just you[\s\S]*You[\s\S]*Maya[\s\S]*Theo/);
    expect(html.indexOf('People')).toBeLessThan(html.indexOf('View'));
  });

  it('has no People line with nobody to choose between', () => {
    expect(menu(pick([me], [me.id]))).not.toContain('People');
    expect(menu(undefined)).not.toContain('People');
  });
});

describe('the row of its own is gone', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const pages = readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');

  it('neither the board nor the tab row is handed a people control any more', () => {
    expect(app).not.toMatch(/PeopleFilter|peoplePicker/);
    expect(pages).not.toMatch(/th-bar-end|export function PeopleFilter/);
  });

  it('the header is handed the people instead', () => {
    expect(app).toMatch(/<HeaderActions[\s\S]{0,900}people=\{/);
  });

  it('a board with teammates on it starts with its columns, not a bar', () => {
    const html = renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: { state: {}, me: me.id, byId: new Map(), products: new Map() } },
      React.createElement(InboxBoard, { items: [], products: [], display, now: Date.now(), onOpenItem: () => {}, picked: ids(team3) })));
    expect(html).toMatch(/^<div class="list[^"]*"><div class="th-board/);
  });
});
