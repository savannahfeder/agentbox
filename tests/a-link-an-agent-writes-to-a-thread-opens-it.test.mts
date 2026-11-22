// A LINK AN AGENT WRITES TO A THREAD OPENS IT.
//
// A power tester (2026-11-16) clicked "Website waitlist copy review" in a cause
// lead's answer, three times, and stayed where they were. The agent wrote the
// link as agentbox://work-items/w-ee1198d969, which the answer's link filter
// emptied, so it opened nothing. Reproduced in a copy of the app, then clicked
// there again after the fix.
import { describe, it, expect } from 'vitest';
import { threadOfHref } from '../renderer/src/ticket-references.ts';

describe('the thread a link names', () => {
  it('agentbox://work-items/<id>, as agents write it', () => {
    expect(threadOfHref('agentbox://work-items/w-ee1198d969')).toBe('w-ee1198d969');
  });

  it('the bare id and the ticket form, as before', () => {
    expect(threadOfHref('w-ee1198d969')).toBe('w-ee1198d969');
    expect(threadOfHref('#ticket/w-ee1198d969')).toBe('w-ee1198d969');
  });

  it('nothing else: a web address, a file, another agentbox link, a short id', () => {
    expect(threadOfHref('https://github.com/x/w-ee1198d969')).toBe(null);
    expect(threadOfHref('designs/w-ee1198d969/a.png')).toBe(null);
    expect(threadOfHref('agentbox://connections/github')).toBe(null);
    expect(threadOfHref('agentbox://work-items/w-ee11')).toBe(null);
    expect(threadOfHref(undefined)).toBe(null);
  });

  it('survives the link filter on an answer as the id a thread page opens', async () => {
    const { artifactUrlTransform } = await import('../renderer/src/remark-artifact-paths.ts');
    expect(artifactUrlTransform('agentbox://work-items/w-ee1198d969')).toBe('w-ee1198d969');
    expect(artifactUrlTransform('agentbox://work-items/nothing')).toBe('');
    expect(artifactUrlTransform('https://example.com/a')).toBe('https://example.com/a');
  });
});
