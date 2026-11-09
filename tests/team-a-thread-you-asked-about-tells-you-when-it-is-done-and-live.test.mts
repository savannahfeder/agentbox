// A THREAD YOU ASKED ABOUT TELLS YOU WHEN IT IS DONE, AND WHEN IT IS LIVE.
//
// Jordan reported Dr. Ames's double booking to Dev and
// then had nothing to look at. "Finding out if the fix shipped without asking
// Dev. His double-booking thread dropped off his own card, and 'Done' doesn't
// say whether it's live. I had to ask him."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { follow, unfollow, isFollowing, followNews, markTold, readFollows, writeFollows, followWords } from '../renderer/src/team/following.ts';

const now = new Date(2026, 9, 30, 15).getTime();
const since = now - 3_600_000;
const card = (o = {}) => ({ personId: 'dev', threadId: 'w-9', visible: true, title: 'Double booking', state: 'running', updatedAt: now, ...o });
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const following = (o = {}) => [{ owner: 'dev', thread: 'w-9', title: 'Double booking', since, told: {}, ...o }];

describe('following', () => {
  it('starts and stops, once per thread', () => {
    const once = follow(follow([], card(), now), card(), now + 5);
    expect(once).toHaveLength(1);
    expect(once[0].since).toBe(now);
    expect(isFollowing(once, card())).toBe(true);
    expect(isFollowing(once, card({ threadId: 'other' }))).toBe(false);
    expect(unfollow(once, card())).toEqual([]);
  });
  it('is kept on this computer, and a damaged note reads as nothing', () => {
    const store = memory();
    writeFollows(following(), store);
    expect(readFollows(store)).toEqual(following());
    store.setItem('agentbox.team.following', '{oops');
    expect(readFollows(store)).toEqual([]);
  });
});

describe('what it tells you', () => {
  it('nothing while the thread is still open', () => {
    expect(followNews(following(), [card()])).toEqual([]);
  });
  it('that it is done', () => {
    const [n] = followNews(following(), [card({ state: 'done', updatedAt: now })]);
    expect(n).toMatchObject({ kind: 'done', owner: 'dev', thread: 'w-9', at: now });
    expect(followWords(n, 'Dev')).toBe('Dev finished Double booking');
  });
  it('that it is live, once, in place of done', () => {
    const news = followNews(following(), [card({ state: 'done', shippedAt: now - 5 })]);
    expect(news.map((n) => n.kind)).toEqual(['shipped']);
    expect(followWords(news[0], 'Dev')).toBe('Dev shipped Double booking');
  });
  it('that an open thread shipped, and then later that it is done', () => {
    const shipped = followNews(following(), [card({ shippedAt: now - 5 })]);
    expect(shipped.map((n) => n.kind)).toEqual(['shipped']);
    const told = markTold(following(), shipped[0]);
    expect(followNews(told, [card({ shippedAt: now - 5, state: 'done' })])).toEqual([]);
  });
  it('done and then live is two things to hear', () => {
    const [done] = followNews(following(), [card({ state: 'done' })]);
    const told = markTold(following(), done);
    expect(followNews(told, [card({ state: 'done' })])).toEqual([]);
    expect(followNews(told, [card({ state: 'done', shippedAt: now })]).map((n) => n.kind)).toEqual(['shipped']);
  });
  it('not what happened before you started following', () => {
    expect(followNews(following(), [card({ state: 'done', updatedAt: since - 1 })])).toEqual([]);
    expect(followNews(following(), [card({ state: 'done', updatedAt: since })])).toEqual([]);
    expect(followNews(following(), [card({ shippedAt: since - 1 })])).toEqual([]);
  });
  it('nothing about a thread you cannot see any more', () => {
    expect(followNews(following(), [])).toEqual([]);
    expect(followNews(following(), [card({ visible: false, state: 'done' })])).toEqual([]);
  });
  it('nothing about somebody else’s thread of the same id', () => {
    expect(followNews(following(), [card({ personId: 'maya', state: 'done' })])).toEqual([]);
  });
});

describe('where it is wired', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const thread = readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');
  it('commenting on a thread follows it, and so does the button', () => {
    expect(thread).toMatch(/following\?\.follow\(card\)/);
    expect(thread).toContain('Tell me when it is done');
  });
  it('the news is a row in Needs you and counts there', () => {
    expect(app).toContain('<FollowRows');
    expect(app).toMatch(/leadCount \+ sharedFileNews\.length \+ followingNews\.length/);
  });
});
