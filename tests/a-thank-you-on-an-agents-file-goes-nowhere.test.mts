// A THANK-YOU ON AN AGENT'S FILE GOES NOWHERE, AND THE CARD SAYS SO.
//
// Maya's note "Thanks, v6 reads well." on her agent's investor
// update read "Sent to the agent", and the agent was handed "Make these
// changes and save the result as ... v7". It ran, made nothing, and put a
// question in her Needs you. Measured on noteGoesTo: the rule reads past a
// leading name ("Sam, approved"), and "Thanks," looked like one, so the words
// it tested were "v6 reads well.", which no thank-you pattern matched.
import { it, expect, describe } from 'vitest';
import { noteGoesTo } from '../shared/artifact-marks.mjs';

const people = [{ id: 'p-sofia', name: 'Sofia Reyes' }, { id: 'p-dev', name: 'Dev Rao' }];
const goes = (text) => noteGoesTo({ text, place: { kind: 'whole' } }, people).to;

describe('a note that only thanks or approves is for nobody', () => {
  it('Maya’s note', () => {
    expect(goes('Thanks, v6 reads well.')).toBe('nobody');
  });
  it('thanks, looks good, approved, reads well, in any order', () => {
    for (const t of ['Thanks, looks good', 'Approved, thanks', 'Great, thanks!', 'Reads well.', 'v6 reads well', 'Looks good to me', 'Sounds good', 'Nice work, thank you', 'All good, ship it']) {
      expect(goes(t), t).toBe('nobody');
    }
  });
  it('a stranger’s name in front still reads past it', () => {
    expect(goes('Sam, approved')).toBe('nobody');
    expect(goes('Sam, thanks, reads well')).toBe('nobody');
  });
});

describe('what must still reach the agent or a person', () => {
  it('a thank-you that asks for something goes to the agent', () => {
    for (const t of ['Thanks, v6 reads well. Could you cut the last line?', 'Thanks, but the date is wrong', 'Reads well, except the intro', 'Looks good, tighten the gap', 'Great, now add the chart']) {
      expect(goes(t), t).toBe('agent');
    }
  });
  it('praise said the other way round is a complaint, for the agent', () => {
    for (const t of ['The intro does not read well', 'This doesn’t look good on a phone', 'Not great: the chart is cut off']) {
      expect(goes(t), t).toBe('agent');
    }
  });
  it('a long note that happens to say thanks is read as work', () => {
    expect(goes('Thanks. The clinic count on slide two is 42 now and the waitlist line still says 40 in the footer')).toBe('agent');
  });
  it('a teammate’s name first is still theirs', () => {
    expect(noteGoesTo({ text: 'Sofia, thanks, reads well' }, people)).toEqual({ to: 'person', person: 'p-sofia' });
  });
});
