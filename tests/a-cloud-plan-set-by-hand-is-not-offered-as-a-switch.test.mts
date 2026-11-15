// A CLOUD PLAN SET BY HAND IS NOT OFFERED AS A SWITCH, AND HAS NO BILLING ROW.
//
// What broke (2026-10-25): on a Max plan set by hand, Settings › Cloud said
// "Switch to Plus", which opened a new $100 checkout, and showed "Payment and
// invoices", whose Open had no Stripe page to open. The server now says who
// bills a plan (`billing`: stripe, given or null); these are the rules the
// page draws from it. A server that predates `billing` is read as before.
import { describe, it, expect } from 'vitest';
import { planCards, cloudBilling } from '../renderer/src/cloud-upgrade';

const plan = (p, billing) => ({ signedIn: true, plan: p, unlimited: p === 'max', agents: p === 'max' ? null : 10, hoursPerMonth: 400, running: 0, usedSeconds: 0, ...(billing === undefined ? {} : { billing }) });

describe('the plan cards', () => {
  it('a plan Stripe bills offers the others as switches', () => {
    expect(planCards(plan('max', 'stripe')).map((c) => c.button)).toEqual(['Switch to Pro', 'Switch to Plus', null]);
  });

  it('a plan set by hand offers the others as plans to choose, since choosing one starts paying', () => {
    expect(planCards(plan('max', 'given')).map((c) => c.button)).toEqual(['Choose Pro', 'Choose Plus', null]);
  });

  it('a server that does not say who bills is read as before', () => {
    expect(planCards(plan('max')).map((c) => c.button)).toEqual(['Switch to Pro', 'Switch to Plus', null]);
  });
});

describe('billing on the Cloud page', () => {
  it('a plan Stripe bills has the billing row and says nothing more', () => {
    expect(cloudBilling(plan('pro', 'stripe'))).toEqual({ row: true, says: null });
  });

  it('a plan set by hand has no billing row, and says why', () => {
    expect(cloudBilling(plan('max', 'given'))).toEqual({ row: false, says: 'Choosing a plan starts paying for it.' });
  });

  it('no plan has neither', () => {
    expect(cloudBilling(plan('none', null))).toEqual({ row: false, says: null });
    expect(cloudBilling(null)).toEqual({ row: false, says: null });
  });

  it('a server that does not say who bills keeps the billing row', () => {
    expect(cloudBilling(plan('pro'))).toEqual({ row: true, says: null });
  });
});
