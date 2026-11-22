// Starting the setup's Pro, a team's free week: the cloud account, the team
// its seats are bought for, then Stripe's checkout in the browser.
import { api } from './api';
import { teamNameFor } from './setup-split';

/** `terms`: the cloud gives this person a key only once they agree, so the press has to name the terms and agree. */
export async function startProTrial({ hasTeam, name, acceptTerms = false }: { hasTeam: boolean; name: string | null | undefined; acceptTerms?: boolean }): Promise<{ ok: true } | { ok: false; message: string; terms?: boolean }> {
  const cloud = await api.cloudAccountFromTeam(acceptTerms);
  if (!cloud.ok && cloud.error === 'terms' && !acceptTerms) return { ok: false, terms: true, message: 'Agree to the Terms and the Privacy policy to start Pro.' };
  if (!cloud.ok) return { ok: false, message: cloud.message || 'The cloud did not answer. Try again.' };
  if (!hasTeam) {
    const made = await api.teamCreate(teamNameFor(name));
    if (!made.ok) return { ok: false, message: made.error ?? 'The team was not made.' };
  }
  const out = await api.cloudAccountPay('team');
  if (!out.ok) return { ok: false, message: out.message || 'Stripe could not be opened. Try again.' };
  return { ok: true };
}
