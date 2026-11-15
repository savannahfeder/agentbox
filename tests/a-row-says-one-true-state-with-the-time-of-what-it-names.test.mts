// Inbox rows said things that were not so (Maya at
// 20:30). "Launch teaser v8 approval" still read WAITING ON YOU 16 minutes after
// she approved v8 in it; a task read "DEV WROTE BACK, 1 min ago" for Dev's
// message from 7:49am, 13 hours old; and Today drew the same double-booking job
// three times at 8:28pm: BLOCKED on Dev under her, WAITING ON YOU and WORKING ON
// under Dev. Measured by feeding the rules the row's shapes: the row's time came
// from the newest body or answer write (a rewrite of the task moves it, though
// the chat shows nothing new), Today listed a task that was in Needs you as
// blocked as well, and Dev's card for the same task as his work.
import { describe, it, expect } from 'vitest';
import { whatWaits, inMyInbox } from '../shared/team-rules.mts';
import { taskWords } from '../renderer/src/team/company.ts';
import { teamToday } from '../renderer/src/team/today.ts';

const at = (h) => new Date(2026, 9, 31, Math.floor(h), Math.round((h % 1) * 60)).getTime();
const direct = { slug: 'direct-sofia', name: 'Sofia', team: { direct: true, projectId: 'p1' } };
const nameOf = (id) => ({ 'p-dev': 'Dev', 'p-sofia': 'Sofia' }[id] ?? 'Someone');

describe('a message whose file you approved', () => {
  const asked = (approvals) => ({
    id: 'c1', product: 'direct-sofia', status: 'open', labels: [], people: ['p-maya', 'p-sofia'], createdBy: 'p-sofia',
    talk: { chat: [{ by: 'p-sofia', ts: at(20.15), text: 'Please approve launch-teaser-v8.mp4' }], threads: {} },
    artifacts: { notes: [], approvals, seen: {} },
  });

  it('waits on you no longer once you approved it', () => {
    const row = asked([{ file: 'launch-teaser-v8.mp4', by: 'p-maya', ts: at(20.23) }]);
    expect(whatWaits(row, 'p-maya').chat).toBe(0);
    expect(inMyInbox(row, direct, 'p-maya')).toBe(false);
  });

  it('still waits when they wrote again after your approval', () => {
    const row = asked([{ file: 'launch-teaser-v8.mp4', by: 'p-maya', ts: at(20.1) }]);
    expect(inMyInbox(row, direct, 'p-maya')).toBe(true);
  });

  it('still waits when the approval is someone else\'s', () => {
    const row = asked([{ file: 'launch-teaser-v8.mp4', by: 'p-dev', ts: at(20.23) }]);
    expect(inMyInbox(row, direct, 'p-maya')).toBe(true);
  });
});

describe('a task row\'s time is the time of what its words name', () => {
  const task = (chat, wrote) => ({
    id: 't1', product: 'direct-dev', status: 'open', labels: ['given-task'], assignee: 'p-dev', createdBy: 'p-maya', people: ['p-maya', 'p-dev'],
    answer: 'x', createdAt: at(7), updatedAt: at(20.47),
    talk: { chat, threads: {} }, wrote,
  });
  const dm = { slug: 'direct-dev', name: 'Dev', team: { direct: true, projectId: 'p1' } };

  it('"Dev wrote back" carries the time of Dev\'s message, not of a later rewrite', () => {
    const r = task(
      [{ by: 'p-maya', ts: at(7), text: 'Fix double booking issue' }, { by: 'p-dev', ts: at(7.8), text: 'Reopening this' }],
      { answer: { ts: at(7.8), by: 'p-dev', source: 'founder' }, body: { ts: at(20.47), by: 'p-dev', source: 'founder' } },
    );
    expect(taskWords(r, dm, 'p-maya', nameOf, true)).toMatchObject({ word: 'Dev wrote back', at: at(7.8) });
  });

  it('a rewrite by Dev after your own last word is not Dev writing back', () => {
    const r = task(
      [{ by: 'p-dev', ts: at(7.8), text: 'Reopening this' }, { by: 'p-maya', ts: at(9), text: 'Who has the server code?' }],
      { answer: { ts: at(9), by: 'p-maya', source: 'founder' }, body: { ts: at(20.47), by: 'p-dev', source: 'founder' } },
    );
    expect(taskWords(r, dm, 'p-maya', nameOf, true)).toMatchObject({ word: 'With Dev', at: at(9) });
  });
});

describe('Today draws one job once', () => {
  const NOW = at(20.55);
  const products = [{ slug: 'lumen', name: 'Lumen', team: {} }, { slug: 'direct-dev', name: 'Dev', team: { direct: true } }];
  const job = {
    id: 't1', product: 'direct-dev', status: 'open', labels: ['given-task'], assignee: 'p-dev', createdBy: 'p-maya', people: ['p-maya', 'p-dev'],
    title: 'Fix double booking issue', createdAt: at(7), updatedAt: at(20.47),
    talk: { chat: [{ by: 'p-maya', ts: at(7), text: 'Fix it' }, { by: 'p-dev', ts: at(7.8), text: 'Reopening this' }], threads: {} },
  };
  const card = { personId: 'p-dev', threadId: 't1', title: 'Fix double booking issue', visible: true, state: 'running', project: 'Task', blockedBy: [], blocks: [], people: null, priority: null, problem: null, progress: null, solution: null, updatedAt: at(20.47) };
  const base = {
    range: 'today', now: NOW, me: 'p-maya', products, decisions: [], cards: [card],
    people: [{ id: 'p-dev', name: 'Dev Patel' }], mates: [], mateOf: () => null, directWith: (p) => (p === 'direct-dev' ? 'p-dev' : null),
  };
  const lines = (day) => day.people.flatMap((p) => ['waitingOnYou', 'tasks', 'blocked', 'working'].flatMap((s) => p[s].filter((l) => l.key.endsWith('t1') || l.key.endsWith('/t1')).map((l) => `${p.key}:${s}`)));

  it('a task Dev wrote back on is waiting on you, from Dev, at the time he wrote, and nothing else', () => {
    const day = teamToday({ ...base, items: [job], needs: [job] });
    expect(lines(day)).toEqual(['person:p-dev:waitingOnYou']);
    expect(day.people.find((p) => p.key === 'person:p-dev').waitingOnYou[0].at).toBe(at(7.8));
  });

  // Since every open task is listed under whoever has it, this one is Dev's task, once.
  it('a task not in Needs you is listed once, under Dev who has it, and Dev\'s card for it is not his work as well', () => {
    const day = teamToday({ ...base, items: [job], needs: [] });
    expect(lines(day)).toEqual(['person:p-dev:tasks']);
  });

  it('a card of Dev\'s own thread is still his work', () => {
    const day = teamToday({ ...base, items: [], needs: [], cards: [{ ...card, threadId: 'd9', title: 'Group bookings v1' }] });
    expect(day.people.find((p) => p.key === 'person:p-dev').working.map((l) => l.title)).toEqual(['Group bookings v1']);
  });
});
