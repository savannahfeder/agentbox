// A THREAD ASKING YOU A QUESTION IS NOT LABELLED ANSWERED (F-214, QA session 43).
//
// A Codex thread stopped on "What name and email should I use to commit the
// passing change?" and its Needs you row said Answered, the word for an agent
// that finished, so someone scanning the list would skip a thread that needs
// their words. A question with no options to pick now says Waiting on you; an
// answer with options, or with no question, still says Answered.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { asksForYourWords, cellUnderTab } from '../renderer/src/threads/page-rules.ts';

const result = (text: string, ts = 2) => ({ result: text, wrote: { result: { ts } } });

describe('whether the agent waits on your words', () => {
  it('is true for the git name and email question', () => {
    expect(asksForYourWords(result('The test passes. What name and email should I use to commit the passing change?'))).toBe(true);
  });

  it('is true for a question in the middle of the answer', () => {
    expect(asksForYourWords(result('**Which account should it post from?**\n\nI drafted both versions.'))).toBe(true);
  });

  it('is false for an answer that offers options to pick', () => {
    expect(asksForYourWords(result('**Ship it?**\n\n## Options\n1. Ship it (recommended)\n2. Throw it away'))).toBe(false);
  });

  it('is false for a plain finished answer, and a ? inside a link or code', () => {
    expect(asksForYourWords(result('Done, the tests are green and nothing needs you.'))).toBe(false);
    expect(asksForYourWords(result('It is at https://x.test/a?b=1 and `a?b` now.'))).toBe(false);
    expect(asksForYourWords({})).toBe(false);
  });

  it('reads the newer of the answer and the note', () => {
    expect(asksForYourWords({ result: 'Which one?', note: 'Picked the first, carrying on.', wrote: { result: { ts: 1 }, note: { ts: 2 } } })).toBe(false);
    expect(asksForYourWords({ result: 'Done.', note: 'What email should I use?', wrote: { result: { ts: 1 }, note: { ts: 2 } } })).toBe(true);
  });
});

describe('the Status word in Needs you', () => {
  it('says Waiting on you when the agent asks for your words, Answered otherwise', () => {
    expect(cellUnderTab('Waiting on you', 'inbox', { fromPeople: false, asks: true })).toBe('Waiting on you');
    expect(cellUnderTab('Waiting', 'inbox', { fromPeople: false, asks: true })).toBe('Waiting on you');
    expect(cellUnderTab('Waiting on you', 'inbox', { fromPeople: false, asks: false })).toBe('Answered');
  });

  it('leaves other tabs and other words alone', () => {
    expect(cellUnderTab('In progress', 'progress', { fromPeople: false, asks: true })).toBeNull();
    expect(cellUnderTab('Stopped', 'inbox', { fromPeople: false, asks: true })).toBe('Stopped');
  });

  it('is what the inbox row draws', () => {
    const pages = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/threads/Pages.tsx'), 'utf8');
    expect(pages).toMatch(/cellUnderTab\(worded\.word, tab, \{ fromPeople: !!waits \|\| peopleWaitOnYou, asks: asksForYourWords\(item\) \}\)/);
  });
});
