// A RELOAD MID-TUTORIAL PICKS THE TUTORIAL UP AGAIN (w-fbe5e95dea, 2026-11-10).
//
// Driving a copy through the tutorial and reloading the window on the answer
// step, the tutorial was gone. Its five practice threads stayed in Needs you
// and In progress with nothing to end them; only a relaunch swept them
// (Store.init). Sweeping them on the next load was the first fix. Both
// round-six testers then reloaded mid-tutorial and asked for it back where they
// left it. So the first snapshot after a load resumes the saved tutorial while
// its practice project is still there, and sweeps a practice project nothing
// will resume.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { START, resumableTutorial } from '../renderer/src/onboarding.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const practice = { slug: 'practice', practice: true };

describe('resumableTutorial', () => {
  const saved = { ...START, tutorial: true, practice: 'practice', step: 'open' as const };
  it('is the saved tutorial while its practice project is there', () => {
    expect(resumableTutorial(saved, [practice])).toEqual(saved);
  });
  it('is nothing once the practice project has gone', () => {
    expect(resumableTutorial(saved, [{ slug: 'mine' }])).toBe(null);
  });
  it('is nothing for a saved setup that is not the tutorial', () => {
    expect(resumableTutorial({ ...saved, tutorial: false }, [practice])).toBe(null);
  });
  it('is nothing before the practice project was made', () => {
    expect(resumableTutorial({ ...saved, practice: null, step: 'hand' }, [practice])).toBe(null);
  });
});

describe('the first snapshot after a load', () => {
  const at = app.indexOf('const sweptPractice = useRef(false);');
  const effect = app.slice(at, at + 900);
  it('resumes the tutorial when it can', () => {
    expect(at).toBeGreaterThan(-1);
    expect(effect).toMatch(/resumableTutorial\(readFirstRun\(localStorage\), snap\.products\)/);
    expect(effect).toMatch(/setRun\(again\)/);
  });
  it('else sweeps a practice project no tutorial is running', () => {
    expect(effect).toMatch(/if \(!snap \|\| sweptPractice\.current\) return;/);
    expect(effect).toMatch(/snap\.products\.some\(\(p\) => p\.practice\)/);
    expect(effect).toMatch(/api\.firstRunPracticeEnd\(\)/);
  });
});
