// THE FILES PLACE FINDS A FILE BY ITS NAME, ITS KIND AND ITS PROJECT.
//
// Sofia, on what Drive still does better: "a file browser with
// search". The app had no list of files to search at all. Measured on the list
// main/files-place.mjs hands the page: what the box and the kind filter leave,
// and the words each tile says.
import { describe, it, expect } from 'vitest';
import { filesShown, kindsIn, changedBy, versionWord, docBlocks } from '../renderer/src/files/files-shown';

const file = (over) => ({
  key: over.name, project: 'Website', kind: 'image', versions: 1, at: 1, by: 'maya', open: 0, approvedBy: [], sentIn: [], opened: null, ...over,
});
const list = [
  file({ name: 'onboarding-v3.png', at: 30 }),
  file({ name: 'launch-film.mp4', kind: 'film', at: 20 }),
  file({ name: 'pricing.md', kind: 'markdown', project: 'Billing', at: 10 }),
  file({ name: 'Board deck.pdf', kind: 'pdf', project: null, at: 5 }),
];
const names = (l) => l.map((f) => f.name);

describe('the search box', () => {
  it('finds by any word of the name, any case', () => {
    expect(names(filesShown(list, { query: 'LAUNCH' }))).toEqual(['launch-film.mp4']);
    expect(names(filesShown(list, { query: 'deck' }))).toEqual(['Board deck.pdf']);
  });
  it('finds by the project a file is in', () => {
    expect(names(filesShown(list, { query: 'billing' }))).toEqual(['pricing.md']);
  });
  it('an empty box leaves every file, newest first', () => {
    expect(names(filesShown(list, { query: '  ' }))).toEqual(names(list));
  });
  it('a word in no name finds nothing', () => {
    expect(filesShown(list, { query: 'invoice' })).toEqual([]);
  });
});

describe('the kind filter and the project page', () => {
  it('keeps the kind picked', () => {
    expect(names(filesShown(list, { kind: 'film' }))).toEqual(['launch-film.mp4']);
  });
  it('offers only the kinds there are, in a set order', () => {
    expect(kindsIn(list)).toEqual(['markdown', 'image', 'film', 'pdf']);
  });
  it('a project page keeps that project\'s files only', () => {
    expect(names(filesShown(list, { project: 'website' }))).toEqual(['onboarding-v3.png', 'launch-film.mp4']);
  });
});

describe('what a tile says', () => {
  const nameOf = (id) => ({ maya: 'Maya', dev: 'Dev' })[id] ?? 'Someone';
  it('names the person, or you', () => {
    expect(changedBy(file({ by: 'dev' }), { me: 'maya', nameOf })).toBe('Dev');
    expect(changedBy(file({ by: 'maya' }), { me: 'maya', nameOf })).toBe('You');
  });
  it('names an agent by its own name, and a plain agent by whose it is', () => {
    expect(changedBy(file({ by: 'dev', agent: 'Iris' }), { me: 'maya', nameOf })).toBe('Iris');
    expect(changedBy(file({ by: 'dev', agent: '' }), { me: 'maya', nameOf })).toBe("Dev's agent");
    expect(changedBy(file({ by: 'maya', agent: '' }), { me: 'maya', nameOf })).toBe('Your agent');
  });
  it('a document\'s face is its title, words and list, with no table run into a sentence', () => {
    const md = '# Launch plan\n\nWe open on **Nov 12**, see [notes](a.md).\n\n## What ships\n\n- A team page\n- One invoice\n\n| Part | Owner |\n| --- | --- |\n| Pricing | Maya |\n';
    expect(docBlocks(md)).toEqual([
      { kind: 'h1', text: 'Launch plan' }, { kind: 'p', text: 'We open on Nov 12, see notes.' },
      { kind: 'h2', text: 'What ships' }, { kind: 'li', text: 'A team page' }, { kind: 'li', text: 'One invoice' },
    ]);
  });
  it('says the version only once there is more than one', () => {
    expect(versionWord(file({ versions: 3 }))).toBe('v3');
    expect(versionWord(file({ versions: 1 }))).toBeNull();
  });
});
