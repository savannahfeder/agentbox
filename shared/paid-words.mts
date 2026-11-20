// What the page after Stripe says: the server's own page (cloud/gateway) and
// the web app's /paid (renderer/src/paid) read the same words.
import { PLANS } from '../cloud/gateway/plans.mjs';
import { Name } from './product-name.mjs';

export function paidHeadline(query: URLSearchParams): string {
  if (query.has('cancelled')) return 'Nothing was charged';
  if (query.has('billing')) return 'All done on Stripe';
  const plan = query.get('plan') ?? '';
  const sold = Object.hasOwn(PLANS, plan) && PLANS[plan as keyof typeof PLANS].agents > 0;
  const named = plan === 'team' ? ' for your team' : sold ? ` ${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : '';
  return `You’re on ${Name} Cloud${named}`;
}
