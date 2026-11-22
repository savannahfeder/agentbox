// After Theo handed Sam's thread back, Sam's agent offered "Hand to Sam for review and merge" to Sam five times: its brief called him only "the founder", while the hand-back named him (power test issue 75).
// Measured on replyBrief and conversationBlock with and without a team: the owner is named once they are on one, and nothing changes off a team.
import { it, expect, describe } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';

const sup = (team) => {
  const s = Object.create(Supervisor.prototype);
  s.store = { teammates: team ? { team: { state: () => team } } : null, listProducts: () => [] };
  s.commentsSinceBlock = () => '';
  s.namedThreadsBlock = () => '';
  return s;
};
const onATeam = { me: { id: 'sam' }, people: [{ id: 'sam', name: 'Sam Ortiz' }, { id: 'theo', name: 'Theo Okafor' }] };
const theirs = { id: 'w-1', product: 'api', answer: 'Theo handed this back.\n\nSam had asked: “Cents?”', wrote: { answer: { ts: 2, source: 'system', from: 'Theo Okafor', teammate: 'theo' } } };
const yours = { id: 'w-1', product: 'api', answer: 'Go on.', wrote: { answer: { ts: 3, source: 'founder' } } };
const turns = [{ ts: 1, source: 'system', from: 'Theo Okafor', text: 'Use cents.' }, { ts: 2, source: 'founder', text: 'Go on.' }];

describe('on a team', () => {
  it("a teammate's words and the owner's reply name the owner", () => {
    expect(sup(onATeam).replyBrief(theirs)).toContain('Sam Ortiz');
    expect(sup(onATeam).replyBrief(yours)).toMatch(/^The founder, Sam Ortiz, has replied/);
  });
  it('the conversation with a teammate in it names the owner', () => {
    expect(sup(onATeam).conversationBlock({ id: 'w-1' }, turns)).toContain('The founder is Sam Ortiz.');
  });
});

describe('off a team, or with no name', () => {
  for (const team of [null, { me: { id: 'sam' }, people: [] }, { me: null, people: onATeam.people }]) {
    it(`reads as before (${JSON.stringify(team?.me ?? null)})`, () => {
      expect(sup(team).replyBrief(yours)).toMatch(/^The founder has replied/);
      expect(sup(team).replyBrief(theirs)).not.toContain('Sam Ortiz');
      expect(sup(team).conversationBlock({ id: 'w-1' }, turns)).not.toContain('The founder is');
    });
  }
  it('a conversation with no teammate in it does not name anyone', () => {
    expect(sup(onATeam).conversationBlock({ id: 'w-1' }, [turns[1], { ts: 3, source: 'agent', field: 'result', text: 'Done.' }])).not.toContain('The founder is');
  });
});
