// A THREAD AN AGENT IS WORKING ON READS AS ONE PAGE (w-31c71743b5, 2026-10-29).
//
// What broke: opening a first task while its agent worked showed "You", the
// ask, "The agent", its narration, "You" and "hello", "The agent" again, then
// "Thinking": a short thread is drawn whole (a-short-thread-is-drawn-whole-
// with-your-ask-in-it). The founder: "What it shows first is rather ugly ...
// we need to really improve the UI of the page when the agent is working."
// Of five layouts drawn in the real window she picked the folded page with her
// ask on top: "If that's just while it's working, I'd recommend that."
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { askLine } from '../renderer/src/one-thing-at-a-time.ts';

describe('the line under the title while an agent works', () => {
  it('is what you asked, as one sentence', () => {
    expect(askLine('Draft a short post announcing what I am building')).toBe('You asked: Draft a short post announcing what I am building.');
    expect(askLine('Fix the login bug.')).toBe('You asked: Fix the login bug.');
  });
  it('keeps to the first paragraph of a long ask', () => {
    expect(askLine('Fix the login bug\n\nIt fails on Safari and only after a reload')).toBe('You asked: Fix the login bug.');
  });
  it('is nothing while the title is still the ask itself', () => {
    // Measured 2026-10-29: before a thread is named its title is your words, and the line said them twice.
    expect(askLine('Research five note apps. Take your time.', 'Research five note apps. Take your time.')).toBe(null);
    expect(askLine('Research five note apps', 'Note app research')).toBe('You asked: Research five note apps.');
  });
  it('is nothing when there was no ask', () => {
    expect(askLine('')).toBe(null);
    expect(askLine('   ')).toBe(null);
  });
});

describe('the page', () => {
  const page = fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');
  // Since main's a-working-agent page (9d041d39), it shows every step since you spoke rather than folding.
  it('draws the steps since you spoke while the agent works', () => {
    expect(page).toContain('const stands = !queue ? -1 : working ? workingFrom(events) : standsAt(events, newest);');
  });
  it('says what you asked until the agent writes a summary of its own', () => {
    expect(page).toContain("context={working && !queue.context ? workingContext(isCause(item) ? '' : item.body ?? item.title ?? '', pageTitle(item), queue.repeats ?? null) : queue.context}");
  });
  it('never draws the answer alone while the agent works', () => {
    expect(page).toContain('const alone = !!newest && !working && stands < 0;');
  });
});
