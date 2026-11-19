// A THREAD LINK AS AN ANSWER'S FIRST LINE OPENS IT.
//
// Test day 2026-11-18: the ops tester asked for a clickable link to another
// thread and got an answer opening with
// **[Open the founder review plan thread](agentbox://work-item/w-bf89c20d79).**
// The page drew it as words, brackets and address included: a bold first line
// is lifted out as the answer's heading and drawn as plain text, and the link
// filter only knew agentbox://work-items/ (Nov 16), not the singular this agent
// wrote. A bold line with a link in it now stays in the answer, where links
// are drawn, and either form names the thread.
import { describe, it, expect } from 'vitest';
import { threadOfHref } from '../renderer/src/ticket-references.ts';
import { splitHeadline } from '../renderer/src/one-thing-at-a-time.ts';

describe('the address', () => {
  it('agentbox://work-item/<id> names the thread, as the plural does', () => {
    expect(threadOfHref('agentbox://work-item/w-bf89c20d79')).toBe('w-bf89c20d79');
    expect(threadOfHref('agentbox://work-items/w-bf89c20d79')).toBe('w-bf89c20d79');
  });
  it('survives the link filter on an answer as the id a thread page opens', async () => {
    const { artifactUrlTransform } = await import('../renderer/src/remark-artifact-paths.ts');
    expect(artifactUrlTransform('agentbox://work-item/w-bf89c20d79')).toBe('w-bf89c20d79');
  });
  it('another agentbox address still names none', () => {
    expect(threadOfHref('agentbox://work-itemz/w-bf89c20d79')).toBe(null);
    expect(threadOfHref('agentbox://connections/github')).toBe(null);
  });
});

describe('the first line', () => {
  it('a bold line holding a link stays in the answer, where it is drawn as a link', () => {
    const text = '**[Open the founder review plan thread](agentbox://work-item/w-bf89c20d79).**\n\nThe guide is unchanged.';
    expect(splitHeadline(text)).toEqual({ headline: null, rest: text });
  });
  it('a plain bold line is still the heading', () => {
    expect(splitHeadline('**The guide is ready.**\n\nIt has five steps.')).toEqual({ headline: 'The guide is ready.', rest: 'It has five steps.' });
  });
});
