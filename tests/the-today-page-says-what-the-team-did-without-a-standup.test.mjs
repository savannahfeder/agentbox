// THE TODAY PAGE SAYS WHAT THE TEAM DID WITHOUT A STANDUP (2026-10-31).
//
// People on a team got status only by asking the chief of staff, and
// its brief was "a wall of text with internal ids". The app already holds
// what a standup says: threads finished and shipped, decisions marked, who is
// blocked on whom, what waits on you. Measured by building a day from the
// store's own shapes and reading back each person's lines and the top count.
import { describe, it, expect } from 'vitest';
import { teamToday, todayLine, rangeOf } from '../renderer/src/team/today.ts';

const NOW = new Date(2026, 9, 31, 15, 0).getTime();
const at = (h, dayOffset = 0) => new Date(2026, 9, 31 + dayOffset, h, 0).getTime();
const products = [{ slug: 'lumen', name: 'Lumen', team: {} }, { slug: 'direct-dev', name: 'Dev', team: { direct: true } }];
const item = (o) => ({ product: 'lumen', status: 'open', labels: [], updatedAt: at(9), createdAt: at(8, -3), title: o.id, ...o });
const card = (o) => ({ visible: true, state: 'running', project: 'Lumen', blockedBy: [], blocks: [], people: null, priority: null, problem: null, progress: null, solution: null, updatedAt: at(10), ...o });

const items = [
  item({ id: 'mine-done', title: 'Pricing page copy', status: 'done', updatedAt: at(11) }),
  item({ id: 'mine-old', title: 'Old thing', status: 'done', updatedAt: at(11, -1) }),
  item({ id: 'mine-shipped', title: 'Group bookings v1', status: 'done', shippedAt: at(12), updatedAt: at(12) }),
  item({ id: 'mine-blocked', title: 'Go-live checklist', blockedBy: ['dev-render'] }),
  item({ id: 'task-to-dev', product: 'direct-dev', title: 'Accept the Render invite', labels: ['given-task'], assignee: 'p-dev', createdBy: 'p-me' }),
  item({ id: 'chat-with-dev', product: 'direct-dev', title: 'hey' , status: 'done', updatedAt: at(13) }),
  item({ id: 'cos-done', title: 'Morning brief', labels: ['teammate:t-cos'], status: 'done', updatedAt: at(8) }),
  item({ id: 'agent-row', title: 'live', status: 'done', updatedAt: at(9), agent: { id: 'x' } }),
];
const cards = [
  card({ personId: 'p-dev', threadId: 'dev-done', title: 'Staff passwords', state: 'done', updatedAt: at(10) }),
  card({ personId: 'p-dev', threadId: 'dev-secret', title: null, visible: false, state: 'done', updatedAt: at(11) }),
  card({ personId: 'p-dev', threadId: 'dev-render', title: 'Render account setup', state: 'waiting', blockedBy: [{ id: 'sofia-dns', title: 'DNS' }] }),
  card({ personId: 'p-sofia', threadId: 'sofia-dns', title: 'DNS', state: 'running' }),
  card({ personId: 'p-sofia', threadId: 'sofia-film', title: 'Launch film cut 2', state: 'done', shippedAt: at(14), updatedAt: at(14) }),
];
const decisions = [
  { roomId: 'r1', messageId: 'm1', kind: 'decision', project: null, body: 'Per-clinic passwords, not per-staff', saidBy: 'p-dev', by: 'p-me', on: true, at: at(10) },
  { roomId: 'r1', messageId: 'm2', kind: 'decision', project: null, body: 'Taken back', saidBy: 'p-dev', by: 'p-dev', on: false, at: at(10) },
  { roomId: 'r1', messageId: 'm3', kind: 'priority', project: null, body: 'Ship bookings', saidBy: 'p-dev', by: 'p-dev', on: true, at: at(10) },
];
const needs = [
  item({ id: 'from-dev', product: 'direct-dev', title: 'Pick a go-live date', labels: ['given-task'], assignee: 'p-me', createdBy: 'p-dev' }),
  item({ id: 'cos-asks', title: 'Send the Render line?', labels: ['teammate:t-cos'] }),
  item({ id: 'my-own', title: 'My agent asks' }),
];
const base = {
  now: NOW, me: 'p-me', items, products, cards, decisions, needs,
  mentions: [{ id: 'x1', messageId: 'mm', roomId: 'r1', roomName: 'Team', by: 'p-sofia', byName: 'Sofia', body: '@Maya can you look', at: at(13) }],
  people: [{ id: 'p-dev', name: 'Dev Patel' }, { id: 'p-sofia', name: 'Sofia Ruiz' }, { id: 'p-jordan', name: 'Jordan Lee' }],
  mates: [{ id: 't-cos', name: 'Chief of staff' }],
  mateOf: (r) => r.labels?.find((l) => l.startsWith('teammate:'))?.slice(9) ?? null,
};
const of = (day, key) => day.people.find((p) => p.key === key);
const titles = (lines) => lines.map((l) => l.title);

describe('what each person finished today', () => {
  const day = teamToday({ ...base, range: 'today' });

  it('lists your own threads finished today, not yesterday, not an agent row, not a chat', () => {
    expect(titles(of(day, 'me').finished)).toEqual(['Pricing page copy']);
  });

  it('lists a teammate\'s shared thread finished today, and counts a private one with no title', () => {
    expect(titles(of(day, 'person:p-dev').finished)).toEqual(['Staff passwords']);
    expect(of(day, 'person:p-dev').privateDone).toBe(1);
    expect(JSON.stringify(day)).not.toContain('dev-secret');
  });

  it('lists what your AI teammate finished', () => {
    expect(titles(of(day, 'mate:t-cos').finished)).toEqual(['Morning brief']);
  });

  it('puts a shipped thread under shipped and not again under finished', () => {
    expect(titles(of(day, 'me').shipped)).toEqual(['Group bookings v1']);
    expect(titles(of(day, 'person:p-sofia').shipped)).toEqual(['Launch film cut 2']);
    expect(titles(of(day, 'me').finished)).not.toContain('Group bookings v1');
  });
});

describe('what was decided, what is blocked and on whom, and what waits on you', () => {
  const day = teamToday({ ...base, range: 'today' });

  it('gives a marked decision to whoever said it, and leaves out one taken back and a priority', () => {
    expect(titles(of(day, 'person:p-dev').decided)).toEqual(['Per-clinic passwords, not per-staff']);
    expect(of(day, 'person:p-dev').decided[0].roomId).toBe('r1');
  });

  it('says who a blocked thread waits on, from the thread that blocks it', () => {
    expect(of(day, 'me').blocked.map((l) => [l.title, l.on])).toEqual([['Go-live checklist', 'Dev']]);
    // A task you gave is the holder's open task, not a block of yours.
    expect(titles(of(day, 'person:p-dev').tasks)).toEqual(['Accept the Render invite']);
    expect(of(day, 'person:p-dev').blocked.map((l) => [l.title, l.on])).toEqual([['Render account setup', 'Sofia']]);
  });

  it('puts what waits on you under whoever it is from, and your own agents\' asks under you', () => {
    expect(titles(of(day, 'person:p-dev').waitingOnYou)).toEqual(['Pick a go-live date']);
    expect(titles(of(day, 'mate:t-cos').waitingOnYou)).toEqual(['Send the Render line?']);
    expect(titles(of(day, 'person:p-sofia').waitingOnYou)).toEqual(['@Maya can you look']);
    expect(titles(of(day, 'me').waitingOnYou)).toEqual(['My agent asks']);
  });

  it('names the people with nothing to say rather than drawing them empty', () => {
    expect(day.people.some((p) => p.key === 'person:p-jordan')).toBe(false);
    expect(day.quiet).toEqual(['Jordan']);
  });

  it('says it in one line at the top, counting all of Needs you', () => {
    expect(day.counts).toEqual({ needYou: 4, blocked: 2, shipped: 2, listed: 4 });
    expect(todayLine(day.counts)).toBe('4 things need you, 2 blocked on others, 2 shipped');
    expect(todayLine({ needYou: 1, blocked: 0, shipped: 1 })).toBe('1 thing needs you, 1 shipped');
    expect(todayLine({ needYou: 0, blocked: 0, shipped: 0 })).toBe('Nothing needs you');
  });
});

describe('yesterday and this week', () => {
  it('yesterday is midnight to midnight, the week is the last seven days', () => {
    const y = rangeOf('yesterday', NOW);
    expect([y.from, y.to]).toEqual([at(0, -1), at(0)]);
    expect(rangeOf('week', NOW).from).toBe(at(0, -6));
  });

  it('yesterday holds only yesterday\'s finished threads', () => {
    const day = teamToday({ ...base, range: 'yesterday' });
    expect(titles(of(day, 'me').finished)).toEqual(['Old thing']);
    expect(day.counts.shipped).toBe(0);
  });

  it('this week holds both, newest first', () => {
    const day = teamToday({ ...base, range: 'week' });
    expect(titles(of(day, 'me').finished)).toEqual(['Pricing page copy', 'Old thing']);
  });
});

describe('a big store', () => {
  // About 40 ms alone; a loaded machine running other test files doubles it, so the line is 250 ms.
  it('reads 20,000 threads and 2,000 cards fast enough to draw as you open it', () => {
    const many = Array.from({ length: 20_000 }, (_, i) => item({ id: `i${i}`, status: i % 3 ? 'open' : 'done', updatedAt: at(i % 24, -(i % 9)), blockedBy: i % 50 ? [] : [`c${i}`] }));
    const lots = Array.from({ length: 2_000 }, (_, i) => card({ personId: i % 2 ? 'p-dev' : 'p-sofia', threadId: `c${i}`, state: i % 4 ? 'running' : 'done', updatedAt: at(i % 24, -(i % 9)) }));
    const t = performance.now();
    teamToday({ ...base, items: many, cards: lots, range: 'week' });
    expect(performance.now() - t).toBeLessThan(250);
  });
});
