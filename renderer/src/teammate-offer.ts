// What the card offering a teammate says (./components/TeammateOffer.tsx), and
// when ↵ in the thread answers it.
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

/** ↵ sends an option you arrowed to; with none picked it makes the teammate the card offers. */
export function enterMakesTeammate(item: Pick<WorkItem, 'routed'> | null | undefined, optionSel: number | null): boolean {
  return optionSel === null && offerWaiting(item);
}

/** The thread's ↵ reaches the card on screen through this, so the card shows the press at once. */
export const MAKE_OFFERED_TEAMMATE = 'agentbox:make-offered-teammate';
