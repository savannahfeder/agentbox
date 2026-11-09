// YOUR AI TEAMMATES' THREADS SIT ON YOUR BOARD, UNDER THEIR NAMES (w-79cfb9d766).
//
// Reported 2026-11-04 over a screenshot of In progress: "cant determine which
// task im looking for here because it's the one being done by a particular AI
// teammate but the tasks have no indication". Measured on that day's store: the
// one thread an AI teammate was running (its daily product update) carried
// `teammate:<id>` and was not among the nine cards at all, because your own
// board dropped every teammate run (`boardItems` with `mineOnly`), and the
// count over it, the list view and the You card dropped them too. The cards
// already lead with the teammate's mark and name (TeammateLead); there was
// simply no teammate card on the board to wear it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { boardItems, whoseBoard } from '../renderer/src/team/everything/whose-board.ts';
import { InboxBoard } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { TeammatesContext } from '../renderer/src/teammates/row-lead.tsx';
import { teammateIdOf } from '../shared/teammates.mts';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NOW = Date.now();
const ME = 'p-me';
const item = (id, title, labels = ['founder']) => ({
  id, product: 'app', productName: 'App', status: 'open', kind: 'directive', title, labels, priority: 5, epoch: 1, claim: null,
  createdAt: NOW - 3_600_000, updatedAt: NOW - 60_000, createdBy: ME, visibility: 'team',
});
const mine = item('w-mine', 'Cloud credential persistence');
const update = item('w-update', 'Daily product update', ['founder', 'teammate:t-aaaaaaaa', 'hop:0']);
const triage = item('w-triage', 'Triage new issues', ['teammate:t-bbbbbbbb', 'hop:0']);
const items = [mine, update, triage];
const who = { me: ME, people: [ME, 'p-maya'], team: 'room:r-team' };
const on = (key) => boardItems(items, whoseBoard(key, 'agents', who), teammateIdOf).map((i) => i.id).sort();

describe('your own board', () => {
  it('holds the thread your AI teammate is running, beside your own', () => {
    expect(on('me')).toEqual(['w-mine', 'w-triage', 'w-update']);
    expect(on(null)).toEqual(['w-mine', 'w-triage', 'w-update']);
  });

  it('an AI teammate\'s own board still holds only its runs, not yours or another teammate\'s', () => {
    expect(on('mate:t-aaaaaaaa')).toEqual(['w-update']);
    expect(on('mate:t-bbbbbbbb')).toEqual(['w-triage']);
  });

  it('the Team board holds them all, as before', () => {
    expect(on('room:r-team')).toEqual(['w-mine', 'w-triage', 'w-update']);
  });
});

const products = [{ slug: 'app', name: 'App', team: { visibility: 'team', people: [] } }];
const team = { state: { since: NOW - 7 * 86_400_000, signedIn: true }, me: ME, byId: new Map(), products: new Map() };
const mates = new Map([
  ['t-aaaaaaaa', { id: 't-aaaaaaaa', name: 'Growth', letter: 'G' }],
  ['t-bbbbbbbb', { id: 't-bbbbbbbb', name: 'Release', letter: 'R' }],
]);
const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const cards = (rows) => {
  const html = renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
    React.createElement(TeammatesContext.Provider, { value: mates },
      React.createElement(InboxBoard, { items: rows, products, display, now: NOW, stateOf: () => 'running', onOpenItem: () => {}, picked: [ME] }))));
  return [...html.matchAll(/<button type="button" class="th-card[^>]*>([\s\S]*?)<\/button>/g)]
    .map((m) => m[1].match(/<div class="t">([\s\S]*?)<\/div>/)[1]);
};
const lead = (t) => t.match(/<span class="tq-from">[\s\S]*?<b>([^<]*)<\/b><\/span>/)?.[1] ?? null;

describe('each card on it', () => {
  it('a teammate\'s run starts with that teammate\'s name', () => {
    const [a, b] = cards([update, triage]);
    expect([lead(a), lead(b)].sort()).toEqual(['Growth', 'Release']);
  });

  it('your own thread starts with its title and no name', () => {
    expect(lead(cards([mine])[0])).toBeNull();
  });
});

describe('everything that counts or lists your threads agrees with the board', () => {
  const app = read('renderer/src/App.tsx');
  it('the In progress count, the list view and the You card no longer drop teammate runs', () => {
    expect(app).not.toMatch(/yoursOnly\(/);
  });

  it('the phone, which draws no teammate name on a card, keeps them off its own board', () => {
    expect(read('mobile/src/lib/everything.ts')).toMatch(/export const myItems = [^\n]*!teammateIdOf\(/);
  });
});
