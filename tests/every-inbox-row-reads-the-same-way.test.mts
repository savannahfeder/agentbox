// EVERY INBOX ROW READS THE SAME WAY: A MARK, THE TITLE, THEN WHO IT IS FROM.
//
// Reported 2026-11-19 with a screenshot of the team inbox: rows from people,
// from AI teammates and from your own threads each started differently, so it
// could not be skimmed. Measured in the renderer: your thread started with its
// title, an AI teammate's with a dashed letter and its name, a message with a
// face and a bold name, a task with a face and a first name, so the titles
// began at four different places. Picked from five photographed layouts
// (w-585619d660): every row now has one slot before the title (a face, or a
// plain ring on your own threads) and the name in grey after the title.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { TeammatesContext } from '../renderer/src/teammates/row-lead.tsx';
globalThis.React = React;

const ME = 'p-me', MAYA = 'p-maya';
const T = Date.parse('2026-11-19T12:00:00');
const people = { [ME]: { id: ME, name: 'Alex Rivera', avatarUrl: null }, [MAYA]: { id: MAYA, name: 'Maya Chen', avatarUrl: null } };
const shared = { slug: 'app', name: 'App', dir: '/tmp/a', team: { projectId: 'p', teamId: 't', visibility: 'team', people: [], sharedBy: null } };
const direct = { slug: 'dm', name: 'Maya Chen', dir: '/tmp/d', team: { projectId: 'd', teamId: 't', visibility: 'people', people: [ME, MAYA], sharedBy: MAYA, direct: true } };
const team = { state: { signedIn: true, cards: [] }, me: ME, byId: new Map(Object.entries(people)), products: new Map([[shared.slug, shared], [direct.slug, direct]]) };
const mates = new Map([['disk', { id: 'disk', name: 'Disk keeper', letter: 'D' }]]);

const row = (over = {}) => ({ id: 'w-1', product: 'app', productName: 'App', status: 'open', kind: 'task', title: 'Fix the sign-in test', labels: ['founder'], priority: 5, createdBy: ME, createdAt: T, updatedAt: T, ...over });
const draw = (item, product = shared) => renderToStaticMarkup(
  React.createElement(TeamContext.Provider, { value: team },
    React.createElement(TeammatesContext.Provider, { value: mates },
      React.createElement(ThreadCells, { item, product, now: T + 60_000, tab: 'inbox' }))));
// The title cell, and what is in it in order: slot, title, grey name.
const titleCell = (html) => html.match(/<div class="th-cell-title[^"]*">([\s\S]*?)<\/div><div class="th-cell-state/)[1];
const nameOf = (html) => titleCell(html).match(/<span class="th-who-name">([^<]*)<\/span>/)?.[1] ?? null;
const slotOf = (html) => titleCell(html).match(/^<span class="th-slot">([\s\S]*?)<\/span>(?=[^<]|<span class="th-(title-text|who-name)|$)/)?.[1] ?? null;

describe('every row starts with the same slot', () => {
  // The agent's face with two eyes, as everywhere else an agent is drawn (2026-11-20).
  it("your own thread has the agent's face and no name", () => {
    const html = draw(row());
    expect(slotOf(html)).toContain('class="agent-face"');
    expect(slotOf(html)).toContain('agent-eyes');
    expect(nameOf(html)).toBeNull();
  });

  it('a person with a photo shows the photo, and one without shows their initials, both in the slot', () => {
    const photo = { ...team, byId: new Map([...team.byId, [MAYA, { ...people[MAYA], avatarUrl: 'https://example.com/maya.jpg' }]]) };
    const handed = row({ createdBy: MAYA, people: [MAYA, ME], assignee: ME });
    const withPhoto = renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: photo }, React.createElement(TeammatesContext.Provider, { value: mates }, React.createElement(ThreadCells, { item: handed, product: shared, now: T + 60_000, tab: 'inbox' }))));
    expect(slotOf(withPhoto)).toContain('maya.jpg');
    expect(slotOf(draw(handed))).toMatch(/class="tm-av"[^>]*>Ma</);
    expect(nameOf(withPhoto)).toBe('Maya Chen');
  });

  it("an AI teammate's thread has its mark first and its name in grey after the title", () => {
    const html = draw(row({ title: 'Start on its first job', labels: ['founder', 'teammate:disk'] }));
    expect(slotOf(html)).toContain('class="tq tq-sm"');
    expect(nameOf(html)).toBe('Disk keeper');
    expect(titleCell(html).indexOf('Start on its first job')).toBeLessThan(titleCell(html).indexOf('Disk keeper'));
  });

  it("a message from a person has their face first, the message as the title, and their full name after", () => {
    const html = draw(row({ id: 'w-2', product: 'dm', labels: [], title: 'Pricing copy', body: 'Can you check the pricing copy?', createdBy: MAYA, people: [MAYA, ME], wrote: { body: { ts: T, by: MAYA, source: 'founder' } } }), direct);
    expect(slotOf(html)).toContain('tm-av');
    expect(nameOf(html)).toBe('Maya Chen');
    expect(titleCell(html)).not.toContain('th-msg-who');
  });

  it('a task a person gave you reads the same way', () => {
    const html = draw(row({ id: 'w-3', product: 'dm', labels: ['given-task'], title: 'Review the checklist', createdBy: MAYA, people: [MAYA, ME], assignee: ME }), direct);
    expect(slotOf(html)).toContain('tm-av');
    expect(nameOf(html)).toBe('Maya Chen');
    expect(titleCell(html)).not.toContain('tq-from');
  });

  it('a thread a person handed you reads the same way, and their note stays after the name', () => {
    const html = draw(row({ createdBy: MAYA, people: [MAYA, ME], assignee: ME, waitingComments: [{ by: MAYA, text: 'Can you take this one?', ts: T }] }));
    expect(slotOf(html)).toContain('tm-av');
    expect(nameOf(html)).toBe('Maya Chen');
    const cell = titleCell(html);
    expect(cell.indexOf('Maya Chen')).toBeLessThan(cell.indexOf('Can you take this one?'));
  });

  // THE CASE THAT MUST NOT CHANGE: nobody's name goes before a title any more.
  it('never puts a name before the title', () => {
    for (const html of [draw(row({ labels: ['founder', 'teammate:disk'] })), draw(row({ createdBy: MAYA, people: [MAYA, ME], assignee: ME }))]) {
      const cell = titleCell(html);
      expect(cell.indexOf('th-who-name')).toBeGreaterThan(cell.indexOf('Fix the sign-in test'));
    }
  });
});
