// A REPEATING TASK CAN BE CHANGED, AND CHANGING IT NEVER LOSES A WORD.
//
// There was no way in at all. The opened rule drew her instruction and a run
// log and one button that ends it, and that was the whole pane: no box, and the
// R key did nothing because the key handler has no branch for this screen.
//
// What it has now is the box she already uses, holding the ONE MESSAGE she
// typed rather than the title and body this app split it into. That split is
// the thing this file guards. `joinMessage` has to be the exact inverse of
// `splitMessage` or an edit silently duplicates her first sentence, or drops
// it, and she would find out days later in a run.
import { describe, it, expect } from 'vitest';
import { splitMessage, joinMessage, TITLE_BUDGET } from '../renderer/src/message-split';

const roundTrip = (message) => joinMessage(splitMessage(message));

describe('the message she typed survives being stored and read back', () => {
  it('holds a short first line with detail under it', () => {
    const m = 'Every morning, check overnight signups\nCompare against yesterday and tell me only what moved.';
    expect(roundTrip(m)).toBe(m);
  });

  it('holds a single short line with nothing under it', () => {
    expect(roundTrip('Every morning, check overnight signups')).toBe('Every morning, check overnight signups');
  });

  // Her own repeating task is this shape: dictated as one paragraph, well past
  // the title budget, so the title is a sentence CLIPPED out of the body and
  // the body holds every word.
  it('holds a dictated paragraph too long to be a title', () => {
    const m = 'Can you keep a short list of my goals for this week and show it to me every morning so I can check it? '
      + 'I already set the recurrence. Main goal: Finish the onboarding copy. '
      + 'Friday: - Clean up the settings page. - Draft a list of people to invite.';
    expect(m.split('\n')[0].length).toBeGreaterThan(TITLE_BUDGET);
    expect(roundTrip(m)).toBe(m);
  });

  it('never says her first sentence twice', () => {
    const m = 'Can you keep a short list of my goals for this week and show it to me every morning so I can check it? And nothing else.';
    const { title } = splitMessage(m);
    const back = roundTrip(m);
    expect(back.indexOf(title)).toBe(back.lastIndexOf(title));
  });

  // THE SHAPE THAT WAS LOSING A LINE. `joinMessage` decided the title had been
  // clipped out of the body by asking whether the body STARTS WITH the title,
  // and a short first line whose detail happens to open with those same words
  // answers yes. So the join dropped the first line, and because the box saves
  // what it shows, one edit would have deleted it from the rule that briefs
  // every future run. The test is the inverse law this file already states:
  // nothing she typed is lost.
  it('holds a short first line the detail under it happens to repeat', () => {
    const m = 'Weekly goals\nWeekly goals: tell me which ones slipped and which are done.';
    expect(roundTrip(m)).toBe(m);
  });

  it('holds a first line the detail begins with word for word', () => {
    const m = 'Ship it\nShip it by Friday, and say so in the morning.';
    expect(roundTrip(m)).toBe(m);
  });

  it('keeps the label in step with the instruction, so the row cannot go stale', () => {
    const before = splitMessage('Every morning, check signups\nAgainst yesterday.');
    const edited = `${joinMessage(before)}\nAnd against last Monday.`;
    const after = splitMessage(edited);
    expect(after.title).toBe('Every morning, check signups');
    expect(after.body).toContain('And against last Monday.');
  });
});
