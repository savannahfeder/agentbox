// After setup brought in four chats the founder landed on a list of rows reading
// "Waiting" with no tip, and opening one showed one faint line on an empty page:
// "It just feels like a bug." Measured in that test copy on 2026-10-30: the tip
// was held back while ANY chat was being written up, and two of the four were
// still unwritten more than five minutes after the window opened, so a ready
// thread never got its tip. A write-up that failed waited ten minutes to retry.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { cursorOwed, startTour, stillPreparing, tourStep, finishLesson, lessonOf } from '../renderer/src/tour';
import { statusCell } from '../renderer/src/status-word';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const at = (over) => ({ composer: 'none', folder: false, text: false, ideas: false, view: 'inbox', rows: 0, running: 0, waiting: 0, thread: false, preparing: false, typing: false, busy: false, menu: false, options: false, covered: false, ...over });

describe('what counts as still preparing', () => {
  it('on the list, only while no chat is ready', () => {
    expect(stillPreparing({ thread: false, onPage: false, ready: 0, writing: 3 })).toBe(true);
    expect(stillPreparing({ thread: false, onPage: false, ready: 1, writing: 3 })).toBe(false);
    expect(stillPreparing({ thread: false, onPage: false, ready: 0, writing: 0 })).toBe(false);
  });
  it('on a thread, only when that thread is the one being written up', () => {
    expect(stillPreparing({ thread: true, onPage: true, ready: 3, writing: 1 })).toBe(true);
    expect(stillPreparing({ thread: true, onPage: false, ready: 0, writing: 3 })).toBe(false);
  });
});

describe('the tip', () => {
  it('says what is happening when nothing is ready yet', () => {
    expect(tourStep(startTour(), at({ preparing: true }))).toBe('gettingReady');
  });
  it('points at the first ready thread as soon as there is one', () => {
    expect(tourStep(startTour(), at({ rows: 1 }))).toBe('open');
  });
  it('says nothing over a thread still being written up, whose page says so', () => {
    expect(tourStep(startTour(), at({ thread: true, preparing: true }))).toBe(null);
  });
  it('does not come back once opening a thread has been learned', () => {
    expect(tourStep(finishLesson(startTour(), 'open'), at({ preparing: true }))).toBe(null);
  });
  it('is not a lesson of its own, so pressing nothing finishes nothing', () => {
    const tour = read('renderer/src/components/Tour.tsx');
    expect(tour).toContain("step === 'busy' || step === 'palette' || step === 'gettingReady' || step === 'inPalette'");
    expect(lessonOf('gettingReady')).toBe('open');
  });
  it('offers something to do while waiting', () => {
    expect(read('renderer/src/components/Tour.tsx')).toContain('Getting your chats ready. You can wait here or press <K k="N" /> to start something new');
  });
});

describe('the cursor when the first thread is ready', () => {
  // Seen in the walk: the glow lit the ready row while the cursor stayed on the one
  // still being written up, so the ↵ the tip asked for opened the wrong thread.
  it('moves to the row the tip lights', () => {
    expect(cursorOwed('open', { writing: true, byHand: false })).toBe(true);
  });
  it('stays on a row that is ready', () => {
    expect(cursorOwed('open', { writing: false, byHand: false })).toBe(false);
  });
  it('never fights someone walking the list', () => {
    expect(cursorOwed('open', { writing: true, byHand: true })).toBe(false);
  });
  it('is left alone by every other tip', () => {
    expect(cursorOwed('gettingReady', { writing: true, byHand: false })).toBe(false);
  });
  it('is moved by the app', () => {
    expect(read('renderer/src/App.tsx')).toContain('onPoint={(id) => { const at = list.findIndex((i) => i.id === id); if (at >= 0) setSelected(at); }}');
  });
});

describe('where the tip sits', () => {
  it('goes under the last row being written up, in line with the titles', () => {
    const tour = read('renderer/src/components/Tour.tsx');
    expect(tour).toContain("case 'gettingReady': return one([...document.querySelectorAll('.list-pane .row[data-catching-up]')].at(-1));");
    expect(tour).toContain("if (step === 'gettingReady') left = document.querySelector('.list-pane .row[data-catching-up] .subject')?.getBoundingClientRect().left ?? left;");
  });
});

describe('the row', () => {
  const item = (labels) => ({ id: 'w-1', status: 'open', labels, result: 'An answer', updatedAt: 1 });
  it('says it is getting ready, not that it is waiting on you', () => {
    expect(statusCell(item(['thread-import', 'catch-up'])).word).toBe('Getting ready');
  });
  it('goes back to the ordinary word once written up', () => {
    expect(statusCell(item(['thread-import'])).word).not.toBe('Getting ready');
  });
});

describe('the page', () => {
  it('shows where the chat left off under the status, never an empty page', () => {
    const page = read('renderer/src/components/ItemThread.tsx');
    const at = page.indexOf('if (queue && catchUpDue(item)) {');
    const block = page.slice(at, page.indexOf('if (queue && working && !newest', at));
    expect(block).toContain('Getting this chat ready. Its summary and options will appear here.');
    expect(block).toContain('<QueueAnswer');
  });
});

describe('a write-up that fails', () => {
  it('tries again within a minute, not ten', () => {
    const sup = read('main/supervisor.mts');
    expect(sup).toContain('const CATCH_UP_RETRY_MS = 60_000;');
    expect(sup).toContain("now - (this._catchUpMisses.get(key(i))?.at ?? -Infinity) < CATCH_UP_RETRY_MS");
  });
});
