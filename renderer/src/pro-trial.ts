// Starting Pro's free week: the cloud account, the team its seats are bought
// for, then Stripe's checkout in the browser. The setup's Pro page, Settings ›
// Plan and Billing and the cloud setup all start it here.
import { api } from './api';
import { teamNameFor } from './setup-split';
import type { CloudPlan } from './types';

export async function startProTrial({ hasTeam, name, acceptTerms = false }: { hasTeam: boolean; name: string | null | undefined; acceptTerms?: boolean }): Promise<{ ok: true } | { ok: false; message: string }> {
  const cloud = await api.cloudAccountFromTeam(acceptTerms);
  if (!cloud.ok) return { ok: false, message: cloud.message || 'The cloud did not answer. Try again.' };
  if (!hasTeam) {
    const made = await api.teamCreate(teamNameFor(name));
    if (!made.ok) return { ok: false, message: made.error ?? 'The team was not made.' };
  }
  const out = await api.cloudAccountPay('team');
  if (!out.ok) return { ok: false, message: out.message || 'Stripe could not be opened. Try again.' };
  return { ok: true };
}

/** The trial is offered to someone with no plan of their own who is not on a team: a team had its week. */
export const offersProTrial = (plan: CloudPlan | null, onTeam: boolean): boolean =>
  !onTeam && !!plan && plan.signedIn !== false && (!plan.plan || plan.plan === 'none');
