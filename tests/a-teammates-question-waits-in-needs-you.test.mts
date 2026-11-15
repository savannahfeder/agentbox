// A TEAMMATE'S QUESTION WAITS IN NEEDS YOU (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 30, and again in round 1 on 2026-11-03
// (issue 21): Chief of staff asked "should the film open on the inbox or on the
// phone?" at 9am, and it lived only in Chats. Needs you, the one list a person
// reads between calls, said only Sam's mention was left. A teammate's open
// question now heads Needs you, one row per teammate, as a group mention does,
// and leaves once you answer it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { questionsForYou } from '../mobile/src/lib/teammates';

const team = { device: 'dev1', copyAt: 0, view: {
  list: [
    { id: 't-chief00001', name: 'Chief of staff', waiting: [], paused: false },
    { id: 't-launch0001', name: 'Launch lead', waiting: [], paused: false },
  ],
  chat: [
    { id: 'm-1', kind: 'msg', from: 't-chief00001', to: ['you'], text: 'Should the film open on the inbox or on the phone?', options: ['The inbox', 'The phone'], ts: 1000 },
    { id: 'm-2', kind: 'msg', from: 't-launch0001', to: ['you'], text: 'Cut it to sixty seconds.', ts: 2000 },
  ],
  runs: [],
} };

describe('what Needs you shows of your teammates', () => {
  it('a teammate asking you something, with its question', () => {
    expect(questionsForYou(team, [])).toMatchObject([{ mate: { id: 't-chief00001' }, question: { id: 'm-1' } }]);
  });
  it('not a teammate that only told you something', () => {
    expect(questionsForYou(team, []).map((q) => q.mate.id)).not.toContain('t-launch0001');
  });
  it('nothing once you answered it here', () => {
    const answered = [{ id: 'c-1', kind: 'msg', from: 'you', to: ['t-chief00001'], text: 'The inbox', answers: { 'm-1': 'The inbox' }, ts: 3000, waiting: true, refused: null }];
    expect(questionsForYou(team, answered)).toEqual([]);
  });
  it('nothing without teammates', () => {
    expect(questionsForYou(null, [])).toEqual([]);
  });
  it('heads Needs you and counts in it, opening the teammate', () => {
    const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
    // Counted on every tab, so the Needs you number does not change with the tab you are on (round 3, issue 17).
    expect(inbox).toMatch(/const asks = questionsForYou\(c\.team, c\.teamPending\)/);
    expect(inbox).toMatch(/const mentionsShown = tab === 'inbox' && \(mentions\.length > 0 \|\| asks\.length > 0\)/);
    expect(inbox).toMatch(/inbox: shown\.rows\.inbox\.length \+ mentions\.length \+ asks\.length/);
    expect(inbox).toMatch(/router\.push\(\{ pathname: '\/teammate\/\[id\]', params: \{ id: q\.mate\.id \} \}\)/);
  });
  it('in Chats, a teammate you answered here no longer says it has a question for you (round 3, issue 10)', async () => {
    const { nowLine, waitsOnYou } = await import('../mobile/src/lib/teammates');
    const chief = team.view.list[0];
    const answered = [{ id: 'c-1', kind: 'msg', from: 'you', to: ['t-chief00001'], text: 'The inbox', answers: { 'm-1': 'The inbox' }, ts: 3000, waiting: true, refused: null }];
    expect(nowLine(chief, team.view, 5000)).toBe('Has a question for you');
    expect(nowLine(chief, team.view, 5000, answered)).not.toBe('Has a question for you');
    expect(waitsOnYou(chief, team.view, answered)).toBe(false);
  });
});
