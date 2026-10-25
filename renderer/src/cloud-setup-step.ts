// Which step the cloud's setup screen opens on. A signed-in cloud pays for its
// plan before it asks for any Claude or Codex account; until the plan has been
// read, it shows neither, so nobody sees the accounts flash before the plans.
import type { CloudPlan } from './types';

export function setupStep({ managed, plan }: { managed?: boolean; plan: CloudPlan | null }): 'loading' | 'pay' | 'accounts' {
  if (!managed) return 'accounts';
  if (!plan) return 'loading';
  return plan.signedIn !== false && plan.plan === 'none' ? 'pay' : 'accounts';
}
