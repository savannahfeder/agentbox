// What the card offering a teammate says (./components/TeammateOffer.tsx), and
// whether it opens folded.
import type { WorkItem } from './types';

type Offer = NonNullable<NonNullable<WorkItem['routed']>['offer']>;

/** For an offer made before Auto wrote its own three lines. */
export const DEFAULT_GAINS = [
  'Learns how you like this work from every thread you approve or change',
  'Carries on where this thread left off, not from nothing',
  'Keeps what you taught it, so you never explain it twice',
];

export const aRole = (role: string) => `${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}`;

export function offerCard(offer: Offer) {
  return {
    letter: (offer.role.trim()[0] ?? '?').toUpperCase(),
    headline: `Make this ${aRole(offer.role)}'s job.`,
    why: offer.why || `${aRole(offer.role).replace(/^a/, 'A')} would do this every time and get better at it.`,
    gains: offer.gains?.length === 3 ? offer.gains : DEFAULT_GAINS,
    make: `Make ${aRole(offer.role)}`,
  };
}

export function offerWaiting(item: Pick<WorkItem, 'routed'> | null | undefined): boolean {
  const offer = item?.routed?.offer;
  return !!offer && !offer.answered;
}

/** What you chose with the chevron, which always wins; otherwise a card you have already seen on this thread opens folded. */
export type Fold = 'folded' | 'open' | null;
export function startsFolded({ choice, seen }: { choice: Fold; seen: boolean }): boolean {
  return choice ? choice === 'folded' : seen;
}

const key = (kind: 'fold' | 'seen', item: Pick<WorkItem, 'product' | 'id'>) => `agentbox.teammate-offer.${kind}.${item.product}/${item.id}`;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

export const foldChosen = (item: Pick<WorkItem, 'product' | 'id'>): Fold => { const v = read(key('fold', item)); return v === 'folded' || v === 'open' ? v : null; };
export const chooseFold = (item: Pick<WorkItem, 'product' | 'id'>, folded: boolean) => write(key('fold', item), folded ? 'folded' : 'open');
export const seenBefore = (item: Pick<WorkItem, 'product' | 'id'>) => read(key('seen', item)) === '1';
export const markSeen = (item: Pick<WorkItem, 'product' | 'id'>) => write(key('seen', item), '1');
