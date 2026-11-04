// AN AI TEAMMATE'S BRIEF TELLS IT TO BE HONEST WITH PEOPLE.
//
// On the chief of staff: its note to Sofia and Jordan "invented a
// decision" ("Jordan keeps customers, the launch post and the metrics note",
// which nobody said); it recommended Jordan for the film from its 7am memory
// after Maya had said he left ("a recommended option should follow the latest
// facts"); and its brief to Maya was "a wall of text with internal ids"
// (w-c4132930b0ef, "(Unavailable thread)", 20+ lines). Read in the brief
// main/teammates.mts writes: nothing in it said any of the four rules below.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';

let t; let brief; let plainBrief;
beforeEach(async () => {
  t = await aTeamWithAgents();
  const chief = t.maya.store.teammates.create({ starter: 'chief' });
  const run = t.maya.store.composeItem(t.product.id, { title: '2pm brief', body: 'Redo the brief.', labels: [`teammate:${chief.id}`] });
  const writer = t.maya.store.teammates.create({ name: 'Investor update writer', job: 'Write the monthly investor update.' });
  const other = t.maya.store.composeItem(t.product.id, { title: 'October update', body: 'Finish it.', labels: [`teammate:${writer.id}`] });
  await t.tick();
  brief = t.maya.store.teammates.briefFor(t.maya.store.readItem(t.product.id, run.id));
  plainBrief = t.maya.store.teammates.briefFor(t.maya.store.readItem(t.product.id, other.id));
});
afterEach(() => t.stop());

describe('every teammate is told', () => {
  it('to pass on only what a person decided, in their words, naming who', () => {
    for (const b of [brief, plainBrief]) {
      expect(b).toMatch(/pass on only what a person decided, in their own words, and name who decided it/i);
      expect(b).toMatch(/never add a fact, a decision or an owner nobody stated/i);
    }
  });

  it('to re-read the newest messages before recommending, and prefer them over its memory', () => {
    for (const b of [brief, plainBrief]) {
      expect(b).toMatch(/before you recommend an option, read the newest messages/i);
      expect(b).toMatch(/the newest message wins over your memory and your method/i);
    }
  });

  it('never to show people internal ids or paths', () => {
    for (const b of [brief, plainBrief]) expect(b).toMatch(/never show people internal ids or paths \(w-…, t-…, file paths\)/i);
  });

  it('not to say its owner said yes before they have', () => {
    expect(plainBrief).toMatch(/never write that your owner said yes before they have/i);
  });
});

describe('the primary, whose check-in is the brief', () => {
  it('keeps it to what needs the person, each line a thread they can open', () => {
    expect(brief).toMatch(/only what needs them, at most five lines, each one a thread they can open by its title/i);
    expect(plainBrief).not.toMatch(/at most five lines/i);
  });

  it('no longer asks for a check-in of everything that finished and is stuck', () => {
    expect(brief).not.toMatch(/then what finished and what is stuck, each with its thread/);
  });
});
