// LEAVING THE TUTORIAL TAKES ITS PRACTICE TASK OUT OF THE NEW THREAD BOX
// (w-fbe5e95dea, 2026-11-10).
//
// Taking pictures for the founder: the tutorial was left on its send step, and
// Home's New thread box still held "Add a summary to the Practice meeting
// notes", addressed to a real project. The tutorial's card saves its words as
// the box's draft like any other card. The practice task is now the one draft
// the tutorial's end takes away; anything else somebody typed stays.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { practiceDraftLeft } from '../renderer/src/onboarding.ts';
import { PRACTICE_TASK } from '../shared/first-run-practice.mts';

describe('practiceDraftLeft', () => {
  it('is the practice task, as the card wrote it or with words typed after', () => {
    expect(practiceDraftLeft(`${PRACTICE_TASK.title}\n\n${PRACTICE_TASK.body}`)).toBe(true);
    expect(practiceDraftLeft(`  ${PRACTICE_TASK.title}\n\n${PRACTICE_TASK.body} and more`)).toBe(true);
  });
  it('is not anything else', () => {
    expect(practiceDraftLeft('Fix the login bug')).toBe(false);
    expect(practiceDraftLeft('')).toBe(false);
  });
});

describe('the end of the tutorial', () => {
  it('clears the practice task out of the box', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const fn = app.slice(app.indexOf('const finishRun = useCallback'), app.indexOf('\n  }, [', app.indexOf('const finishRun = useCallback')));
    expect(fn).toMatch(/if \(practiceDraftLeft\(readComposeDraft\(\)\.text\)\) clearComposeDraft\(\);/);
  });
});
