// WHERE AGENTBOX CLOUD OFFERS ITSELF, AND WHAT IT SAYS (the founder's design
// of 2026-10-13, w-1dc7ee2408: never a pop-up). A last row in the list and a
// card on the board when the computer is full and threads wait; the plans as
// cards on Settings › Plan and Billing; the next plan up when this one has no room.
// Drawn in components/List.tsx and components/CloudPlans.tsx.
import { PLANS } from '../../cloud/gateway/plans.mjs';
import { Name } from '../../shared/product-name.mjs';
import type { CloudStatus } from './cloud-menu';
import type { CloudPlan } from './types';

export type PaidPlan = 'pro' | 'plus' | 'max';
const ORDER: PaidPlan[] = ['pro', 'plus', 'max'];
const NAME: Record<PaidPlan, string> = { pro: 'Pro', plus: 'Plus', max: 'Max' };
const n = (x: number) => x.toLocaleString('en-US');

export interface OfferGo { label: string; act: 'sign-in' | 'plans' | 'cloud-on' | 'pay'; plan?: PaidPlan }
export interface Offer { say: string; waiting: string; go: OfferGo | null }

const nextUp = (plan: string | undefined): PaidPlan | null => {
  const i = ORDER.indexOf(plan as PaidPlan);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : null;
};

export function cloudOffer({ cloud, plan, waiting, macFull }: {
  cloud: Pick<CloudStatus, 'setUp' | 'offered' | 'managed' | 'mode' | 'noRoom'> | null;
  plan: CloudPlan | null;
  waiting: number;
  macFull: boolean;
}): Offer | null {
  if (!cloud || waiting <= 0 || (!cloud.setUp && !cloud.offered)) return null;
  const them = waiting === 1 ? 'it' : 'them';
  const waitingLine = waiting === 1 ? '1 thread is waiting.' : `${waiting} threads are waiting.`;
  const room = cloud.noRoom?.error;
  const paid = plan?.plan && plan.plan !== 'none' ? plan.plan : null;
  if (paid && (room === 'hours' || room === 'agents')) {
    const up = nextUp(paid);
    const say = room === 'hours'
      ? `This month's ${n(plan?.hoursPerMonth ?? PLANS[paid].hoursPerMonth)} hours are used up.`
      : `All ${plan?.agents ?? PLANS[paid].agents} cloud agents are running.`;
    const what = (p: PaidPlan) => (room === 'hours' ? `${n(PLANS[p].hoursPerMonth)} hours` : PLANS[p].unlimited ? 'unlimited at once' : `${PLANS[p].agents} at once`);
    return { say, waiting: waitingLine, go: up ? { label: `Move to ${NAME[up]} · ${what(up)}`, act: 'pay', plan: up } : null };
  }
  if (!macFull) return null;
  // This computer, whatever it is: the app runs on Linux, and this sentence is
  // the one that asks for money.
  const go = (act: OfferGo['act']): Offer => ({ say: 'This computer is running all it can.', waiting: waitingLine, go: { label: `Start ${them} in the cloud`, act } });
  if (!cloud.setUp) return go('sign-in');
  if (cloud.managed && (!plan || plan.plan === 'none')) return go('plans');
  if (cloud.mode === 'mac') return go('cloud-on');
  return null;
}

export interface PlanCard { id: PaidPlan; name: string; price: string; slots: string; hours: string; current: boolean; button: string | null }

export function planCards(plan: CloudPlan | null): PlanCard[] {
  const mine = plan?.plan && plan.plan !== 'none' ? plan.plan : null;
  // Off a plan set by hand, another plan is a first purchase, not a switch.
  const verb = mine && plan?.billing !== 'given' ? 'Switch to' : 'Choose';
  return ORDER.map((id) => {
    const p = PLANS[id];
    return {
      id, name: NAME[id], price: `$${p.dollarsPerMonth}`,
      slots: p.unlimited ? 'Unlimited agent slots' : `+${p.agents} agent slots`,
      hours: `${n(p.hoursPerMonth)} hours a month`,
      current: mine === id,
      button: mine === id ? null : `${verb} ${NAME[id]}`,
    };
  });
}

export interface PlanSummary {
  name: string; price: string; who: string; manage: boolean;
  agents: { line: string; percent: number };
  hours: { line: string; percent: number };
}

/** The top of Settings › Plan and Billing: the plan paid for, and this month's agents and hours as meters. */
export function planSummary(plan: CloudPlan | null): PlanSummary | null {
  const mine = plan?.plan && plan.plan !== 'none' ? plan.plan : null;
  if (!plan || !mine) return null;
  const running = plan.running ?? 0;
  const hoursAll = plan.hoursPerMonth ?? PLANS[mine].hoursPerMonth;
  const manage = cloudBilling(plan).row;
  return {
    name: `${Name} Cloud ${NAME[mine]}`,
    price: `$${PLANS[mine].dollarsPerMonth} a month`,
    who: manage ? 'Billed monthly by Stripe' : 'Set up for you, nothing to pay',
    manage,
    agents: plan.unlimited
      ? { line: `${running} running, no limit`, percent: 0 }
      : { line: `${running} of ${plan.agents ?? 0} running`, percent: Math.min(100, Math.round((running / Math.max(1, plan.agents ?? 1)) * 100)) },
    hours: { line: `${n(Math.floor((plan.usedSeconds ?? 0) / 3600))} of ${n(hoursAll)} hours`, percent: usedPercent(plan) },
  };
}

/** Whether Settings › Plan and Billing offers Stripe's billing page, and what it says instead. */
export function cloudBilling(plan: CloudPlan | null): { row: boolean; says: string | null } {
  const mine = plan?.plan && plan.plan !== 'none' ? plan.plan : null;
  if (!mine) return { row: false, says: null };
  // The plan's own box already says it was set up for you.
  if (plan?.billing === 'given') return { row: false, says: 'Choosing a plan starts paying for it.' };
  return { row: true, says: null };
}

/** Under your plan's card: how many run now, and how much of the month is used. */
export const usedPercent = (plan: CloudPlan) => Math.min(100, Math.round(((plan.usedSeconds ?? 0) / 3600 / Math.max(1, plan.hoursPerMonth ?? 1)) * 100));

export function usageLine(plan: CloudPlan): string {
  const used = usedPercent(plan);
  const running = plan.running ?? 0;
  return `${plan.unlimited ? `${running} running` : `${running} of ${plan.agents ?? 0} in use`} · ${used}% used`;
}
