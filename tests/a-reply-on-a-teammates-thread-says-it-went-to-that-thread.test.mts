// A REPLY ON A TEAMMATE'S THREAD SAYS IT WENT TO THAT THREAD.
//
// Test day 2026-11-18, both testers: a reply on a teammate's thread moved them
// on with "Sent to Would you approve this post?" and "Sent to One confirmed
// crash; the documented health response works", the answer's first line, not
// the thread. The note took `rowTitle`, which names a teammate's row by its
// latest answer for the inbox; the thread's own page names it by `pageTitle`.
// The note now names it as the page does.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { pageTitle } from '../renderer/src/one-thing-at-a-time.ts';
import { rowTitle } from '../renderer/src/list-rules.ts';

const thread = {
  id: 'w-434eef0bd1', title: 'LinkedIn post topics without Later', labels: ['founder', 'teammate:t-f7ff22a32a'],
  result: '**Would you approve this post?**\n\nA useful assistant can help you get to a first draft faster.',
};

it("names a teammate's thread by its title, where the inbox row reads its answer", () => {
  expect(rowTitle(thread)).toBe('Would you approve this post?');
  expect(pageTitle(thread)).toBe('LinkedIn post topics without Later');
});

it('the note after a reply takes the name the page uses', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const line = app.slice(app.indexOf('<SentLine'), app.indexOf('says={sentLineSays(toast.text)}'));
  expect(line).toContain('pageTitle(sentTo)');
  expect(line).not.toContain('rowTitle(sentTo)');
});
