// A HANDED-OVER BRIEF READS AS WORDS, NOT MARKS (w-f702d60afe, round six, 2026-11-20).
//
// The designer tester opened the thread Dana started from a task Priya handed
// her: it "displays a bracketed title and full address, bold punctuation".
// Read from that copy's store: the thread's first message is the brief the app
// wrote, "[Clinic bookings list empty states](https://app.agentbox.ac/t/…)" on
// a line of its own and the agent's "**The next version is ready for
// review.**" under "Where it got to:". A person's message is drawn as typed, so
// both came out as marks.
//
// A line that is only a thread's link is drawn as the link, as an attached file
// already is (a web link you type yourself stays as typed), and the brief carries the agent's words without its bold marks.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { typedParts } from '../renderer/src/typed-message';

describe('a person\'s message', () => {
  it('draws a line that is only a thread\'s link as the link', () => {
    expect(typedParts('Priya Shah asked:\n\n[Clinic bookings list empty states](https://app.agentbox.ac/t/c5/w-ebd3c6261e)\n\nThe design is ready.')).toEqual([
      { text: 'Priya Shah asked:' },
      { embed: '[Clinic bookings list empty states](https://app.agentbox.ac/t/c5/w-ebd3c6261e)' },
      { text: 'The design is ready.' },
    ]);
  });
  it('keeps a link written inside a sentence, or any other web link, as typed', () => {
    expect(typedParts('See [the doc](https://example.com/a) first.')).toEqual([{ text: 'See [the doc](https://example.com/a) first.' }]);
    expect(typedParts('the docs:\n[guide](https://example.com/guide)')).toEqual([{ text: 'the docs:\n[guide](https://example.com/guide)' }]);
  });
});

describe('the brief a thread hands on', () => {
  it('carries where it got to without bold marks', () => {
    const src = fs.readFileSync(new URL('../main/team/index.mts', import.meta.url), 'utf8');
    expect(src).toMatch(/Where it got to:\\n\\n\$\{unbold\(row\.result\)\}/);
    expect(src).toMatch(/const unbold = \(s: string\) => s\.replace\(\/\\\*\\\*\(\[\^\*\\n\]\+\)\\\*\\\*\/g, '\$1'\);/);
  });
});
