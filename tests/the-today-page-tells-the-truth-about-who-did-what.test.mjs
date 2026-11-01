// 2026-10-31: Maya read "Nothing yet today from Dev" while Dev
// had built and merged a page with his agents running all morning; under
// "You" she read FINISHED on the task she gave Dev, which Dev had closed by a
// stray key; nothing said blocked or decided though she had approved two
// files. Dev read "6 things need you" over two lines, none of them his own
// agents' asks. Measured by feeding teamToday the store's shapes for each case
// and reading back each person's sections and the top line.
import { describe, it, expect } from 'vitest';
import { teamToday, todayParts } from '../renderer/src/team/today.ts';

const NOW = new Date(2026, 9, 31, 15, 0).getTime();
const at = (h, dayOffset = 0) => new Date(2026, 9, 31 + dayOffset, h, 0).getTime();
const products = [{ slug: 'lumen', name: 'Lumen', team: {} }, { slug: 'direct-dev', name: 'Dev', team: { direct: true } }];
const item = (o) => ({ product: 'lumen', status: 'open', labels: [], updatedAt: at(9), createdAt: at(8), title: o.id, ...o });
const card = (o) => ({ visible: true, state: 'running', project: 'Lumen', blockedBy: [], blocks: [], people: null, priority: null, problem: null, progress: null, solution: null, updatedAt: at(10), ...o });
const base = {
  range: 'today', now: NOW, me: 'p-maya', products, items: [], cards: [], decisions: [], needs: [],
  people: [{ id: 'p-dev', name: 'Dev Patel' }, { id: 'p-sofia', name: 'Sofia Ruiz' }],
  mates: [{ id: 't-cos', name: 'Chief of staff' }],
  mateOf: (r) => r.labels?.find((l) => l.startsWith('teammate:'))?.slice(9) ?? null,
};
const of = (day, key) => day.people.find((p) => p.key === key);
const titles = (lines = []) => lines.map((l) => l.title);

describe('what someone is working on today', () => {
  const day = teamToday({ ...base, cards: [
    card({ personId: 'p-dev', threadId: 'd1', title: 'Group bookings v1', state: 'running', updatedAt: at(11) }),
    card({ personId: 'p-dev', threadId: 'd2', title: 'Onboarding B build', state: 'waiting', updatedAt: at(12) }),
    card({ personId: 'p-dev', threadId: 'd3', title: 'Old spike', state: 'running', updatedAt: at(12, -1) }),
  ], items: [
    item({ id: 'mine-running', title: 'October investor update', status: 'claimed', updatedAt: at(10) }),
    item({ id: 'mine-old', title: 'Last week', updatedAt: at(10, -2) }),
    item({ id: 'cos-run', title: 'Morning brief', labels: ['teammate:t-cos'], updatedAt: at(9) }),
  ] });

  it('lists a teammate\'s open threads that moved today, so Dev is not "nothing yet"', () => {
    expect(titles(of(day, 'person:p-dev').working)).toEqual(['Onboarding B build', 'Group bookings v1']);
    expect(day.quiet).not.toContain('Dev');
  });

  it('leaves out a thread that last moved before today', () => {
    expect(titles(of(day, 'person:p-dev').working)).not.toContain('Old spike');
    expect(titles(of(day, 'me').working)).not.toContain('Last week');
  });

  it('lists your own threads and your AI teammate\'s runs in progress', () => {
    expect(titles(of(day, 'me').working)).toEqual(['October investor update']);
    expect(titles(of(day, 'mate:t-cos').working)).toEqual(['Morning brief']);
  });

  it('does not list a thread twice, as waiting on you and as working on', () => {
    const asks = item({ id: 'asks', title: 'Is the draft ready to share?', updatedAt: at(11) });
    const d = teamToday({ ...base, items: [asks], needs: [asks] });
    expect(titles(of(d, 'me').waitingOnYou)).toEqual(['Is the draft ready to share?']);
    expect(of(d, 'me').working).toEqual([]);
  });
});

describe('what needs you is all on the page, or the page says where the rest are', () => {
  it('puts your own agents\' asks under you, so the count matches the lines', () => {
    const needs = [item({ id: 'a1', title: 'Merge onboarding B?' }), item({ id: 'a2', title: 'Wait for Jordan?' })];
    const day = teamToday({ ...base, needs, needsCount: 2 });
    expect(titles(of(day, 'me').waitingOnYou)).toEqual(['Merge onboarding B?', 'Wait for Jordan?']);
    expect(todayParts(day.counts)).toEqual(['2 things need you']);
  });

  it('says how many are only in Needs you when some rows have no line here', () => {
    const day = teamToday({ ...base, needs: [item({ id: 'a1', title: 'Merge onboarding B?' })], needsCount: 3 });
    expect(todayParts(day.counts)[0]).toBe('3 things need you, 2 of them only in Needs you');
  });
});

describe('a task you gave someone', () => {
  const task = (o) => item({ product: 'direct-dev', title: 'Fix double booking issue', labels: ['given-task'], assignee: 'p-dev', createdBy: 'p-maya', ...o });

  it('closed by them is theirs to have finished, not yours', () => {
    const day = teamToday({ ...base, items: [task({ id: 't1', status: 'done', updatedAt: at(6), wrote: { status: { ts: at(6), source: 'founder', by: 'p-dev' } } })] });
    expect(titles(of(day, 'me')?.finished)).toEqual([]);
    expect(titles(of(day, 'person:p-dev').finished)).toEqual(['Fix double booking issue']);
  });

  it('closed by you stays yours', () => {
    const day = teamToday({ ...base, items: [task({ id: 't1', status: 'done', updatedAt: at(6), wrote: { status: { ts: at(6), source: 'founder', by: 'p-maya' } } })] });
    expect(titles(of(day, 'me').finished)).toEqual(['Fix double booking issue']);
  });

  // This changed: it was Blocked on Dev under you, one job in two
  // states. Now it is one of Dev's tasks (today-lists-every-open-task-by-who-has-it).
  it('still open is one of their tasks, not blocked under you', () => {
    const day = teamToday({ ...base, items: [task({ id: 't1' })] });
    expect(titles(of(day, 'person:p-dev').tasks)).toEqual(['Fix double booking issue']);
    expect(of(day, 'me')).toBeUndefined();
  });
});

describe('what was decided and what is blocked', () => {
  const approvals = [
    { key: 'f1', name: 'onboarding-b.png', by: 'p-maya', at: at(6) },
    { key: 'f2', name: 'group-bookings-spec.md', by: 'p-maya', at: at(7) },
    { key: 'f3', name: 'group-slot-states-v2.png', by: 'p-dev', at: at(6) },
    { key: 'f4', name: 'old.png', by: 'p-maya', at: at(6, -1) },
  ];
  const day = teamToday({ ...base, approvals });

  it('lists a file you approved today as decided by you, and a teammate\'s under them', () => {
    expect(titles(of(day, 'me').decided)).toEqual(['Approved group-bookings-spec.md', 'Approved onboarding-b.png']);
    expect(titles(of(day, 'person:p-dev').decided)).toEqual(['Approved group-slot-states-v2.png']);
  });

  it('leaves out an approval from before today', () => {
    expect(titles(of(day, 'me').decided)).not.toContain('Approved old.png');
  });

  it('lists your own thread its agent marked blocked, when it is not waiting on you', () => {
    const d = teamToday({ ...base, items: [item({ id: 'b1', title: 'Double booking race', status: 'blocked', updatedAt: at(8) })] });
    expect(titles(of(d, 'me').blocked)).toEqual(['Double booking race']);
    expect(of(d, 'me').working).toEqual([]);
  });
});
