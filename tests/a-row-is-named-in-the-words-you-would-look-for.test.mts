// A ROW IS NAMED IN THE WORDS YOU WOULD LOOK FOR IT BY.
//
// An agent filed a bug thread titled "Auto sent a plain research ask to the
// Chief of staff instead of a regular thread". Its body explained the cause in
// code terms (`routePrompt`, a 1500-character cut), and the naming model called
// the row "Auto-route prompt truncation bug". The person looked for the thread
// about "chief of staff issues", did not see it, and asked where it was. Read
// from the row's history: open, never started, in Needs you, under that name.
//
// The naming prompt now asks for the words the opening line uses, and no code
// name, file name or technical term the opening line did not use.
import { describe, it, expect } from 'vitest';
import { namePrompt } from '../main/row-label.mts';

const prompt = namePrompt({
  title: 'Auto sent a plain research ask to the Chief of staff instead of a regular thread',
  body: 'The cause: `routePrompt` in shared/auto-route.mts cuts the body to 1500 characters.',
} as never).replace(/\s+/g, ' ');

describe('the naming prompt', () => {
  it('asks for the words the opening line uses', () => {
    expect(prompt).toMatch(/in the words the opening line uses/);
  });
  it('rules out code names and technical terms the opening line did not use', () => {
    expect(prompt).toMatch(/never a code name, file name or technical term/);
  });
  it('still names the thing being worked on, in 3 to 6 words', () => {
    expect(prompt).toMatch(/3 to 6 words/);
    expect(prompt).toContain('Chief of staff');
  });
});
