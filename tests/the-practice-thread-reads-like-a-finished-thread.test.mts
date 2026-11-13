// THE PRACTICE THREAD READS LIKE A FINISHED THREAD (w-1e52420829, 2026-11-13).
//
// Someone going through the walkthrough opened the practice thread and found
// three things wrong with it. It opened with every earlier message and tool
// line showing, which no finished thread does: "it just shows the response +
// summary and the numbered options, that's all". It asked them to press R and
// type an answer, and the box was empty: "I got stuck here because I don't
// know what to say. Should just give numerical options and suggest I choose
// one." And nothing on it said what the thread was: "I have no idea what this
// thread is or does".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PRACTICE_ANSWER, PRACTICE_CONTEXT, PRACTICE_DONE } from '../shared/first-run-practice.mts';
import { optionsFrom } from '../renderer/src/format.ts';

const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('the practice answer', () => {
  it('ends in numbered options, the first one recommended', () => {
    expect(optionsFrom(PRACTICE_ANSWER).length).toBeGreaterThanOrEqual(2);
    expect(PRACTICE_ANSWER).toMatch(/## Options\n1\. .+ \(recommended\)\n2\. .+$/);
  });
  it('no longer asks for words nobody has', () => {
    expect(PRACTICE_ANSWER).not.toMatch(/Say the word/);
  });
});

describe('what the practice thread says it is', () => {
  it('has a summary of what was asked and what was done, written with its answer', () => {
    expect(PRACTICE_CONTEXT).toMatch(/^You asked for /);
    expect(PRACTICE_DONE.split('\n').length).toBeGreaterThanOrEqual(2);
    expect(read('main/store.mts')).toMatch(/\{ result: PRACTICE_ANSWER, problem: PRACTICE_CONTEXT, progress: PRACTICE_DONE \}/);
  });
});

describe('how the practice thread opens', () => {
  it('is folded like every other thread, not with all its earlier messages showing', () => {
    const thread = read('renderer/src/components/ItemThread.tsx');
    expect(thread).not.toMatch(/opensWhole/);
    expect(thread).toMatch(/setEarlierOpen\(kept \? !!kept\.earlier : false\)/);
  });
});

// Walked on a Mac the same day: pressing 1 sent the person back to the inbox list
// with "WALKTHROUGH 4 OF 5" over it and no tip at all. A typed reply on the practice
// thread keeps you in it and tells the walkthrough; a picked option did neither.
describe('picking an option on the practice thread', () => {
  const app = read('renderer/src/App.tsx');
  it('keeps you in the thread, as a typed reply does', () => {
    expect(app).toMatch(/takeBack, isTourPractice\(tourRef\.current, item\) \|\| !movesOn\(item\) \|\| pickStaysPut\(/);
  });
  it('counts as the reply the practice agent answers', () => {
    expect(app).toMatch(/if \(isTourPractice\(tourRef\.current, item\)\) \{ const t = practiceReplied\(readTour\(localStorage\) \?\? tourRef\.current!\); setTour\(t\); tourRef\.current = t; \}\n      try \{ await api\.answer\(\{ product: item\.product, id: item\.id, answer,/);
  });
  // E pressed straight after 1 closed the thread, and the pick, landing a moment later, wrote an older
  // copy of the walkthrough over "close is done": step 4 of 5 with no tip, for good.
  it('builds on the walkthrough as saved, so a close in between is not undone', () => {
    expect(app).toMatch(/practiceReplied\(readTour\(localStorage\) \?\? tourRef\.current!\)/);
  });
});

describe('the walkthrough on it', () => {
  it('asks for a number, since the open thread offers options', () => {
    const tour = read('renderer/src/tour.ts');
    expect(tour).toMatch(/if \(s\.options && todo\('choose'\)\) return 'choose';/);
    expect(read('renderer/src/components/Tour.tsx')).toMatch(/choose: \{ words: <>Press <K k="1" \/> to choose the recommended option<\/>/);
  });
});
