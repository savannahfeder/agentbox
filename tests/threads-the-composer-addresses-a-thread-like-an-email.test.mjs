// THE NEW THREAD COMPOSER: TO, PROJECT, TITLE AND WHO SEES IT.
//
// The New thread card (w-e731ca9376, approved 2026-10-01) reads like an email:
// To first, then Model, then the message, then the project, the priority and
// who on the team can see it. Four small rules sit under that and each is pinned
// here, because each has a way to go quietly wrong:
//
//  - The title is derived exactly as the old Compose card derived it
//    (../renderer/src/message-split.ts). That module exists because an earlier
//    split silently deleted everything past character 180; a second copy of the
//    rule here would be one edit away from doing it again.
//  - The project menu leaves out the Direct projects that carry messages between
//    two people. They are real products on disk, but a task filed into one would
//    land in somebody's private conversation.
//  - To lists every teammate except yourself, and "Find a person" narrows it.
//  - Visibility is Team unless she chose Private, and the choice is remembered
//    between opens. A stale or foreign value reads as Team, never as an error.
import { describe, it, expect } from 'vitest';
import {
  threadMessage, projectsOffered, startingProject, teammates, findPeople,
  placeholderFor, landsIn, readVisibility, writeVisibility, VISIBILITY_KEY, projectSwatch,
} from '../renderer/src/threads/composer-rules.ts';
import { splitMessage } from '../renderer/src/message-split.ts';

const fakeStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};

describe('the title', () => {
  it('is the first line, and the rest is the body', () => {
    expect(threadMessage('Draft the renewal\nAt 8% over last year.', [])).toEqual({ title: 'Draft the renewal', body: 'At 8% over last year.' });
  });

  it('is derived by the same split the old card used, word for word', () => {
    const long = 'Pull Acme’s usage for the last twelve months and draft renewal terms at 8% over last year, then send them to Maya so she can check the numbers before the call on Thursday afternoon.';
    expect(threadMessage(long, [])).toEqual(splitMessage(long));
    expect(threadMessage(long, []).body).toBe(long);
  });

  it('names the first file when only files were attached', () => {
    expect(threadMessage('   ', [{ name: 'shot.png' }])).toEqual({ title: 'Attached: shot.png', body: '' });
  });

  it('is nothing at all when there are no words and no files', () => {
    expect(threadMessage(' \n ', [])).toBeNull();
  });
});

describe('the project menu', () => {
  const products = [
    { slug: 'northwind', name: 'Northwind', team: { direct: false } },
    { slug: 'direct-abc12345', name: 'Direct', team: { direct: true } },
    { slug: 'home', name: 'Personal', team: null },
    { slug: 'practice', name: 'Practice', practice: true },
  ];

  it('leaves out Direct message projects and keeps everything else in order', () => {
    expect(projectsOffered(products).map((p) => p.slug)).toEqual(['northwind', 'home', 'practice']);
  });

  it('opens on the project she is looking at, ahead of the one she last used', () => {
    const offered = projectsOffered(products);
    expect(startingProject(offered, { defaultProduct: 'home', remembered: 'northwind' })?.slug).toBe('home');
  });

  it('falls back to the one she last used', () => {
    const offered = projectsOffered(products);
    expect(startingProject(offered, { defaultProduct: null, remembered: 'home' })?.slug).toBe('home');
  });

  it('never opens on a Direct project, even when it is the one on screen', () => {
    const offered = projectsOffered(products);
    expect(startingProject(offered, { defaultProduct: 'direct-abc12345', remembered: null })?.slug).toBe('northwind');
  });

  it('does not open on the practice project when there is a real one', () => {
    const offered = projectsOffered([products[3], products[0]]);
    expect(startingProject(offered, { defaultProduct: null, remembered: null })?.slug).toBe('northwind');
  });

  it('gives each project the same swatch every time', () => {
    expect(projectSwatch('northwind')).toBe(projectSwatch('northwind'));
    expect(projectSwatch('northwind')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('To', () => {
  const people = [
    { id: 'p-me', name: 'Sam Rivera', email: 'sam@northwind.test', avatarUrl: null },
    { id: 'p-maya', name: 'Maya Chen', email: 'maya@northwind.test', avatarUrl: null },
    { id: 'p-jun', name: 'Jun Ito', email: 'jun@northwind.test', avatarUrl: null },
  ];

  it('lists every teammate except yourself', () => {
    expect(teammates(people, 'p-me').map((p) => p.id)).toEqual(['p-maya', 'p-jun']);
  });

  it('lists nobody when there is no team', () => {
    expect(teammates([], null)).toEqual([]);
  });

  it('finds a person by any part of their name or the start of their email, in any case', () => {
    const others = teammates(people, 'p-me');
    expect(findPeople(others, 'chen').map((p) => p.id)).toEqual(['p-maya']);
    expect(findPeople(others, 'JUN@').map((p) => p.id)).toEqual(['p-jun']);
    expect(findPeople(others, '  ').map((p) => p.id)).toEqual(['p-maya', 'p-jun']);
  });

  // Caught on the first photograph: "th" kept all four teammates, because all
  // four emails end in @northwind.test. An address is matched from its start.
  it('does not match everyone on the domain the whole team shares', () => {
    const others = teammates(people, 'p-me');
    expect(findPeople(others, 'th').map((p) => p.id)).toEqual([]);
    expect(findPeople(others, 'northwind')).toEqual([]);
  });

  it('finds nobody for a name that is not on the team', () => {
    expect(findPeople(teammates(people, 'p-me'), 'priya')).toEqual([]);
  });

  it('asks an agent what needs doing and a person by their first name', () => {
    expect(placeholderFor(null)).toBe('What do you need done?');
    expect(placeholderFor(people[1])).toBe('Message Maya');
    // The corner under the words says where the message goes, not who sees
    // it: the To field one line above already names them (w-a8e752a9f2).
    // tests/a-message-to-a-person-says-where-it-lands.test.mjs holds the rest.
    expect(landsIn(['Maya'])).toBe("Goes to Maya's inbox.");
  });
});

describe('visibility', () => {
  it('is Team until she picks Private', () => {
    expect(readVisibility(fakeStore())).toBe('team');
  });

  it('is remembered between opens', () => {
    const s = fakeStore();
    writeVisibility('private', s);
    expect(s.m.get(VISIBILITY_KEY)).toBe('private');
    expect(readVisibility(s)).toBe('private');
  });

  it('reads a value it does not know as Team', () => {
    const s = fakeStore();
    s.setItem(VISIBILITY_KEY, 'everyone');
    expect(readVisibility(s)).toBe('team');
  });

  it('reads as Team when the store refuses to be read', () => {
    expect(readVisibility({ getItem: () => { throw new Error('denied'); } })).toBe('team');
  });
});
