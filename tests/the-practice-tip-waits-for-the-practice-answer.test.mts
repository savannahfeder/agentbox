// THE PRACTICE TIP WAITS FOR THE PRACTICE ANSWER (w-fbe5e95dea, 2026-11-10).
//
// Walking the tutorial in both themes: the practice thread opens on Send with
// only your own words in it, and the tip already said "Press R to answer this
// agent" for the two seconds before the practice answer arrived. Nothing runs
// behind a practice thread, so the busy check on the page never saw it working
// and the tip skipped to R. After a reply the same gap came back. Measured
// with a screenshot 0.5 s after ⌘↵. Now the open practice thread shows no tip
// until its answer for this round is in.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { tourStep, type Tour, type TourScreen } from '../renderer/src/tour.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const tip = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');

const sent: Tour = { sent: true, skipped: false, done: ['compose'], practice: { slug: 'practice', item: 'w-1', replies: 0 } };
const inThread = (more: Partial<TourScreen> = {}): TourScreen => ({ composer: 'none', view: 'inbox', rows: 0, running: 0, thread: true, options: false, covered: false, ...more });

describe('the tip on the open practice thread', () => {
  it('waits while its answer is on the way', () => {
    expect(tourStep(sent, inThread({ answering: true }))).toBe(null);
  });
  it('asks for R once the answer is in', () => {
    expect(tourStep(sent, inThread({ answering: false }))).toBe('reply');
    expect(tourStep(sent, inThread())).toBe('reply');
  });
  it('waits again after a reply, then asks for E', () => {
    const replied: Tour = { ...sent, done: ['compose', 'reply'], practice: { slug: 'practice', item: 'w-1', replies: 1, answered: 1 } };
    expect(tourStep(replied, inThread({ answering: true }))).toBe(null);
    expect(tourStep(replied, inThread({ answering: false }))).toBe('close');
  });
  it('does not hold back ⌘K, which is over the thread', () => {
    expect(tourStep(sent, inThread({ answering: true, palette: true }))).toBe('inPalette');
  });
});

describe('where the app says the answer is on the way', () => {
  it('is the practice thread on screen, answered fewer times than replied to', () => {
    expect(app).toMatch(/answering=\{!!tourPractice\?\.item && focused\?\.id === tourPractice\.item && \(tourPractice\.answered \?\? 0\) <= tourPractice\.replies\}/);
  });
  it('reaches the screen the tip reads', () => {
    expect(tip).toMatch(/answering: thread && answering,/);
  });
});
