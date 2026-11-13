// A PRACTICE THREAD NEVER SAYS NOTHING IS RUNNING (w-fbe5e95dea, 2026-11-10).
//
// The walkthrough's practice thread opens the moment it is sent, and for the
// second before the practice answer it read "Nothing running" with a Try again
// button under your own words. Rows labelled first-run are answered by the app
// and never started (the supervisor skips them), so that line was always
// wrong for them and Try again could not do anything. Measured with a
// screenshot 0.5 s after ⌘↵ in the walkthrough.
import { describe, it, expect } from 'vitest';
import { liveLine } from '../renderer/src/live-line.ts';
import { offersTryAgain } from '../renderer/src/try-again.ts';
import { FIRST_RUN_LABEL } from '../renderer/src/onboarding.ts';
import type { WorkItem } from '../renderer/src/types.ts';

const practice = { id: 'w-1', product: 'practice', status: 'open', title: 'Add a summary', labels: [FIRST_RUN_LABEL] } as WorkItem;
const real = { ...practice, id: 'w-2', product: 'sandbox', labels: [] } as WorkItem;
const waiting = { inProgress: true, queued: [] as string[], now: Date.now() };

describe('the line under a thread', () => {
  it('says nothing about agents on a practice thread waiting for its answer', () => {
    expect(liveLine(practice, waiting)).toBe(null);
  });
  it('offers no Try again there, since nothing can start it', () => {
    expect(offersTryAgain(practice, waiting)).toBe(false);
  });
  it('still says Nothing running, with Try again, on a real thread nothing is on', () => {
    expect(liveLine(real, waiting)?.state).toBe('idle');
    expect(offersTryAgain(real, waiting)).toBe(true);
  });
});
