// THE SUMMARY PANEL, THE TOP BAR'S STATE AND BUTTON, AND A TEAMMATE'S CARD
// DRAW THE APPROVED FIELDS AND NOTHING NEW.
//
// Approved 2026-10-01 (w-e731ca9376, round 9, c1-summary-open.png and
// c2-teammate.png). Her words on the teammate's card: "It should contain the
// same information as the summary task... it shouldn't have new information."
// So the card is pinned to exactly the summary's fields, and a private card is
// pinned to saying only "Private thread", whose it is and its state. The status
// is one of four words and only four (never "Needs your pick", which round 7
// drew and she turned down). Drawn with react-dom/server, so these are the
// real components and not a copy of their markup.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel, ThreadStatusAndToggle, TeammateCard, MessagePerson } from '../renderer/src/threads/Summary.tsx';
globalThis.React = React;

const NOW = Date.now();
const M = 60_000;
const item = (o = {}) => ({
  id: 'w-acme', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Acme renewal terms', kind: 'directive',
  labels: ['founder'], priority: 7, epoch: 0, claim: null, createdAt: NOW - 60 * M, updatedAt: NOW - 19 * M,
  result: 'Send these terms, or change the discount first?',
  problem: 'Acme’s contract ends on the 14th and the renewal terms are not drafted.',
  progress: 'Terms are drafted at 8% over last year.',
  blockedBy: ['w-google'], blocks: ['w-hidden'],
  wrote: { progress: { ts: NOW - 19 * M, source: 'agent' } },
  ...o,
});
const items = [item(), { ...item({ id: 'w-google', title: 'Sign in with Google' }) }];
const draw = (el) => renderToStaticMarkup(el);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the top bar', () => {
  it('says the state in a plain word with its mark, then a square Summary button with its key', () => {
    const html = draw(React.createElement(ThreadStatusAndToggle, { item: item(), open: true, onToggle: () => {} }));
    expect(text(html)).toBe('Waiting Summary S');
    expect(html).toContain('ts-st');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('<kbd>S</kbd>');
  });
  it('says Running, Scheduled and Done for the other three states', () => {
    const say = (o) => text(draw(React.createElement(ThreadStatusAndToggle, { item: item(o), open: false, onToggle: () => {} })));
    expect(say({ status: 'claimed', claim: { holder: 'h', leaseUntil: NOW + M } })).toMatch(/^Running/);
    expect(say({ runAt: NOW + 60 * M })).toMatch(/^Scheduled/);
    expect(say({ status: 'done' })).toMatch(/^Done/);
  });
});

describe('the panel', () => {
  const html = draw(React.createElement(SummaryPanel, { item: item(), items, team: null }));
  const words = text(html);
  it('lists the properties in the approved order', () => {
    expect(words).toMatch(/Status Waiting Owner You Project Northwind Priority High Visible to Team/);
  });
  it('names linked threads by title and the one this Mac cannot see as such', () => {
    expect(words).toMatch(/Linked Blocked by Sign in with Google/);
    expect(words).toMatch(/Blocks A thread you cannot see/);
  });
  it('then the three lines, with the stand-in dim until something is written', () => {
    expect(words).toMatch(/Problem Acme’s contract ends on the 14th/);
    expect(words).toMatch(/Progress Terms are drafted at 8% over last year\./);
    expect(words).toMatch(/Solution Not written yet/);
    expect(html).toMatch(/class="ts-line dim"[^>]*>Not written yet/);
  });
  it('says who kept it up to date last, in one faint line', () => {
    expect(words).toMatch(/Kept up to date by the agent · 19 min ago$/);
  });
  it('draws priority with the app’s own bars, Urgent as a fourth bar and never an exclamation mark', () => {
    expect(html).toMatch(/<span class="prio-bars p3">/);
    const urgent = draw(React.createElement(SummaryPanel, { item: item({ priority: 9 }), items, team: null }));
    expect(urgent).toMatch(/<span class="prio-bars p4"><i><\/i><i><\/i><i><\/i><i><\/i><\/span>Urgent/);
    expect(text(urgent)).not.toContain('!');
    const card = draw(React.createElement(TeammateCard, { card: { personId: 'p', threadId: 't', visible: true, title: 'T', project: 'P', state: 'running', priority: 9, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: NOW }, person: null }));
    expect(card).toContain('prio-bars p4');
    expect(text(card)).not.toContain('!');
  });
  // "Only you" since 2026-10-01: the same words an old thread nobody shared
  // reads (tests/threads-the-summary-names-its-thread-and-shows-what-you-can-change.test.mjs).
  it('reads Only you for a private thread', () => {
    expect(text(draw(React.createElement(SummaryPanel, { item: item({ visibility: 'private' }), items, team: null })))).toMatch(/Visible to Only you/);
  });
  it('uses no em dash anywhere', () => {
    expect(html).not.toContain('—');
  });
});

describe('a teammate’s card', () => {
  const maya = { id: 'p-maya', email: 'maya@x', name: 'Maya Chen', avatarUrl: null };
  const card = {
    personId: 'p-maya', threadId: 'w-acme', visible: true, title: 'Acme renewal terms', project: 'Northwind', state: 'waiting', priority: 7,
    problem: 'Acme’s contract ends on the 14th.', progress: 'Terms are drafted at 8% over last year.', solution: 'One page of terms.',
    blockedBy: [{ id: 'w-google', title: 'Sign in with Google' }], blocks: [{ id: 'w-x', title: null }], updatedAt: NOW - 19 * M,
  };
  it('is exactly the summary’s fields: state, priority, project, visible to, progress first, then the pairs, then the owner', () => {
    const words = text(draw(React.createElement(TeammateCard, { card, person: maya })));
    // "Waiting on Maya": a persona (2026-10-01) could not tell who a waiting card waits on.
    expect(words).toBe('Waiting on Maya High Northwind Visible to the team Terms are drafted at 8% over last year. Problem Acme’s contract ends on the 14th. Solution One page of terms. Blocked by Sign in with Google Blocks A thread you cannot see Ma Maya Chen · kept up to date by the agent · 19 min ago');
  });
  it('shows nothing of a private thread but that it is private, whose it is and its state', () => {
    const words = text(draw(React.createElement(TeammateCard, { card: { ...card, visible: false, title: null, project: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [] }, person: maya })));
    expect(words).toBe('Private thread Ma Maya Chen Waiting');
  });
  it('offers a square button with their face and the words Message and their first name', () => {
    const html = draw(React.createElement(MessagePerson, { person: maya, onMessage: () => {} }));
    expect(text(html)).toBe('Ma Message Maya');
    expect(html).toContain('ts-msgbtn');
  });
});
