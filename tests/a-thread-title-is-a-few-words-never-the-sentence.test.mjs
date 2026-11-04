// A THREAD'S TITLE IS A FEW WORDS, NEVER THE SENTENCE THAT OPENED IT.
//
// What broke, seen 2026-10-30 on two copies of the team version at 1440x900:
// a thread opened with a quoted line was titled "> Patients in Austin say they
// got appointment reminders at 3am." on its owner's list and on the teammate's
// copy; a task Dev gave Maya was titled "Hey Maya, could you call the Riverside
// clinic manager and tell her about the double…" as a two-line headline; and an
// agent thread read as its whole first sentence until the namer ran. Each title
// came from a different place (the namer, firstSentence for tasks and messages,
// the first line for threads, the raw card on a teammate's copy), so the list
// read in three styles. One rule now: shared/thread-title.mjs.
import { describe, it, expect } from 'vitest';
import { shortTitle, shownTitle } from '../shared/thread-title.mjs';
import { rowTitle } from '../renderer/src/list-rules';
import { cardsFor } from '../shared/thread-cards.mjs';

const count = (s) => s.split(/\s+/).filter(Boolean).length;

describe('a sentence becomes a short name', () => {
  const cases = [
    ['Two patients at the Riverside clinic both got a confirmation for the 9:30 slot on Friday and showed up at the same time, which was really awkward for the front desk.', 'Two patients at the Riverside clinic'],
    ['> Patients in Austin say they got appointment reminders at 3am.', 'Patients in Austin got appointment reminders'],
    ['The reminders fire twice and nobody knows why.', 'The reminders fire twice'],
    ['Hey Maya, could you call the Riverside clinic manager and tell her about the double booking fix before Thursday, since she asked us to let her know personally.', 'Call the Riverside clinic manager'],
    ['Can you look at why the reminder emails are going out at the wrong time for clinics outside Lisbon?', 'Why the reminder emails'],
    ['The checkout page is down for everyone.', 'The checkout page is down for everyone'],
    ['I can no longer open the settings page.', 'Cannot open the settings page'],
    ['Book Dr. Ames for the group class on Thursday morning.', 'Book Dr. Ames'],
    ['Please write a launch post for the clinic booking widget and schedule it for Tuesday morning.', 'Write a launch post'],
    ['**Fix** the `slot_race` bug in the booking flow before the Northgate demo on Monday', 'Fix the slot_race bug'],
    ['- move the clinic calendar sync off the cron box and onto the worker queue', 'Move the clinic calendar sync'],
  ];
  it.each(cases)('"%s"', (input, want) => {
    expect(shortTitle(input)).toBe(want);
  });

  it('is never longer than eight words, never ends on punctuation, and starts with a capital', () => {
    for (const [input] of cases) {
      const t = shortTitle(input);
      expect(count(t)).toBeLessThanOrEqual(8);
      expect(t).not.toMatch(/[.,;:!?…]$/);
      expect(t).not.toMatch(/^>/);
      expect(t[0]).toBe(t[0].toUpperCase());
    }
  });
});

describe('what must not change', () => {
  it.each([
    'Fix login on Safari',
    'health check',
    'iOS build',
    'Q3 pricing page',
    'Why is CI red?',
    'npm audit',
    'Make tasks from findings 1 to 3',
  ])('a short title a person typed: "%s"', (typed) => {
    expect(shortTitle(typed)).toBe(typed);
  });

  it('a name the namer already wrote', () => {
    expect(shownTitle({ title: 'Two patients at the Riverside clinic both got a confirmation.', label: 'Riverside double booking fix' })).toBe('Riverside double booking fix');
  });

  it('a rename made after the namer ran', () => {
    expect(shownTitle({
      title: 'slot race', label: 'Riverside double booking fix',
      wrote: { title: { ts: 30, source: 'founder' }, label: { ts: 20, source: 'agent' } },
    })).toBe('slot race');
  });

  it('nothing in, nothing out', () => {
    expect(shortTitle('')).toBe('');
    expect(shortTitle(null)).toBe('');
  });
});

describe('every place a title is shown follows it', () => {
  it('the row in your own list', () => {
    expect(rowTitle({ title: '> Patients in Austin say they got appointment reminders at 3am.' })).toBe('Patients in Austin got appointment reminders');
  });

  it('the card a teammate reads', () => {
    const item = { id: 't1', status: 'open', title: 'Hey Maya, could you call the Riverside clinic manager and tell her about the fix?', body: '', updatedAt: 1 };
    const cards = cardsFor({ products: [{ name: 'Sandbox', team: { shared: true } }], readItems: () => [item], now: 2 });
    expect(cards.map((c) => c.title)).toEqual(['Call the Riverside clinic manager']);
  });
});
