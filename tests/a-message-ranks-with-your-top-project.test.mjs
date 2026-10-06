// A MESSAGE FROM A TEAMMATE RANKS WITH YOUR TOP PROJECT, BY ITS OWN PRIORITY.
//
// Reported 2026-10-05 (w-2e8aa16f0f) with a picture of the Threads list: a High
// message from a teammate sat on the last row, under every Low task. "It's at
// the bottom of priority when I would probably put it higher." The cause is the
// project order. A conversation lives in its own direct project, which is never
// in your running order, so it scored zero for its place, and a place in the
// order is worth a hundred points against a level's nine. Measured in the built
// app with a running order of two projects: the message drew eighth of eight
// rows, below three Low ones.
//
// The decision, in the same thread: "it should def be based on priority. The
// issue is the project itself. For now it can just be treated as ranked with
// your top project." So a conversation takes your top project's place, and its
// own level decides where it sits among that project's threads. With no order
// at all nothing changes, because no project has a place to borrow.
import { describe, it, expect } from 'vitest';
import { RANK_STEP, placeScore, productRankScore } from '../shared/rank.mjs';
import { sorted } from '../renderer/src/threads/page-rules.ts';

const NOW = Date.UTC(2026, 9, 5, 17);
const MIN = 60_000;
const byPriority = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const byUpdated = { ...byPriority, sort: 'updated' };
const ORDER = ['team-app', 'video'];
const DIRECT = new Set(['direct-1']);
const row = (id, product, priority, agoMin) => ({ id, product, priority, title: id, status: 'open', updatedAt: NOW - agoMin * MIN });
const ids = (list) => list.map((r) => r.id);

describe('the place a conversation scores', () => {
  it('is your top project’s place', () => {
    expect(placeScore(ORDER, 'direct-1', DIRECT)).toBe(productRankScore(ORDER, 'team-app'));
    expect(placeScore(ORDER, 'direct-1', DIRECT)).toBe(2 * RANK_STEP);
  });

  it('leaves every other project where the order puts it', () => {
    expect(placeScore(ORDER, 'team-app', DIRECT)).toBe(productRankScore(ORDER, 'team-app'));
    expect(placeScore(ORDER, 'video', DIRECT)).toBe(productRankScore(ORDER, 'video'));
  });

  it('does not lift a project you never placed that is not a conversation', () => {
    expect(placeScore(ORDER, 'side-thing', DIRECT)).toBe(0);
  });

  it('is nothing when there is no order, like every other project', () => {
    expect(placeScore([], 'direct-1', DIRECT)).toBe(0);
  });

  it('is the plain project score when nobody says which projects are conversations', () => {
    expect(placeScore(ORDER, 'direct-1')).toBe(0);
  });
});

describe('the Threads list under Sort by Priority', () => {
  const rows = [
    row('team-urgent', 'team-app', 9, 30), row('team-medium', 'team-app', 5, 20), row('team-low', 'team-app', 2, 10),
    row('video-urgent', 'video', 9, 5), row('message-high', 'direct-1', 7, 240),
  ];

  it('puts a High message under your top project’s Urgent and above its Medium, as reported', () => {
    expect(ids(sorted(rows, byPriority, undefined, ORDER, DIRECT)))
      .toEqual(['team-urgent', 'message-high', 'team-medium', 'team-low', 'video-urgent']);
  });

  it('sits a Low message among your top project’s Low threads, newest first', () => {
    const low = [row('team-low-old', 'team-app', 2, 300), row('message-low', 'direct-1', 2, 60), row('team-medium', 'team-app', 5, 1)];
    expect(ids(sorted(low, byPriority, undefined, ORDER, DIRECT))).toEqual(['team-medium', 'message-low', 'team-low-old']);
  });

  it('lets an Urgent message tie with Urgent work in the top project, newest first', () => {
    const urgent = [row('team-urgent', 'team-app', 9, 30), row('message-urgent', 'direct-1', 9, 5)];
    expect(ids(sorted(urgent, byPriority, undefined, ORDER, DIRECT))).toEqual(['message-urgent', 'team-urgent']);
  });

  it('still puts a project you never placed below every placed one', () => {
    const loose = [row('loose-urgent', 'side-thing', 9, 1), ...rows];
    expect(ids(sorted(loose, byPriority, undefined, ORDER, DIRECT)).at(-1)).toBe('loose-urgent');
  });

  it('with no order at all, is the level order it was', () => {
    expect(ids(sorted(rows, byPriority, undefined, [], DIRECT)))
      .toEqual(['video-urgent', 'team-urgent', 'message-high', 'team-medium', 'team-low']);
  });

  it('does not touch Sort by Updated', () => {
    expect(ids(sorted(rows, byUpdated, undefined, ORDER, DIRECT)))
      .toEqual(['video-urgent', 'team-low', 'team-medium', 'team-urgent', 'message-high']);
  });
});
