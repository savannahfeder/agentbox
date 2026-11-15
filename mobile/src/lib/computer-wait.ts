import { Name } from '../../../shared/product-name.mjs';

const SKIPPED_KEY = 'agentbox-computer-wait-skipped';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Kept per account, so signing in to another one shows its own wait. */
export const waitSkipped = (store: Store, email: string | null) => store.getItem(SKIPPED_KEY) === (email ?? '');
export const skipWait = (store: Store, email: string | null) => store.setItem(SKIPPED_KEY, email ?? '');

export function waitNotice(connect: { email: string | null } | null): { message: string; next: string } | null {
  if (!connect) return null;
  return {
    message: 'No computer connected yet.',
    next: `Open ${Name} on your computer and sign in ${connect.email ? `as ${connect.email}` : 'to this account'}.`,
  };
}
