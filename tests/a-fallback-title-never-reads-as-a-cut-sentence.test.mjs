// A FALLBACK TITLE NEVER READS AS A CUT SENTENCE.
//
// Rows read "Ask Dev whether the Render invite", "Patients in
// Austin say they got" and "Fact check the refund wording before": the first
// six words of a sentence, stopped wherever the sixth fell. Measured in
// shared/thread-title.mjs: the only trim dropped a last word from a short list
// (a, the, to, ...), and whether, before, got, going and off were not on it,
// nor was anything that stops at the start of a new clause.
//
// Now a cut title stops before a clause it cannot finish, and drops a last
// word that only leads somewhere. A title that was not cut is left alone.
import { it, expect, describe } from 'vitest';
import { shortTitle, TITLE_WORDS } from '../shared/thread-title.mjs';

const said = (t) => shortTitle(t);

describe('a title cut short', () => {
  it('stops before a clause it cannot finish', () => {
    expect(said('Ask Dev whether the Render invite was accepted, he has not said.')).toBe('Ask Dev');
  });
  it('drops a last word that only leads on', () => {
    expect(said('Fact check the refund wording before it goes out to the clinics on Friday.')).toBe('Fact check the refund wording');
    expect(said('Move the clinic calendar sync off the cron box and onto the worker queue')).toBe('Move the clinic calendar sync');
    expect(said('Can you look at why the reminder emails are going out at the wrong time?')).toBe('Why the reminder emails');
  });
  it('drops "they got" and keeps what was reported', () => {
    expect(said('> Patients in Austin say they got appointment reminders at 3am.')).toBe('Patients in Austin got appointment reminders');
  });
  it('drops a pronoun and its verb left at the end', () => {
    expect(said('The clinic in Leeds told us yesterday they got two bills')).not.toMatch(/\b(they|got)$/i);
  });
  it('is never more than six words, and never one word where it had more', () => {
    for (const t of ['Ask Dev whether the Render invite was accepted.', 'Patients in Austin say they got reminders.', 'Fact check the refund wording before Friday please.']) {
      const out = said(t);
      expect(out.split(' ').length).toBeLessThanOrEqual(TITLE_WORDS);
      expect(out.split(' ').length).toBeGreaterThan(1);
    }
  });
});

describe('a title that was not cut', () => {
  it('keeps its last word, even one that could lead on', () => {
    expect(said('Ship the fix before')).toBe('Ship the fix before');
    expect(said('The checkout page is down for everyone.')).toBe('The checkout page is down for everyone');
  });
  it('keeps a whole name of six words', () => {
    expect(said('Two patients at the Riverside clinic both got a confirmation for the 9:30 slot.')).toBe('Two patients at the Riverside clinic');
    expect(said('Hey Maya, could you call the Riverside clinic manager and tell her about it.')).toBe('Call the Riverside clinic manager');
  });
});
