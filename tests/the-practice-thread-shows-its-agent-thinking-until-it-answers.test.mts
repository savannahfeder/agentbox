// THE PRACTICE THREAD SHOWS ITS AGENT THINKING UNTIL IT ANSWERS (w-1e52420829, 2026-11-14).
//
// Someone pressed 1 on the walkthrough's practice thread and nothing on the
// thread moved: "it didn't give me the little animated thinking icon or
// anything, so I just thought the app was stuck". Watched on a throwaway copy
// for three seconds after the press: the thread read "Picked Make it shorter"
// and nothing else, for good. Two faults.
//
// The pick was thrown away. The app counted it as a reply, and a beat later
// the walkthrough wrote "lesson learned" from the copy of its state it had
// held since before the press, which put the count back to none. So the
// practice answer to a reply ("Shorter now: three lines") never came.
//
// And had it come, nothing would have moved first. A real thread shows its
// agent thinking under the conversation the moment you answer it. The practice
// thread is answered by the app, has no agent, and so was given no line at all
// (tests/a-practice-thread-never-says-nothing-is-running).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { liveLine } from '../renderer/src/live-line.ts';
import { offersTryAgain } from '../renderer/src/try-again.ts';
import { FIRST_RUN_LABEL } from '../renderer/src/onboarding.ts';
import type { WorkItem } from '../renderer/src/types.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const practice = { id: 'w-1', product: 'practice', status: 'open', title: 'Add a summary', labels: [FIRST_RUN_LABEL] } as WorkItem;
const real = { ...practice, id: 'w-2', product: 'sandbox', labels: [] } as WorkItem;
const now = Date.now();

describe('the line under the practice thread', () => {
  it('says the agent is working while the answer is on its way', () => {
    expect(liveLine(practice, { answering: true, inProgress: true, now })?.state).toBe('working');
  });
  it('says nothing once the answer has landed', () => {
    expect(liveLine(practice, { answering: false, inProgress: true, now })).toBe(null);
    expect(liveLine(practice, { inProgress: true, now })).toBe(null);
  });
  it('still offers no Try again, since nothing can start it', () => {
    expect(offersTryAgain(practice, { answering: true, inProgress: true, queued: [], now })).toBe(false);
  });
  it('is not how a real thread is made to look busy', () => {
    expect(liveLine(real, { answering: true, inProgress: true, queued: [], now })?.state).toBe('idle');
  });
});

describe('a lesson learned by a press', () => {
  const tour = read('renderer/src/components/Tour.tsx');
  it('is written onto what is saved, so what the app wrote during the press is kept', () => {
    expect(tour).toContain('const learnSoon = (l: Lesson) => setTimeout(() => { const saved = readTour(localStorage) ?? tour; if (saved) onChange(finishLesson(saved, l)); }, 0);');
    expect(tour).toContain('if (!typing && keyLearns(step, e)) { learnSoon(lessonOf(step)); return; }');
  });
  it('is never written a beat later from the state held before the press', () => {
    expect(tour).not.toMatch(/setTimeout\(\(\) => onChange\(finishLesson\(tour,/);
    expect(tour).not.toMatch(/later\(finishLesson\(tour,/);
  });
});

// The third fault, found on the same watch: a pick is held three seconds for an undo before it is sent,
// so even counted, the practice agent would have sat still that long before starting to think.
describe('a pick on the practice thread', () => {
  const app = read('renderer/src/App.tsx');
  it('is sent at once, with no hold for an undo, since nothing real is sent', () => {
    expect(app).toMatch(/\{ product: item\.product, id: item\.id \}, undid,\n[^\n]*\n\s*isTourPractice\(tourRef\.current, item\) \? 0 : undefined\);/);
    expect(app).toContain('if (holdMs <= 0) { await write(); return; }');
  });
});

describe('the window', () => {
  const app = read('renderer/src/App.tsx');
  it('tells the open thread when it is the practice thread waiting for its answer', () => {
    expect(app).toContain('const practiceAnswering = !!tourPractice?.item && focused?.id === tourPractice.item && (tourPractice.answered ?? 0) <= tourPractice.replies;');
    expect(app).toMatch(/answering: practiceAnswering,/);
    expect(app).toContain('answering={practiceAnswering}');
  });
});
