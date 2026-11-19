// WHO REALLY SEES A THREAD (w-e731ca9376, 2026-10-01). None of her hundreds of
// threads from before she joined is on the Team page (shared/thread-cards.mts
// shownToTeam), but the side summary said "Team" on every one, because it read
// the word on disk rather than the rule. That panel went in 2026-11
// (w-d143fcb40a); the rule, which ⌘K's share rows still read, stays pinned here.
import { describe, it, expect } from 'vitest';
import { whoSees } from '../renderer/src/threads/summary-rules.ts';

const NOW = Date.now();
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY; // she joined the team a week ago
const item = (o = {}) => ({
  id: 'w-acme', product: 'northwind', productName: 'Northwind', status: 'open', kind: 'directive', labels: ['founder'],
  title: 'Can you send Acme their renewal terms by Thursday? Their contract ends on the 14th.',
  label: 'Acme renewal terms', priority: 7, epoch: 0, claim: null, createdAt: NOW - DAY, updatedAt: NOW - DAY, ...o,
});

describe('who sees a thread', () => {
  it('is only you on an old thread nobody shared, and the team on one you shared by hand', () => {
    expect(whoSees(item({ createdAt: SINCE - DAY }), SINCE)).toBe('private');
    expect(whoSees(item({ createdAt: SINCE - DAY, visibility: 'team' }), SINCE)).toBe('team');
  });
  it('is the team on a new thread, and only you on a new one made private', () => {
    expect(whoSees(item({ createdAt: SINCE + DAY }), SINCE)).toBe('team');
    expect(whoSees(item({ createdAt: SINCE + DAY, visibility: 'private' }), SINCE)).toBe('private');
  });
  it('the boundary: a thread started the moment you joined is the team’s', () => {
    expect(whoSees(item({ createdAt: SINCE }), SINCE)).toBe('team');
    expect(whoSees(item({ createdAt: SINCE - 1 }), SINCE)).toBe('private');
  });
  it('keeps the old rule with nobody signed in', () => {
    expect(whoSees(item({ createdAt: 5 }), null)).toBe('team');
  });
});
