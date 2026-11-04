// A TEAMMATE STOPS WAITING ON YOU ONCE YOU ANSWER ON THE PHONE (w-e4d49a1539).
//
// 2026-11-02 phone workday, issues 14 and 18 (two testers): after picking
// "Show me the steps first" on Quality lead's sign-up thread, the thread said
// Picked and Queued, but Chats and Quality lead's chat still said "Waiting on
// you", so both opened the same decision again. A teammate's state comes from
// the computer's last copy, which cannot know about an answer still waiting for
// it. The phone now takes its own answers into account until the copy does.
import { describe, it, expect } from 'vitest';
import { withPhoneAnswers, nowLine } from '../mobile/src/lib/teammates';
import { phoneSlug } from '../renderer/src/phone-rows';

const NOW = Date.parse('2026-11-03T20:00:00Z');
const DEV = 'a1b2c3d4e5f6';
const COPY = NOW - 600_000;
const mate = { id: 't-quality001', name: 'Quality lead', now: 'Waiting on you', paused: false, status: 'active', waiting: [{ id: 'w-t2', product: 'agentbox', title: 'Sign-up fails on a slow connection' }], works: null };
const team = () => ({ device: DEV, copyAt: COPY, view: { list: [{ ...mate }], chat: [], runs: [{ id: 'run-1', kind: 'run', teammate: 't-quality001', item: 'w-t2', product: 'agentbox', title: 'Sign-up fails on a slow connection', verb: 'sent', waiting: true, ts: NOW - 900_000 }] } });
const item = (wrote = {}) => ({ id: 'w-t2', product: phoneSlug(DEV, 'agentbox'), status: 'open', wrote });

describe("a teammate's thread you answered on the phone", () => {
  it('no longer waits on you, in Chats or in its chat', () => {
    const t = withPhoneAnswers(team(), [item({ answer: { ts: NOW - 60_000, source: 'founder' } })]);
    const q = t.view.list[0];
    expect(q.waiting).toEqual([]);
    expect(nowLine(q, t.view, NOW)).toBe('Answered');
    expect(t.view.runs[0]).toMatchObject({ waiting: false, answered: true });
  });

  it('closed on the phone, no longer waits on you either', () => {
    const t = withPhoneAnswers(team(), [{ ...item({ status: { ts: NOW - 60_000, source: 'founder' } }), status: 'done' }]);
    expect(t.view.list[0].waiting).toEqual([]);
  });

  it('answered before the copy was made is left to the copy', () => {
    const t = withPhoneAnswers(team(), [item({ answer: { ts: COPY - 60_000, source: 'founder' } })]);
    expect(t.view.list[0].waiting).toHaveLength(1);
    expect(nowLine(t.view.list[0], t.view, NOW)).toBe('Waiting on you');
  });

  it('not answered still waits on you', () => {
    const t = withPhoneAnswers(team(), [item()]);
    expect(t.view.list[0].waiting).toHaveLength(1);
    expect(t.view.runs[0].waiting).toBe(true);
  });

  it('with no teammates, there is nothing to change', () => {
    expect(withPhoneAnswers(null, [item()])).toBeNull();
  });
});
