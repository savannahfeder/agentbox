// A TEAMMATE SEES THE SUMMARY AND NOTHING MORE.
//
// Her words on the teammate's card, 2026-10-01: "It should contain the same
// information as the summary task... it shouldn't have new information." Each
// Mac publishes one card per thread (shared/thread-cards.mjs). A private
// thread's card says who and in what state, never a word of it. Messages
// between two people are never carded. States are the four predefined ones.
import { describe, it, expect } from 'vitest';
import { threadState, summaryOf, cardsFor, firstSentence } from '../shared/thread-cards.mjs';

const NOW = Date.parse('2026-10-01T15:00:00');
const item = (o) => ({ id: 'w-1', title: 'Acme renewal terms', status: 'open', labels: ['founder'], kind: 'directive', updatedAt: NOW - 60_000, ...o });

describe('the four states', () => {
  it('reads running for a live claim and for work sent to an agent that has not started', () => {
    expect(threadState(item({ status: 'claimed', claim: { holder: 'h' } }), NOW)).toBe('running');
    expect(threadState(item({}), NOW)).toBe('running');
  });
  it('reads waiting once the agent has said something back, or a person holds it', () => {
    expect(threadState(item({ result: 'Send these terms?' }), NOW)).toBe('waiting');
    expect(threadState(item({ assignee: 'p-maya' }), NOW)).toBe('waiting');
    expect(threadState(item({ kind: 'question' }), NOW)).toBe('waiting');
  });
  it('reads scheduled for a later start and done for a finished thread', () => {
    expect(threadState(item({ runAt: NOW + 3_600_000 }), NOW)).toBe('scheduled');
    expect(threadState(item({ status: 'done' }), NOW)).toBe('done');
  });
});

describe('the summary', () => {
  it('is what was written, when something was', () => {
    expect(summaryOf(item({ problem: 'P.', progress: 'Q.', solution: 'S.' }))).toEqual({ problem: 'P.', progress: 'Q.', solution: 'S.', written: true });
  });
  it('stands in with the ask and the latest word until the agent writes one', () => {
    const s = summaryOf(item({ body: 'Pull Acme’s usage. Then draft terms.', result: '**Send these terms?**\n\nAt 8% it is $96,400.\n\n## Options\n1. Send' }));
    expect(s).toEqual({ problem: 'Pull Acme’s usage.', progress: 'Send these terms?', solution: '', written: false });
  });
  it('takes one sentence without its markdown', () => {
    expect(firstSentence('## Heading\n**Bold ask?** More.')).toBe('Bold ask?');
  });
});

describe('the cards a Mac publishes', () => {
  const products = [{ slug: 'nw', name: 'Northwind', team: null }, { slug: 'dm', name: 'dm', team: { direct: true } }];
  const lists = {
    nw: [
      item({ id: 'w-a', problem: 'Contract ends.', progress: 'Drafted.', blockedBy: ['w-c', 'w-b'] }),
      item({ id: 'w-b', title: 'Sign in with Google', visibility: 'private', status: 'claimed', claim: { holder: 'h' } }),
      item({ id: 'w-c', title: 'Legal review', status: 'done', updatedAt: NOW - 3 * 86_400_000 }),
      item({ id: 'w-old', status: 'done', updatedAt: NOW - 3 * 86_400_000 }),
    ],
    dm: [item({ id: 'w-msg', title: 'Can you take the call?', assignee: 'p-maya' })],
  };
  const cards = cardsFor({ products, readItems: (p) => lists[p.slug], now: NOW });

  it('carries the summary of a visible thread and the titles of what blocks it', () => {
    expect(cards.find((c) => c.threadId === 'w-a')).toMatchObject({ visible: true, title: 'Acme renewal terms', project: 'Northwind', state: 'running', problem: 'Contract ends.', progress: 'Drafted.' });
    expect(cards.find((c) => c.threadId === 'w-a').blockedBy[0]).toEqual({ id: 'w-c', title: 'Legal review' });
  });
  // Found by review 2026-10-01: w-a's card said "blocked by Sign in with
  // Google", the title of a thread marked private, on every teammate's board.
  it('never names a private thread in another card\'s links', () => {
    expect(cards.find((c) => c.threadId === 'w-a').blockedBy[1]).toEqual({ id: 'w-b', title: null });
    expect(JSON.stringify(cards)).not.toMatch(/Sign in with Google/);
  });
  // Decided 2026-10-01 from user research: a private thread publishes no card
  // at all. It used to go up as a wordless card with a lock, which still told
  // the team you had private work and how much of it.
  it('publishes no card at all for a private thread', () => {
    expect(cards.find((x) => x.threadId === 'w-b')).toBeUndefined();
    expect(cards.every((c) => c.visible === true)).toBe(true);
  });
  it('never cards a message between two people, or work finished before today', () => {
    expect(cards.map((c) => c.threadId).sort()).toEqual(['w-a']);
  });
});
