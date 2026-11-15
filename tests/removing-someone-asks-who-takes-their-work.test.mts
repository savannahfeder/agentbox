// REMOVING SOMEONE ASKS WHO TAKES THEIR WORK.
//
// Settings > Team had one Remove button, which took Jordan off the
// team and moved nothing, so his tasks and threads waited on nobody. The ask
// now names who takes the work and what happens to each of his AI teammates.
// Measured on the rule the page draws from; the page itself renders React.
import { it, expect, describe } from 'vitest';
import { handoverAsk, handoverOf } from '../renderer/src/team/handover.ts';

const people = [
  { id: 'jo', name: 'Jordan Lee', email: 'jo@x', role: 'member' },
  { id: 'dev', name: 'Dev Rao', email: 'dev@x', role: 'member' },
  { id: 'maya', name: 'Maya Chen', email: 'maya@x', role: 'owner' },
];
const mates = [
  { id: 'tm-s', owner: 'jo', name: 'Support lead', job: 'Answer emails', now: null, open: false, updatedAt: 0 },
  { id: 'tm-d', owner: 'dev', name: 'Quality lead', job: 'Retest', now: null, open: false, updatedAt: 0 },
];

describe('who can take it', () => {
  it('offers you first, then the rest of the team, and never the person leaving', () => {
    expect(handoverAsk(people, mates, 'maya', 'jo').takers).toEqual([{ id: 'maya', name: 'You' }, { id: 'dev', name: 'Dev Rao' }]);
  });

  it('lists only the leaver\'s own AI teammates', () => {
    expect(handoverAsk(people, mates, 'maya', 'jo').mates.map((m) => m.id)).toEqual(['tm-s']);
    expect(handoverAsk(people, undefined, 'maya', 'jo').mates).toEqual([]);
  });
});

describe('what the remove carries', () => {
  it('gives each AI teammate to the taker unless it is paused', () => {
    const own = handoverAsk(people, [...mates, { ...mates[0], id: 'tm-g', name: 'Growth lead' }], 'maya', 'jo').mates;
    expect(handoverOf('dev', own, new Set(['tm-g']))).toEqual({ handTo: 'dev', mates: [{ id: 'tm-s', to: 'dev' }, { id: 'tm-g', to: null }] });
  });
});
