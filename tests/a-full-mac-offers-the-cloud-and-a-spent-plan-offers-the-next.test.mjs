// A FULL MAC OFFERS THE CLOUD, AND A SPENT PLAN OFFERS THE NEXT ONE UP.
//
// The founder designed this flow on 2026-10-13 in the cloud buildout thread
// (w-1dc7ee2408; designs cloud-native/04 and 05, cloud-pricing/14 and
// cloud-slots/20): never a pop-up, a last row in the list ("This Mac is
// running all it can. 2 threads are waiting." with "Start them in the cloud")
// and a card on the board, plans as cards on a Cloud page in Settings, and
// "Move to Plus" when the month's hours are used up. Paying works since
// w-6633e825a7, but nothing in the app offered it. These are the rules for
// when the offer shows and what it says; the drawing is in List.tsx and
// CloudPlans.tsx.
import { describe, it, expect } from 'vitest';
import { cloudOffer, planCards, usageLine } from '../renderer/src/cloud-upgrade';

const managed = (extra = {}) => ({ setUp: true, managed: true, mode: 'full', running: 0, month: { runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null }, ...extra });
const pro = { signedIn: true, plan: 'pro', unlimited: false, agents: 10, hoursPerMonth: 400, running: 6, usedSeconds: 88 * 3600 };

describe('when the Mac is full and threads wait', () => {
  it('someone with no cloud yet is asked to start them in the cloud, which signs in', () => {
    const o = cloudOffer({ cloud: { setUp: false, offered: true, mode: 'full', running: 0 }, plan: null, waiting: 2, macFull: true });
    expect(o).toEqual({ say: 'This Mac is running all it can.', waiting: '2 threads are waiting.', go: { label: 'Start them in the cloud', act: 'sign-in' } });
  });

  it('signed in with no plan, the same row opens the plans', () => {
    const o = cloudOffer({ cloud: managed(), plan: { signedIn: true, plan: 'none', agents: 0 }, waiting: 1, macFull: true });
    expect(o).toEqual({ say: 'This Mac is running all it can.', waiting: '1 thread is waiting.', go: { label: 'Start it in the cloud', act: 'plans' } });
  });

  it('with a plan and the cloud off, the row turns the cloud on', () => {
    expect(cloudOffer({ cloud: managed({ mode: 'mac' }), plan: pro, waiting: 3, macFull: true })?.go).toEqual({ label: 'Start them in the cloud', act: 'cloud-on' });
    expect(cloudOffer({ cloud: { ...managed({ mode: 'mac' }), managed: false }, plan: null, waiting: 3, macFull: true })?.go).toEqual({ label: 'Start them in the cloud', act: 'cloud-on' });
  });

  it('with a plan and the cloud on, nothing is offered: the cloud takes them', () => {
    expect(cloudOffer({ cloud: managed(), plan: pro, waiting: 3, macFull: true })).toBe(null);
  });

  it('a copy of the app with no cloud offers nothing', () => {
    expect(cloudOffer({ cloud: null, plan: null, waiting: 3, macFull: true })).toBe(null);
    expect(cloudOffer({ cloud: { setUp: false, offered: false, mode: 'full', running: 0 }, plan: null, waiting: 3, macFull: true })).toBe(null);
  });

  it('nothing waiting, or a Mac with room, offers nothing', () => {
    expect(cloudOffer({ cloud: { setUp: false, offered: true, mode: 'full', running: 0 }, plan: null, waiting: 0, macFull: true })).toBe(null);
    expect(cloudOffer({ cloud: { setUp: false, offered: true, mode: 'full', running: 0 }, plan: null, waiting: 2, macFull: false })).toBe(null);
  });
});

describe('when the plan has no room', () => {
  it('the month\'s hours used up offers the next plan up, with its hours', () => {
    const o = cloudOffer({ cloud: managed({ noRoom: { error: 'hours', message: null } }), plan: pro, waiting: 2, macFull: true });
    expect(o).toEqual({ say: 'This month\'s 400 hours are used up.', waiting: '2 threads are waiting.', go: { label: 'Move to Plus · 1,200 hours', act: 'pay', plan: 'plus' } });
  });

  it('every agent running offers the next plan up, with its agents', () => {
    const o = cloudOffer({ cloud: managed({ noRoom: { error: 'agents', message: null } }), plan: pro, waiting: 2, macFull: true });
    expect(o?.say).toBe('All 10 cloud agents are running.');
    expect(o?.go).toEqual({ label: 'Move to Plus · 25 at once', act: 'pay', plan: 'plus' });
    const plus = { ...pro, plan: 'plus', agents: 25, hoursPerMonth: 1200 };
    expect(cloudOffer({ cloud: managed({ noRoom: { error: 'agents', message: null } }), plan: plus, waiting: 2, macFull: true })?.go).toEqual({ label: 'Move to Max · unlimited at once', act: 'pay', plan: 'max' });
  });

  it('on Max, the row says so and offers nothing more', () => {
    const max = { ...pro, plan: 'max', unlimited: true, agents: null, hoursPerMonth: 3000 };
    const o = cloudOffer({ cloud: managed({ noRoom: { error: 'hours', message: null } }), plan: max, waiting: 1, macFull: false });
    expect(o).toEqual({ say: 'This month\'s 3,000 hours are used up.', waiting: '1 thread is waiting.', go: null });
  });

  it('no room shows even while the Mac has room, since those threads wait for the cloud', () => {
    expect(cloudOffer({ cloud: managed({ noRoom: { error: 'hours', message: null } }), plan: pro, waiting: 2, macFull: false })).not.toBe(null);
  });
});

describe('the plans page', () => {
  it('three cards, in order, sold as slots, each with its price and hours', () => {
    const cards = planCards({ signedIn: true, plan: 'none', agents: 0 });
    expect(cards.map((c) => [c.id, c.name, c.price, c.slots, c.hours, c.current, c.button])).toEqual([
      ['pro', 'Pro', '$40', '+10 agent slots', '400 hours a month', false, 'Choose Pro'],
      ['plus', 'Plus', '$100', '+25 agent slots', '1,200 hours a month', false, 'Choose Plus'],
      ['max', 'Max', '$200', 'Unlimited agent slots', '3,000 hours a month', false, 'Choose Max'],
    ]);
  });

  it('someone on a plan sees it as theirs, and switches to the others', () => {
    const cards = planCards(pro);
    expect(cards.map((c) => [c.current, c.button])).toEqual([[true, null], [false, 'Switch to Plus'], [false, 'Switch to Max']]);
  });

  it('says how much of the plan is in use', () => {
    expect(usageLine(pro)).toBe('6 of 10 in use · 22% used');
    expect(usageLine({ ...pro, plan: 'max', unlimited: true, agents: null, hoursPerMonth: 3000, running: 4, usedSeconds: 30 * 3600 })).toBe('4 running · 1% used');
    expect(usageLine({ ...pro, usedSeconds: 500 * 3600 })).toBe('6 of 10 in use · 100% used');
  });
});
