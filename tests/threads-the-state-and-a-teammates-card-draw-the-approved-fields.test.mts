// THE THREAD'S STATE AND A TEAMMATE'S CARD DRAW THE APPROVED FIELDS AND
// NOTHING NEW. (The side summary panel this also held went in 2026-11,
// w-d143fcb40a.)
//
// Approved 2026-10-01 after nine design rounds. The rule for the teammate's
// card: it carries the same information as the thread's summary and nothing
// new. So the card is pinned to exactly the summary's fields, and a private
// card is pinned to saying only "Private thread", whose it is and its state.
// The status is one of four words and only four (never "Needs your pick",
// which an earlier round drew and was turned down). Drawn with react-dom/server, so these are the
// real components and not a copy of their markup.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadStateMark, TeammateCard, MessagePerson } from '../renderer/src/threads/Summary.tsx';
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
const draw = (el) => renderToStaticMarkup(el);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// THE STATE MOVED TO THE LINE UNDER THE TITLE on w-e731ca9376 (2026-10-01),
// in place of "Working", and the top bar kept the square Summary button. So
// the state is drawn on its own now; the four words and their marks are the
// same four.
describe('the top bar', () => {
  it('draws the state word with its mark', () => {
    const state = draw(React.createElement(ThreadStateMark, { item: item() }));
    expect(text(state)).toBe('Waiting');
    expect(state).toContain('ts-st');
  });
  it('says Running, Scheduled and Done for the other three states', () => {
    const say = (o) => text(draw(React.createElement(ThreadStateMark, { item: item(o) })));
    expect(say({ status: 'claimed', claim: { holder: 'h', leaseUntil: NOW + M } })).toMatch(/^In progress/);
    expect(say({ runAt: NOW + 60 * M })).toMatch(/^Scheduled/);
    expect(say({ status: 'done' })).toMatch(/^Done/);
  });
});

describe('a teammate’s card', () => {
  const maya = { id: 'p-maya', email: 'maya@x', name: 'Maya Chen', avatarUrl: null };
  const card = {
    personId: 'p-maya', threadId: 'w-acme', visible: true, title: 'Acme renewal terms', project: 'Northwind', state: 'waiting', priority: 7,
    problem: 'Acme’s contract ends on the 14th.', progress: 'Terms are drafted at 8% over last year.', solution: 'One page of terms.',
    blockedBy: [{ id: 'w-google', title: 'Sign in with Google' }], blocks: [{ id: 'w-x', title: null }], updatedAt: NOW - 19 * M,
  };
  // CHANGED 2026-10-05 (w-54e9c7243f): the card follows the panel, Context as
  // the lead and then the Done trail; Problem and Solution are gone.
  // CHANGED 2026-10-30: the card is the column beside the conversation, and the
  // state ("Waiting on Maya") heads the page (TeammateStanding) instead.
  it('is exactly the summary’s fields: context first, then done, the links, then the properties', () => {
    const words = text(draw(React.createElement(TeammateCard, { card, person: maya })));
    expect(words).toBe('About Acme’s contract ends on the 14th. Done Terms are drafted at 8% over last year. Blocked by Sign in with Google Blocks A thread you cannot see Owner MC Maya Chen Priority High Project Northwind Who sees it The team');
  });
  it('shows nothing of a private thread but that it is private, whose it is and its state', () => {
    const words = text(draw(React.createElement(TeammateCard, { card: { ...card, visible: false, title: null, project: null, problem: null, progress: null, solution: null, blockedBy: [], blocks: [] }, person: maya })));
    expect(words).toBe('Private thread MC Maya Chen Waiting');
  });
  it('offers a square button with their face and the words Message and their first name', () => {
    const html = draw(React.createElement(MessagePerson, { person: maya, onMessage: () => {} }));
    expect(text(html)).toBe('MC Message Maya');
    expect(html).toContain('ts-msgbtn');
  });
});
