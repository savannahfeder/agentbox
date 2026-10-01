// CHOOSING WHO SEES A THREAD: THE TEAM, A FEW PEOPLE, OR NOBODY.
//
// w-41ff964775, her words: "some people might want to be quieter, or you might
// only want certain people to see what you're up to. Sharing your calendar
// within a company, you don't necessarily want to share it with everyone, but
// you might want to share it with your boss or some people."
//
// Three choices now, in the composer's Who sees it menu and the summary
// panel's Visible to, and Chosen people opens the same people picker the To
// field uses. The cloud is what enforces it (tests/team-a-thread-shared-with-
// chosen-people-reaches-only-them.test.mjs); this file is the window: the
// rules that decide the words, and what the real components draw.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel } from '../renderer/src/threads/Summary.tsx';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { chosenNames, whoSees, VISIBILITY_WORD } from '../renderer/src/threads/summary-rules.ts';
import { rowSharing, sharePatch } from '../renderer/src/threads/page-rules.ts';
import { chosenWords, sharingFields, VISIBILITY_ROWS } from '../renderer/src/threads/composer-rules.ts';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY;
const ME = 'p-me';
const THEO = 'p-theo';
const ANA = 'p-ana';
const BEN = 'p-ben';
const PEOPLE = [
  { id: ME, name: 'Maya Chen', email: 'maya@northwind.test' },
  { id: THEO, name: 'Theo Park', email: 'theo@northwind.test' },
  { id: ANA, name: 'Ana Ruiz', email: 'ana@northwind.test' },
  { id: BEN, name: 'Ben Oyelaran', email: 'ben@northwind.test' },
];
const northwind = { slug: 'northwind', name: 'Northwind', team: { visibility: 'team', people: [] } };
const item = (o = {}) => ({
  id: 'w-pay', product: 'northwind', productName: 'Northwind', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'Pay review for the design team', label: 'Pay review', priority: 7, epoch: 0, claim: null,
  createdAt: NOW - DAY, updatedAt: NOW - DAY, createdBy: ME, ...o,
});
const team = {
  state: { since: SINCE, signedIn: true, people: PEOPLE },
  me: ME,
  byId: new Map(PEOPLE.map((p) => [p.id, p])),
  products: new Map(),
};
const panel = (it, t = team) => renderToStaticMarkup(React.createElement(SummaryPanel, { item: it, items: [it], team: t }));
const row = (it, product = northwind, t = team) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: t }, React.createElement(ThreadCells, { item: it, product, now: NOW })),
);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const composer = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
const summarySrc = fs.readFileSync(new URL('../renderer/src/threads/Summary.tsx', import.meta.url), 'utf8');
const pagesCss = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const T = { me: ME, since: SINCE };

describe('the three choices', () => {
  it('offers Team, Chosen people and Private, in that order', () => {
    expect(VISIBILITY_ROWS.map((v) => v.id)).toEqual(['team', 'people', 'private']);
    expect(VISIBILITY_ROWS.map((v) => v.label)).toEqual(['Team', 'Chosen people', 'Private']);
  });

  it('says the three words the same way everywhere', () => {
    expect(VISIBILITY_WORD).toEqual({ team: 'Team', people: 'Chosen people', private: 'Only you' });
  });

  it('uses no em dash in any line a person reads', () => {
    expect(VISIBILITY_ROWS.map((v) => v.line).join(' ')).not.toContain('—');
  });
});

describe('what a send says about who sees it', () => {
  it('sends the chosen people when she named some', () => {
    expect(sharingFields('people', [THEO, ANA])).toEqual({ visibility: 'people', visibleTo: [THEO, ANA] });
  });

  // ONE STORED WORD PER THING THAT IS TRUE. Chosen people with nobody on the
  // list reaches nobody, so it is stored as Private and the panel says "Only
  // you", rather than saying "Chosen people" over a thread nobody can see.
  it('sends Private when she chose people and named nobody', () => {
    expect(sharingFields('people', [])).toEqual({ visibility: 'private' });
  });

  it('leaves the other two alone, and carries no list beside them', () => {
    expect(sharingFields('team', [THEO])).toEqual({ visibility: 'team' });
    expect(sharingFields('private', [THEO])).toEqual({ visibility: 'private' });
  });

  it('names one person, two, or counts them past that', () => {
    expect(chosenWords([], PEOPLE)).toBe('Chosen people');
    expect(chosenWords([THEO], PEOPLE)).toBe('Theo');
    expect(chosenWords([THEO, ANA], PEOPLE)).toBe('Theo and Ana');
    expect(chosenWords([THEO, ANA, BEN], PEOPLE)).toBe('3 people');
  });
});

describe('the composer', () => {
  it('opens the people picker on Chosen people rather than closing the menu', () => {
    expect(composer).toMatch(/if \(v\.id === 'people'\) setVisPage\('people'\)/);
  });

  it('finds a person with the same rule the To field uses', () => {
    expect(composer).toMatch(/const visiblePeople = findPeople\(others, query\)/);
  });

  it('sends who sees it through the one rule, never the raw word', () => {
    expect(composer).toMatch(/sharingFields\(visibility, chosenHere\)/);
  });

  it('says plainly that nobody but her sees it until she picks somebody', () => {
    expect(composer).toContain('Pick a person, or nobody but you will see it.');
  });
});

describe('the summary panel', () => {
  it('names the people a thread is shared with, in the panel itself', () => {
    expect(text(panel(item({ visibility: 'people', visibleTo: [THEO] })))).toMatch(/Visible to Theo/);
    expect(text(panel(item({ visibility: 'people', visibleTo: [THEO, ANA] })))).toMatch(/Visible to Theo and Ana/);
    expect(text(panel(item({ visibility: 'people', visibleTo: [THEO, ANA, BEN] })))).toMatch(/Visible to 3 people/);
  });

  it('still reads Team and Only you on the other two', () => {
    expect(text(panel(item({ visibility: 'team' })))).toMatch(/Visible to Team/);
    expect(text(panel(item({ visibility: 'private' })))).toMatch(/Visible to Only you/);
  });

  it('reads Only you on a thread shared with chosen people that names nobody', () => {
    expect(text(panel(item({ visibility: 'people', visibleTo: [] })))).toMatch(/Visible to Only you/);
  });

  it('writes the list through the same threadEdit path, and Private when the last person comes off', () => {
    expect(summarySrc).toMatch(/save\(next\.length \? \{ visibility: 'people', visibleTo: next \} : \{ visibility: 'private', visibleTo: \[\] \}\)/);
  });

  it('names them in words, never as ids', () => {
    expect(panel(item({ visibility: 'people', visibleTo: [THEO] }))).not.toContain(THEO);
  });

  it('says Nobody yet rather than an empty line while she is picking', () => {
    expect(chosenNames([], team.byId)).toBe('Nobody yet');
  });

  it('asks the rule, not the word on disk, on a thread from before she joined', () => {
    expect(whoSees(item({ createdAt: SINCE - DAY }), SINCE)).toBe('private');
    expect(whoSees(item({ createdAt: SINCE - DAY, visibility: 'people', visibleTo: [THEO] }), SINCE)).toBe('people');
  });
});

describe('the inbox row', () => {
  it('reads a thread shared with chosen people as its own kind of shared', () => {
    expect(rowSharing(item({ visibility: 'people', visibleTo: [THEO] }), northwind, T)).toBe('people');
    expect(rowSharing(item({ visibility: 'people', visibleTo: [] }), northwind, T)).toBe('private');
    expect(rowSharing(item({ visibility: 'team' }), northwind, T)).toBe('team');
  });

  // QUIETLY: the same two-people mark, with the count of people beside it.
  it('marks it with the count of people it reaches, and the team with no count', () => {
    const few = row(item({ visibility: 'people', visibleTo: [THEO, ANA] }));
    expect(few).toContain('th-shared');
    expect(few).toMatch(/<span class="th-shared-n"[^>]*>2<\/span>/);
    expect(few).toMatch(/aria-label="Visible to 2 people"/);

    const all = row(item({ visibility: 'team' }));
    expect(all).toContain('th-shared');
    expect(all).not.toContain('th-shared-n');
    expect(all).toMatch(/aria-label="Visible to the team"/);
  });

  it('draws the count in the mark\'s own faint colour, not as a badge', () => {
    expect(pagesCss).toMatch(/\.th-shared-n \{[^}]*color: var\(--text-faint\)/);
    expect(pagesCss).not.toMatch(/\.th-shared-n \{[^}]*background/);
  });

  it('offers Unshare on it, and that takes it away from those people', () => {
    expect(text(row(item({ visibility: 'people', visibleTo: [THEO] })))).toContain('Unshare');
    expect(sharePatch('people')).toEqual({ visibility: 'private' });
    expect(sharePatch('team')).toEqual({ visibility: 'private' });
    expect(sharePatch('private')).toEqual({ visibility: 'team' });
  });

  it('draws nothing at all on a thread only she can see', () => {
    const mine = row(item({ visibility: 'private' }));
    expect(mine).not.toContain('th-shared');
    expect(text(mine)).toContain('Share');
  });
});
