// THE TUTORIAL SAYS INBOX ZERO ONLY WHEN ITS THREADS ARE GONE (w-fbe5e95dea, 2026-11-10).
//
// Both round-five testers marked a practice thread done, pressed Z as the card
// told them, and then read "Great! Your inbox is now empty" with that thread
// back in Needs you. The tab beat said it whatever the list held. It now counts
// the practice threads still in the inbox.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { coach } from '../renderer/src/onboarding.ts';

const tabs = ['inbox', 'progress', 'done'];

describe("the tab beat's first card", () => {
  it('calls the inbox empty when no practice thread is left in it', () => {
    expect(coach('where', 0, { view: 'inbox', tabs, unfinished: 0 })!.quiet).toMatch(/inbox is now empty/);
    expect(coach('where', 0, { view: 'inbox', tabs })!.quiet).toMatch(/inbox is now empty/);
  });
  it('says one is still waiting when an undo brought one back', () => {
    const said = coach('where', 0, { view: 'inbox', tabs, unfinished: 1 })!;
    expect(said.quiet).not.toMatch(/is now empty/);
    expect(said.quiet).toMatch(/One thread is still in your inbox/);
    expect(said.key).toBe('⇥');
  });
  it('counts more than one', () => {
    expect(coach('where', 0, { view: 'inbox', tabs, unfinished: 2 })!.quiet).toMatch(/2 threads are still in your inbox/);
  });
  it('is told the count by the app', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const ob = fs.readFileSync(new URL('../renderer/src/components/Onboarding.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/unfinished=\{/);
    expect(ob).toMatch(/unfinished,?\s/);
  });
});
