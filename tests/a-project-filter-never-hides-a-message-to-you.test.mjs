// A PROJECT FILTER NEVER HIDES A MESSAGE TO YOU.
//
// Reported 2026-10-05 (w-5a432fb112) with a picture of the board: "Just you in
// the filters seems to filter out messages to me, which should never happen.
// Messages to me ARE my tasks, just like if an agent sent it to me."
//
// Measured: it was not Just you. The picture has two project chips lit
// (Agentbox Team and Agentbox), and Just you and Everyone each remember their
// own filters, so Everyone had no project chip on and Just you did. A message
// lives in its own conversation project, which no chip ever offers
// (`projectChoices` leaves it out), so ANY project filter hid every message,
// on the list (`keeps`) and on the board (`boardColumns`). Two messages to
// her were open in the store and neither was on the page.
//
// So a message passes the project filter, whatever chips are lit. The other
// filters still read it the way they read any thread of yours.
import { describe, it, expect } from 'vitest';
import { boardColumns, conversationSlugs, keeps } from '../renderer/src/threads/page-rules.ts';

const ME = 'p-me';
const RILEY = 'p-riley';
const NOW = Date.parse('2026-10-05T12:00:00');
const direct = { slug: 'direct-1', name: 'Direct', dir: '/tmp/d', team: { direct: true, people: [ME], sharedBy: RILEY, visibility: 'people' } };
const app = { slug: 'team-app', name: 'Team app', dir: '/tmp/a', team: null };
const video = { slug: 'video', name: 'Video', dir: '/tmp/v', team: null };
const products = [direct, app, video];
const DIRECT = conversationSlugs(products);

const display = (over = {}) => ({ view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any', ...over });
const message = (over = {}) => ({
  id: 'w-msg', product: 'direct-1', productName: 'Direct', status: 'open', title: 'Hi', body: 'Hi, it is Riley.', kind: 'directive',
  priority: 7, createdAt: NOW - 3_600_000, updatedAt: NOW - 3_600_000, createdBy: RILEY, assignee: ME, people: [RILEY, ME],
  wrote: { priority: { ts: NOW, source: 'agent' }, body: { ts: NOW, source: 'founder', by: RILEY } },
  ...over,
});
const task = (product, over = {}) => ({
  id: `w-${product}`, product, status: 'open', title: product, kind: 'directive', priority: 7,
  createdAt: NOW - 3_600_000, updatedAt: NOW - 3_600_000, createdBy: ME, visibility: 'team', ...over,
});

describe('on the list', () => {
  it('keeps a message to you with a project chip lit, as reported', () => {
    expect(keeps(message(), display({ projects: ['team-app'] }), NOW, null, DIRECT)).toBe(true);
  });

  it('keeps it with several chips lit', () => {
    expect(keeps(message(), display({ projects: ['team-app', 'video'] }), NOW, null, DIRECT)).toBe(true);
  });

  it('keeps it with no chip lit, as before', () => {
    expect(keeps(message(), display(), NOW, null, DIRECT)).toBe(true);
  });

  it('still hides a task from a project the chips leave out', () => {
    expect(keeps(task('video'), display({ projects: ['team-app'] }), NOW, 'team', DIRECT)).toBe(false);
    expect(keeps(task('team-app'), display({ projects: ['team-app'] }), NOW, 'team', DIRECT)).toBe(true);
  });

  it('still reads the other filters on a message, like any thread of yours', () => {
    expect(keeps(message(), display({ projects: ['team-app'], priorities: ['urgent'] }), NOW, null, DIRECT)).toBe(false);
    expect(keeps(message({ updatedAt: NOW - 30 * 86_400_000 }), display({ projects: ['team-app'], updated: 'week' }), NOW, null, DIRECT)).toBe(false);
  });

  it('does not let a project through because its slug merely looks like a conversation', () => {
    expect(keeps(task('direct-9'), display({ projects: ['team-app'] }), NOW, 'team', DIRECT)).toBe(false);
  });
});

describe('on the board', () => {
  const stateOf = () => 'waiting';
  const titles = (cols) => cols.flatMap((c) => c.rows).map((e) => e.title);
  const board = (projects, picked = [ME]) => boardColumns({
    items: [message(), task('team-app'), task('video')], products, display: display({ view: 'board', projects }), now: NOW, stateOf, picked, me: ME,
  });

  it('keeps a message to you in Needs you with a project chip lit, as reported', () => {
    expect(titles(board(['team-app']))).toEqual(expect.arrayContaining(['Hi, it is Riley.', 'team-app']));
    expect(titles(board(['team-app']))).not.toContain('video');
  });

  it('keeps it with no chip lit, as before', () => {
    expect(titles(board([]))).toEqual(expect.arrayContaining(['Hi, it is Riley.', 'team-app', 'video']));
  });

  it('keeps it when a teammate is picked too', () => {
    expect(titles(board(['team-app'], [ME, RILEY]))).toContain('Hi, it is Riley.');
  });
});
