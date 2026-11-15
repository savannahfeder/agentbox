// Trying the first test copy of 0.1.21: the ⌘K tip said "Type urgent and press ↵ to
// make this thread urgent", and nothing then said what urgent does. The confetti
// played, and then "This agent needs your answer. Press ↵ to open it" came up on
// another row. That person had already opened a thread and answered it: they had got
// there through the working tip and the answer arrived on the open thread, so the
// open lesson was never ticked. Read from the founder's screenshots and tour.ts.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { closeLessons, finishLesson, madeUrgent, noteSent, startTour, tourLive, tourOver, tourStep } from '../renderer/src/tour';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const at = (over) => ({ composer: 'none', folder: false, text: false, ideas: false, view: 'inbox', rows: 2, running: 0, waiting: 2, thread: false, preparing: false, typing: false, busy: false, menu: false, options: false, covered: false, palette: false, ...over });
// The founder's path: N, sent, watched it work, chose an option on the open thread, closed it.
const watchedAndClosed = () => noteSent(['start', 'working', 'busy', 'choose', ...closeLessons('choose')].reduce(finishLesson, startTour()));

describe('closing a thread', () => {
  it('counts as having opened one, however you got into it', () => {
    expect(closeLessons('choose')).toContain('open');
    expect(closeLessons('palette')).toEqual(['open', 'close']);
  });
  it('so the needs-your-answer tip is not asked for afterwards', () => {
    expect(tourStep(watchedAndClosed(), at())).toBe('palette');
  });
});

describe('making a thread urgent from ⌘K', () => {
  const urgent = madeUrgent(finishLesson(watchedAndClosed(), 'palette'));
  it('says what urgent does next, on the list or on a thread', () => {
    expect(tourStep(urgent, at())).toBe('urgent');
    expect(tourStep(urgent, at({ thread: true, options: true }))).toBe('urgent');
  });
  it('in the same card as every other tip', () => {
    const tour = read('renderer/src/components/Tour.tsx');
    expect(tour).toContain("urgent: { words: <>Urgent threads move up your list, and their agents start first</>, side: 'below-right' },");
  });
  it('lit at the word Urgent on the list, and under the header on a thread', () => {
    const tour = read('renderer/src/components/Tour.tsx');
    expect(tour).toContain("const urgentCell = () => document.querySelector<HTMLElement>('.list-pane .row.selected .th-cell-prio.urgent');");
    expect(tour).toContain("case 'urgent': if (urgentCell()) return one(urgentCell());");
  });
  it('and is not over until that tip has gone', () => {
    expect(tourOver(urgent)).toBe(false);
    expect(tourOver(finishLesson(urgent, 'urgent'))).toBe(true);
  });
  it('is told by the Urgent command and no other level', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('if (c.value === URGENT_PRIORITY && tourLive(tourRef.current)) setTour(madeUrgent(finishLesson(tourRef.current!, \'palette\')));');
  });
  it('the tip goes on the next key or click, or by itself', () => {
    const tour = read('renderer/src/components/Tour.tsx');
    expect(tour).toContain('const URGENT_MS = 6000;');
  });
});

describe('closing ⌘K without making anything urgent', () => {
  const closedBar = finishLesson(watchedAndClosed(), 'palette');
  it('ends the tutorial straight away, with nothing to explain', () => {
    expect(tourOver(closedBar)).toBe(true);
  });
});

describe('after the confetti', () => {
  const over = finishLesson(watchedAndClosed(), 'palette');
  it('no tip comes back, even with threads that still need you', () => {
    expect(tourStep(over, at())).toBe(null);
    expect(tourStep(over, at({ thread: true }))).toBe(null);
    expect(tourStep(over, at({ thread: true, options: true }))).toBe(null);
    expect(tourStep(over, at({ palette: true }))).toBe(null);
  });
  it('and the tutorial is no longer live, so ⌘K stops offering to end it', () => {
    expect(tourLive(over)).toBe(false);
  });
  it('the confetti waits for the same end', () => {
    expect(read('renderer/src/components/Tour.tsx')).toContain('const ended = (t: TourState | null) => tourOver(t);');
  });
});

describe('before the end', () => {
  it('a closed thread with ⌘K still to come is not over', () => {
    expect(tourOver(watchedAndClosed())).toBe(false);
    expect(tourLive(watchedAndClosed())).toBe(true);
  });
  it('a skipped tutorial is not an ending, so it gets no confetti', () => {
    expect(tourOver({ ...finishLesson(watchedAndClosed(), 'palette'), skipped: true })).toBe(false);
  });
});
