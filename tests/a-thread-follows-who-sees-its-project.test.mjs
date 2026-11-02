// A THREAD FOLLOWS WHO SEES ITS PROJECT (w-b989839656, approved 2026-10-05).
//
// What was wrong: there were two privacy dials that did not agree. A project
// was "private" (never synced) yet every thread in it still put its summary on
// the Team page unless that one thread was marked private, so a project could
// not honestly be called Just you. Measured before the change: cardsFor
// published a card for a new thread in a project nobody had shared, and there
// was no project-level setting anywhere to stop it.
//
// The decision: projects stay on each Mac (nothing of one is synced), and a
// project has one setting, who sees its threads on the Team page: Just you,
// the team, or chosen people. A thread follows it unless the thread itself was
// set otherwise (the New thread card's chip still sets that, per thread). New
// projects start as Just you; a project from before this keeps the team, which
// is what it already did; My Workspace is always Just you.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cardsFor, shownToTeam, shownToPeople, visibilityOf, projectSeenBy } from '../shared/thread-cards.mjs';
import { rowSharing } from '../renderer/src/threads/page-rules.ts';
import { whoSees } from '../renderer/src/threads/summary-rules.ts';
import { startingVisibility, startingChosen } from '../renderer/src/threads/composer-rules.ts';
import { ProjectsPage } from '../renderer/src/components/ProjectsPage.tsx';
import { ProjectShare, ProjectWho, seenByWords } from '../renderer/src/team/ProjectShare.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { Store } from '../main/store.mjs';
globalThis.React = React;

const SINCE = 1_000_000;
const AFTER = SINCE + 10;
const ME = 'p-me', THEO = 'p-theo', ANA = 'p-ana';
const proj = (slug, extra = {}) => ({ slug, name: slug[0].toUpperCase() + slug.slice(1), team: null, ...extra });
const justYou = proj('harbour', { seenBy: 'private' });
const theTeam = proj('northwind', { seenBy: 'team' });
const before = proj('website');
const chosen = proj('payroll', { seenBy: 'people', seenByPeople: [THEO, ANA] });
const nobody = proj('ghost', { seenBy: 'people', seenByPeople: [] });
const mine = proj('my-workspace', { personal: true, seenBy: 'team' });
const row = (id, product, extra = {}) => ({ id, product: product.slug, title: `Thread ${id}`, status: 'open', createdAt: AFTER, updatedAt: AFTER, createdBy: ME, ...extra });

describe('what a project says', () => {
  it('reads each word, and a project from before this keeps the team', () => {
    expect(projectSeenBy(justYou)).toEqual({ who: 'private', people: [] });
    expect(projectSeenBy(theTeam)).toEqual({ who: 'team', people: [] });
    expect(projectSeenBy(before)).toEqual({ who: 'team', people: [] });
    expect(projectSeenBy(chosen)).toEqual({ who: 'people', people: [THEO, ANA] });
  });
  it('chosen people naming nobody is Just you, never the team', () => {
    expect(projectSeenBy(nobody)).toEqual({ who: 'private', people: [] });
  });
  it('My Workspace is Just you whatever its file says', () => {
    expect(projectSeenBy(mine)).toEqual({ who: 'private', people: [] });
  });
  it('a word it does not know is the team, the way it was', () => {
    expect(projectSeenBy(proj('odd', { seenBy: 'everyone' }))).toEqual({ who: 'team', people: [] });
  });
});

describe('a thread with no word of its own follows its project', () => {
  it('Just you hides it', () => {
    expect(visibilityOf(row('a', justYou), justYou)).toBe('private');
    expect(shownToTeam(row('a', justYou), SINCE, justYou)).toBe(false);
  });
  it('the team shows it', () => expect(shownToTeam(row('b', theTeam), SINCE, theTeam)).toBe(true));
  it('chosen people reach exactly them', () => {
    expect(shownToTeam(row('c', chosen), SINCE, chosen)).toBe(true);
    expect(shownToPeople(row('c', chosen), chosen)).toEqual([THEO, ANA]);
  });
  it('a thread from before you joined stays yours, whatever the project says', () => {
    expect(shownToTeam(row('d', theTeam, { createdAt: SINCE - 1 }), SINCE, theTeam)).toBe(false);
    expect(shownToTeam(row('d', chosen, { createdAt: SINCE - 1 }), SINCE, chosen)).toBe(false);
  });
});

describe('a thread that says otherwise wins', () => {
  it('Team in a Just you project is shown', () => expect(shownToTeam(row('e', justYou, { visibility: 'team' }), SINCE, justYou)).toBe(true));
  it('Private in a team project is hidden', () => expect(shownToTeam(row('f', theTeam, { visibility: 'private' }), SINCE, theTeam)).toBe(false));
  it('its own people, not the project’s', () => {
    expect(shownToPeople(row('g', chosen, { visibility: 'people', visibleTo: [ANA] }), chosen)).toEqual([ANA]);
    expect(shownToPeople(row('h', chosen, { visibility: 'team' }), chosen)).toEqual([]);
  });
});

describe('the Team page cards', () => {
  const items = {
    harbour: [row('quiet', justYou), row('loud', justYou, { visibility: 'team' })],
    northwind: [row('open', theTeam, { blockedBy: ['quiet', 'few'] })],
    payroll: [row('few', chosen)],
  };
  const cards = cardsFor({ products: [justYou, theTeam, chosen], readItems: (p) => items[p.slug], now: AFTER + 100, since: SINCE });
  const card = (id) => cards.find((c) => c.threadId === id);
  it('publishes what each project and thread allow, and nothing else', () => {
    expect(cards.map((c) => c.threadId).sort()).toEqual(['few', 'loud', 'open']);
  });
  it('a chosen-people project’s card reaches only its people', () => {
    expect(card('few').people).toEqual([THEO, ANA]);
    expect(card('open').people).toBeNull();
  });
  it('names neither a hidden thread nor a chosen-people one in another card’s links', () => {
    expect(card('open').blockedBy).toEqual([{ id: 'quiet', title: null }, { id: 'few', title: null }]);
  });
});

describe('the window reads the same rule', () => {
  const T = { me: ME, since: SINCE };
  it('the inbox lock', () => {
    expect(rowSharing(row('a', justYou), justYou, T)).toBe('private');
    expect(rowSharing(row('a', theTeam), theTeam, T)).toBe('team');
    expect(rowSharing(row('a', chosen), chosen, T)).toBe('people');
  });
  it('the summary panel', () => {
    expect(whoSees(row('a', justYou), SINCE, justYou)).toBe('private');
    expect(whoSees(row('a', chosen), SINCE, chosen)).toBe('people');
  });
});

describe('the New thread card starts where the project is, and stays changeable', () => {
  it('starts on each project’s word', () => {
    expect(startingVisibility(justYou)).toBe('private');
    expect(startingVisibility(theTeam)).toBe('team');
    expect(startingVisibility(before)).toBe('team');
    expect(startingVisibility(chosen)).toBe('people');
    expect(startingVisibility(mine)).toBe('private');
    expect(startingVisibility(null)).toBe('team');
  });
  it('a chosen-people project starts with its people ticked', () => {
    expect(startingChosen(chosen)).toEqual([THEO, ANA]);
    expect(startingChosen(theTeam)).toEqual([]);
  });
  it('the chip is still the card’s own control', () => {
    const src = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/const visibility: Visibility = picked \?\? startingVisibility\(product\)/);
    expect(src).toMatch(/title="Who sees it"/);
  });
});

const PEOPLE = [
  { id: ME, name: 'Maya Chen', email: 'maya@northwind.test', avatarUrl: null },
  { id: THEO, name: 'Theo Park', email: 'theo@northwind.test', avatarUrl: null },
  { id: ANA, name: 'Ana Ruiz', email: 'ana@northwind.test', avatarUrl: null },
];
const team = { state: { signedIn: true, since: SINCE, people: PEOPLE, team: { id: 't1', name: 'Northwind' } }, me: ME, byId: new Map(PEOPLE.map((p) => [p.id, p])), products: new Map() };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the Projects list says who sees each one', () => {
  // The column is handed in by the team build, the way App does it; with
  // nobody signed in App hands nothing, and there is no column.
  const page = (t) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: t },
    React.createElement(ProjectsPage, {
      ranked: [theTeam, justYou, chosen, mine].map((p) => ({ ...p, dir: `/x/${p.slug}` })), details: [], onOpen: () => {}, onSetOrder: () => {},
      who: t ? (p) => React.createElement(ProjectWho, { product: p }) : undefined,
    })));
  it('in a Who sees it column, on a team', () => {
    const t = text(page(team));
    expect(t).toMatch(/Who sees it/);
    expect(t).toMatch(/Northwind .*Team/);
    expect(t).toMatch(/Harbour .*Just you/);
    expect(t).toMatch(/Payroll .*Theo and Ana/);
    expect(t).toMatch(/My-workspace .*Just you/);
  });
  it('and not at all with nobody signed in', () => {
    expect(text(page(null))).not.toMatch(/Who sees it|Just you/);
  });
});

describe('the Share button is drawn as how the project is shared', () => {
  const button = (product) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
    React.createElement(ProjectShare, { product, onChange: () => {} })));
  it('says Just you, the team’s name, or the people', () => {
    expect(text(button(justYou))).toBe('Just you');
    expect(text(button(theTeam))).toBe('Northwind team');
    expect(text(button(chosen))).toBe('Theo and Ana');
  });
  it('My Workspace’s cannot be changed', () => {
    expect(button(mine)).toMatch(/disabled=""/);
    expect(text(button(mine))).toBe('Just you');
  });
  it('the words match the column', () => {
    expect(seenByWords(chosen, team.byId, 'Northwind')).toEqual({ who: 'people', short: 'Theo and Ana', long: 'Theo and Ana' });
    expect(seenByWords(theTeam, team.byId, 'Northwind')).toEqual({ who: 'team', short: 'Team', long: 'Northwind team' });
  });
});

describe('the store keeps it in the project', () => {
  let tmp, accountRoot, store;
  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seen-by-'));
    accountRoot = path.join(tmp, 'accounts', 'a');
    fs.mkdirSync(path.join(accountRoot, 'old'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'old', 'project.json'), JSON.stringify({ id: 'old', name: 'Old' }));
    fs.mkdirSync(path.join(accountRoot, 'mine'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, 'mine', 'project.json'), JSON.stringify({ id: 'mine', name: 'My Workspace', personal: true }));
    store = await new Store({ storeRoot: tmp, accountId: 'a', accountRoot, products: [] }).init();
  });
  afterEach(() => { store.unwatch?.(); fs.rmSync(tmp, { recursive: true, force: true }); });
  const listed = (slug) => store.listProducts().find((p) => p.slug === slug);

  it('a new project starts as Just you', () => {
    store.createProduct({ name: 'Lantern' });
    expect(projectSeenBy(listed('lantern'))).toEqual({ who: 'private', people: [] });
  });
  it('a project from before keeps the team', () => {
    expect(projectSeenBy(listed('old'))).toEqual({ who: 'team', people: [] });
  });
  it('writes each word to the project, people cleaned', () => {
    store.setProductSeenBy('old', { who: 'people', people: [THEO, THEO, '', ANA] });
    expect(projectSeenBy(listed('old'))).toEqual({ who: 'people', people: [THEO, ANA] });
    store.setProductSeenBy('old', { who: 'private' });
    expect(projectSeenBy(listed('old'))).toEqual({ who: 'private', people: [] });
  });
  it('refuses a word it does not know, and My Workspace', () => {
    expect(() => store.setProductSeenBy('old', { who: 'everyone' })).toThrow();
    expect(() => store.setProductSeenBy('mine', { who: 'team' })).toThrow(/My Workspace/);
    expect(projectSeenBy(listed('mine'))).toEqual({ who: 'private', people: [] });
  });
  it('and the window can reach it', () => {
    const preload = fs.readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8');
    const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');
    expect(preload).toMatch(/projectSeenBy: \(payload\) => ipcRenderer\.invoke\('zero:project-seen-by', payload\)/);
    expect(ipc).toMatch(/ipcMain\.handle\('zero:project-seen-by'/);
  });
  it('the button and the column are handed into Settings by the team build', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/projectShare=\{team \?/);
    expect(app).toMatch(/projectWho=\{team \?/);
  });
});
