// SKIP WALKTHROUGH IN COMMAND K, AT ITS LAST STEP, FINISHES IT (w-9687db6270, 2026-11-23).
//
// The founder, at the walkthrough's last step, which asks you to use ⌘K: "I went
// to Command-K, hit Skip Walkthrough, and it didn't give me the little nice
// confetti at the end." Running a command is what that step asks, but the one
// she ran marked the walkthrough skipped, and a skipped walkthrough has no end:
// no confetti and no "You finished the walkthrough". Skipping from ⌘K now
// counts as having used it, so at the last step it finishes; earlier it still
// skips.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LESSONS, skipFromPalette, startTour, tourFinishing, tourLive, tourOver, type Tour } from '../renderer/src/tour.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const at = (done: Tour['done']): Tour => ({ ...startTour(), sent: true, done });

describe('Skip walkthrough in ⌘K', () => {
  it('at the last step, finishes the walkthrough, with its ending', () => {
    const t = skipFromPalette(at(LESSONS.filter((l) => l !== 'palette')));
    expect(tourOver(t)).toBe(true);
    expect(tourFinishing(t)).toBe(true);
    expect(t.skipped).toBe(false);
  });
  it('earlier, skips it, with no ending', () => {
    for (const done of [[], ['start', 'compose'], LESSONS.filter((l) => l !== 'palette' && l !== 'close')] as Tour['done'][]) {
      const t = skipFromPalette(at(done));
      expect(t.skipped).toBe(true);
      expect(tourLive(t)).toBe(false);
      expect(tourOver(t)).toBe(false);
    }
  });
  it('is what the command runs', () => {
    expect(app).toMatch(/onEndTutorial=\{tourLive\(tour\) \? \(\) => \{ setTour\(skipFromPalette\(tour!\)\); setModal\(null\); \} : undefined\}/);
  });
});
