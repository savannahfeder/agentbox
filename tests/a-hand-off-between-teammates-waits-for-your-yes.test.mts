// A HAND-OFF BETWEEN TEAMMATES WAITS FOR YOUR YES, UNLESS YOU SAID IT NEED NOT.
//
// On the evening of 2026-10-26 two teammates woke each other with hand-offs
// and the person was asked nothing: videos they never approved were rendered,
// and they wrote "OMG Stop working!! i've asked you to stop so many times" and
// "none of this work was approved. stop you're wasting tokens!!!". Holding
// hand-offs for a yes was opt-in (`handoffsNeedYes`), and nobody had opted in.
// Now it is the default; a teammate the person tells to take hand-offs
// straight away saves `handoffsNeedYes: false`.
import { describe, it, expect } from 'vitest';
import { planWakes, runIdFor, seenKey, teammateLabel, DEFAULT_LIMIT, foldTeammates } from '../shared/teammates.mjs';

const NOW = new Date(2026, 9, 26, 15, 43).getTime();
const base = { status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
const gm = { ...base, id: 't-growth', name: 'Growth marketer' };
const vp = { ...base, id: 't-video', name: 'Video producer' };
const pass = (id, from, to, title) => ({ id, kind: 'pass', from: from.id, to: to.id, title, details: 'see the doc', hop: 0, run: 'w-gm', ts: NOW });
const plan = (messages, teammates = [gm, vp], items = []) => planWakes({ teammates, chat: { messages, seen: new Set(), into: new Map() }, items, now: NOW + 60_000 });

describe('a hand-off from one teammate to another', () => {
  it('waits for your yes when nobody said otherwise', () => {
    const acts = plan([pass('m-1', gm, vp, 'Make the clip')]);
    expect(acts.find((a) => a.type === 'run').trigger).toMatchObject({ kind: 'pass', hold: true });
  });

  it('into a thread the receiver already has, it waits there too', () => {
    const lane = { id: 'w-vp', product: 'kestrel', title: 'x', status: 'open', labels: ['founder', teammateLabel(vp.id), 'hop:0', 'work:w-yours'], createdAt: NOW, wrote: { result: { ts: NOW + 1, source: 'agent' } } };
    const p = { ...pass('m-1', gm, vp, 'Make the clip'), work: 'w-yours' };
    expect(plan([p], [gm, vp], [lane]).find((a) => a.type === 'tell')).toMatchObject({ item: 'w-vp', hold: true });
  });

  it('goes straight to work for a teammate you told to take hand-offs without asking', () => {
    const eager = { ...vp, handoffsNeedYes: false };
    const acts = plan([pass('m-1', gm, vp, 'Make the clip')], [gm, eager]);
    expect(acts.find((a) => a.type === 'run').trigger.hold).toBeUndefined();
  });

  it('your own hand-off is your yes and never waits', () => {
    const yours = { id: 'm-2', kind: 'pass', from: 'you', to: vp.id, title: 'Make the clip', details: '', ts: NOW };
    expect(plan([yours]).find((a) => a.type === 'run').trigger.hold).toBeUndefined();
  });

  it('a teammate saved before this keeps no setting, and so waits', () => {
    const [t] = foldTeammates([{ id: 't-aaaaaa', ts: 1, patch: { name: 'Video producer' } }]);
    expect(t.handoffsNeedYes).toBeUndefined();
    const acts = plan([pass('m-1', gm, { ...t, id: 't-aaaaaa' }, 'x')], [gm, { ...base, ...t }]);
    expect(acts.find((a) => a.type === 'run').trigger).toMatchObject({ hold: true });
    expect(seenKey('m-1', 't-aaaaaa')).toBeTruthy();
    expect(runIdFor('m-1>t-aaaaaa')).toMatch(/^w-/);
  });
});
