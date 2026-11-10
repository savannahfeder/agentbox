// A TEAMMATE STOPS WAITING ON YOU ONCE YOU ANSWER ON THE PHONE (w-e4d49a1539).
//
// 2026-11-02 phone workday, issues 14 and 18 (two testers): after picking
// "Show me the steps first" on Quality lead's sign-up thread, the thread said
// Picked and Queued, but Chats and Quality lead's chat still said "Waiting on
// you", so both opened the same decision again. A teammate's state comes from
// the computer's last copy, which cannot know about an answer still waiting for
// it. The first fix went by the answer's time and so gave way to any newer copy,
// even one made before the computer took the answer: the 2026-11-03 testers saw
// "Answered" flip back to "Waiting on you" (round 1, issues 14 and 22). It now
// goes by the command: answered here counts until the computer has taken it and
// sent a copy after that.
import { describe, it, expect } from 'vitest';
import { withPhoneAnswers, nowLine } from '../mobile/src/lib/teammates';

const NOW = Date.parse('2026-11-03T20:00:00Z');
const DEV = 'a1b2c3d4e5f6';
const COPY = NOW - 600_000;
const iso = (ms) => new Date(ms).toISOString();
const mate = { id: 't-quality001', name: 'Quality lead', now: 'Waiting on you', paused: false, status: 'active', waiting: [{ id: 'w-t2', product: 'agentbox', title: 'Sign-up fails on a slow connection' }], works: null };
const team = (copyAt = COPY) => ({ device: DEV, copyAt, view: { list: [{ ...mate }], chat: [], runs: [{ id: 'run-1', kind: 'run', teammate: 't-quality001', item: 'w-t2', product: 'agentbox', title: 'Sign-up fails on a slow connection', verb: 'sent', waiting: true, ts: NOW - 900_000 }] } });
const cmd = (kind, over = {}) => ({ id: `c-${kind}`, device: DEV, project: 'agentbox', item: 'w-t2', kind, payload: kind === 'reply' ? { text: 'Option 2: Show me the steps first' } : {}, created_at: iso(NOW - 60_000), claimed_at: null, taken_at: null, outcome: null, ...over });

describe("a teammate's thread you answered on the phone", () => {
  it('no longer waits on you, in Chats or in its chat', () => {
    const t = withPhoneAnswers(team(), [cmd('reply')]);
    const q = t.view.list[0];
    expect(q.waiting).toEqual([]);
    // Round 2 of the 2026-11-03 testers (issues 7, 10): "Answered" read as the teammate having answered,
    // and nothing said the words had not reached it. Until the copy has them, that is what it says.
    expect(nowLine(q, t.view, NOW)).toBe('Waiting for your computer');
    expect(t.view.runs[0]).toMatchObject({ waiting: false, answered: true });
  });

  it('closed on the phone, no longer waits on you either', () => {
    expect(withPhoneAnswers(team(), [cmd('close')]).view.list[0].waiting).toEqual([]);
  });

  it('stays answered when a newer copy arrives before the computer has taken the answer', () => {
    expect(withPhoneAnswers(team(NOW - 10_000), [cmd('reply')]).view.list[0].waiting).toEqual([]);
  });

  it('stays answered while the computer has taken it but sent no copy since', () => {
    expect(withPhoneAnswers(team(), [cmd('reply', { taken_at: iso(NOW - 30_000), outcome: 'ok' })]).view.list[0].waiting).toEqual([]);
  });

  it('is left to the copy once the computer sent one after taking it', () => {
    const t = withPhoneAnswers(team(NOW - 5_000), [cmd('reply', { taken_at: iso(NOW - 30_000), outcome: 'ok' })]);
    expect(t.view.list[0].waiting).toHaveLength(1);
  });

  it('refused by the computer still waits on you', () => {
    expect(withPhoneAnswers(team(), [cmd('reply', { taken_at: iso(NOW - 30_000), outcome: 'refused: gone' })]).view.list[0].waiting).toHaveLength(1);
  });

  it('not answered still waits on you', () => {
    const t = withPhoneAnswers(team(), []);
    expect(t.view.list[0].waiting).toHaveLength(1);
    expect(t.view.runs[0].waiting).toBe(true);
  });

  it('with no teammates, there is nothing to change', () => {
    expect(withPhoneAnswers(null, [cmd('reply')])).toBeNull();
  });
});
