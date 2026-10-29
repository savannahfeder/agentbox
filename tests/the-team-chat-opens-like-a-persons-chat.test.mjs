// THE TEAM CHAT OPENS LIKE A PERSON'S CHAT (w-b5f23cff71).
//
// "For the team chat it should just be treated like an individual person
// chat. You don't need anything special." A person's card opened under a bar
// with their face, their name, Messages and Agents tabs and how many agents
// they run. The team chat's card opened under a bar with its name alone, so
// in the built pictures (designs 68 and 73) it read as a second idea for the
// same page. Now the team chat opens under the same bar: Messages is the
// team's chat, Agents is every thread the people on your team and your AI
// teammates share, and the bar says how many agents the team runs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildMembers, teamRunsOf } from '../renderer/src/team/everything/members.ts';
import { TeamThreads } from '../renderer/src/team/everything/TeamStrip.tsx';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const person = (id, name) => ({ id, name, avatarUrl: null });
const card = (id, name, agents, me = false) => ({ id, name, me, avatarUrl: null, agents, level: 10, workingOn: null, workingPrivate: false, status: null });
const mate = (id, name) => ({ id, name, letter: name[0], role: null, now: null, status: 'active', paused: false });
const team = (wall, mates = [], mateAgents = new Map()) => buildMembers({
  me: person('p-me', 'Sam Rivera'),
  people: [person('p-me', 'Sam Rivera'), person('p-maya', 'Maya Chen'), person('p-theo', 'Theo Park'), person('p-priya', 'Priya Nair')],
  wall, teammates: mates, mateAgents, teamRoomId: 'r-team',
  chats: [
    { key: 'room:r-team', name: 'Northwind', faces: [], last: '', at: 2, unread: false },
    { key: 'room:r-general', name: 'General', faces: [], last: '', at: 1, unread: false },
  ],
});

// Yours were left out while the Team's tab listed only the others' threads. Its
// board is everybody's work now, yours included (w-2b3e1a85e5), so its count is too.
describe('the team chat\'s count', () => {
  it('is every agent the team runs: you, the people on your team and your AI teammates', () => {
    const members = team([card('p-me', 'Sam Rivera', 3, true), card('p-maya', 'Maya Chen', 5), card('p-theo', 'Theo Park', 2), card('p-priya', 'Priya Nair', 0)],
      [mate('t-ada', 'Ada'), mate('t-rex', 'Rex')], new Map([['t-ada', 2], ['t-rex', 1]]));
    expect(members.find((m) => m.key === 'room:r-team').agents).toBe(13);
  });

  it('adds nothing for someone who keeps their agents to themselves', () => {
    const members = team([card('p-me', 'Sam Rivera', 3, true), card('p-maya', 'Maya Chen', null), card('p-theo', 'Theo Park', 2), card('p-priya', 'Priya Nair', null)]);
    expect(members.find((m) => m.key === 'room:r-team').agents).toBe(5);
  });

  it('is only the team chat\'s: another chat runs no agents', () => {
    const members = team([card('p-maya', 'Maya Chen', 5)]);
    expect(members.find((m) => m.key === 'room:r-general').agents).toBeNull();
  });
});

const DAY = Date.parse('2026-10-26T00:00:00');
const thread = (personId, threadId, state, updatedAt, visible = true) => ({ personId, threadId, title: threadId, state, updatedAt, visible, project: 'Onboard', priority: 2 });
const run = (id, mateId, status, updatedAt) => ({ id, product: 'onboard', labels: [`teammate:${mateId}`], status, updatedAt });

describe('the team chat\'s Agents', () => {
  const cards = [
    thread('p-maya', 'Billing page', 'running', DAY + 50),
    thread('p-theo', 'Lock screen reply', 'waiting', DAY + 90),
    thread('p-maya', 'Old copy', 'done', DAY - 10),
    thread('p-theo', 'Private one', 'running', DAY + 95, false),
    thread('p-me', 'Mine', 'running', DAY + 99),
  ];
  const items = [run('w-1', 't-ada', 'claimed', DAY + 70), run('w-2', 't-ada', 'done', DAY + 80), run('w-3', 't-rex', 'open', DAY + 60)];
  const runs = teamRunsOf(cards, items, ['p-maya', 'p-theo'], ['t-ada', 't-rex'], DAY);
  const ids = runs.map((r) => r.card ? r.card.threadId : r.item.id);

  it('holds the people\'s shared threads and the AI teammates\' threads, working first, then newest', () => {
    expect(ids).toEqual(['w-1', 'Billing page', 'Lock screen reply', 'w-3', 'w-2']);
  });

  it('leaves out yours, one not shared, and one finished before today', () => {
    for (const gone of ['Mine', 'Private one', 'Old copy']) expect(ids).not.toContain(gone);
  });

  it('names whose each thread is', () => {
    const people = new Map([['p-maya', { name: 'Maya Chen', url: null }], ['p-theo', { name: 'Theo Park', url: null }]]);
    const html = renderToStaticMarkup(h(TeamThreads, { runs: runs.filter((r) => r.card), people, products: [], now: DAY + 100, onOpenItem() {}, onOpenCard() {} }));
    expect(html).toMatch(/class="tq-from"><span[^>]*>MA<\/span><b>Maya Chen<\/b><\/span>Billing page/);
    expect(html).toContain('<b>Theo Park</b>');
    expect(html).toContain('ev-rows team');
    // In the inbox's words: a running thread is Working there, beside the AI teammates' rows.
    expect(html).toMatch(/Billing page[\s\S]*?Working/);
    expect(html).not.toContain('In progress');
  });
});

describe('in the app', () => {
  // Other chats open on the Chats page, never under the cards (w-2b3e1a85e5).
  it('opens the Team under a person\'s bar, and no other chat under the cards', () => {
    expect(app).toMatch(/: <SpaceBar m=\{evMember\} tabs=\{\[\]\} onMessage=/);
    expect(app).not.toMatch(/evMember\.kind === 'chat' && !evMember\.team \? <SpaceBar/);
  });

  it('opens its Messages as the team\'s chat and its Agents under the cards', () => {
    expect(app).toContain("if (key.startsWith('room:') && tab === 'messages')");
    expect(app).toMatch(/evMember\.kind === 'chat'\s*\? <TeamThreads/);
  });
});
