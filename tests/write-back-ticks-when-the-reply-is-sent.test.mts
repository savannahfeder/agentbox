// WRITE BACK TICKS WHEN THE REPLY IS SENT (w-fbe5e95dea, 2026-11-10).
//
// Both final-round testers pressed R on the walkthrough's "Press R to answer
// this agent" and watched Write back tick and the count move to 4 of 5 with
// the reply box still empty. The lesson was learned by the key, and again by
// the caret landing in the box. It is learned when a reply is sent.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { keyLearns } from '../renderer/src/tour.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');

describe('the Write back lesson', () => {
  it('is not learned by pressing R', () => {
    expect(keyLearns('reply', { key: 'r' })).toBe(false);
  });
  it('is not learned by the caret landing in the reply box', () => {
    expect(tour).not.toMatch(/screen\.typing && !tour\.done\.includes\('reply'\)/);
  });
  it('is learned when a reply is sent', () => {
    expect(app).toMatch(/const answerWith = useCallback\(async \([^)]*\) => \{\n\s*if \(tourLive\(tourRef\.current\)\) \{\n\s*let t = finishLesson\(tourRef\.current!, 'reply'\);/);
  });
});
