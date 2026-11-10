// A TITLE NEVER OPENS ON "OK SO", AND A MESSAGE OF SEVERAL ASKS IS NAMED FOR ALL OF THEM.
//
// What broke (phone testers, 2026-11-08): a dictated message, "Ok so the
// onboarding flow is confusing and the pricing page is wrong", was titled "Ok
// so the onboarding flow". The opener was only dropped with a comma after it,
// and a voice note has none. The computer's namer, asked for the thing being
// worked on, named only the first of several asks. Read from shortTitle and the
// namer's prompt.
import { describe, it, expect } from 'vitest';
import { shortTitle } from '../shared/thread-title.mts';
import { namePrompt } from '../main/row-label.mts';

describe('a spoken opener comes off the title', () => {
  it('"Ok so" with no comma', () => {
    expect(shortTitle('Ok so the onboarding flow is confusing and the pricing page is wrong')).toBe('The onboarding flow is confusing');
  });
  it('"okay so", "so basically", "um so" and "alright"', () => {
    expect(shortTitle('okay so the sign up email never arrives')).toMatch(/^The sign up email never arrives/);
    expect(shortTitle('So basically the export button does nothing')).toMatch(/^The export button does nothing/);
    expect(shortTitle('um so the export button does nothing')).toMatch(/^The export button does nothing/);
    expect(shortTitle('Alright the export button does nothing')).toMatch(/^The export button does nothing/);
  });
  it('still with a comma, as before', () => {
    expect(shortTitle('Ok, so the export button does nothing')).toMatch(/^The export button does nothing/);
  });
});

describe('words that only look like an opener stay', () => {
  it('"So many errors" is the work, not a filler', () => {
    expect(shortTitle('So many errors in the deploy log')).toMatch(/^So many errors/);
  });
  it('"Right sidebar" is a name', () => {
    expect(shortTitle('Right sidebar is too wide on small screens')).toMatch(/^Right sidebar/);
  });
  it('a short line is kept as typed', () => {
    expect(shortTitle('OK button')).toBe('OK button');
  });
});

describe('the namer is told to name every ask', () => {
  it('the prompt says so', () => {
    expect(namePrompt({ title: 'x', body: 'y' })).toMatch(/several things, name all of them/);
  });
});
