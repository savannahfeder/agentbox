// The founder pressed E on a thread, the next thread opened, and the tip still said
// "When it is finished, press E to close it": the tutorial decided whether E had
// closed anything by comparing titles 900 ms later, and a close that took longer
// than that to move on was never counted. Opening ⌘K then said nothing about what
// to do in it, and the Later tab stood empty on a first day with nothing in it.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { finishLesson, startTour, tourStep, noteSent } from '../renderer/src/tour';
import { laterTabShown } from '../renderer/src/later-tab';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const at = (over) => ({ composer: 'none', folder: false, text: false, ideas: false, view: 'inbox', rows: 1, running: 0, waiting: 1, thread: false, preparing: false, typing: false, busy: false, menu: false, options: false, covered: false, palette: false, ...over });
const after = (...ls) => noteSent(ls.reduce(finishLesson, startTour()));

describe('closing a thread', () => {
  it('is told to the tutorial by the close itself, however long the next thread takes', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("if (!stay) window.dispatchEvent(new CustomEvent(THREAD_CLOSED));");
    const tour = read('renderer/src/components/Tour.tsx');
    expect(tour).toContain('window.addEventListener(THREAD_CLOSED, closed);');
    expect(tour).not.toContain('}, 900);');
  });
  it('is not told when the close was refused, so a held E teaches nothing', () => {
    const app = read('renderer/src/App.tsx');
    const at = app.indexOf('const markDone = useCallback(');
    const body = app.slice(at, app.indexOf('const resolve = useCallback(', at));
    expect(body.indexOf('THREAD_CLOSED')).toBeGreaterThan(body.indexOf('if (closesAgain(pendingRef.current, item)) return;'));
  });
});

describe('the command bar', () => {
  it('says what to do once it is open', () => {
    expect(tourStep(after('open', 'reply', 'close'), at({ palette: true }))).toBe('inPalette');
  });
  it('says it whenever it is opened before the tutorial has taught it', () => {
    expect(tourStep(startTour(), at({ palette: true }))).toBe('inPalette');
  });
  it('says nothing once it has been used', () => {
    expect(tourStep(after('open', 'reply', 'close', 'palette'), at({ palette: true }))).toBe(null);
  });
  it('is learned when it closes, not when it opens', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).not.toContain("if (modal === 'palette' && tour && !tour.done.includes('palette')) setTour(finishLesson(tour, 'palette'));");
    expect(app).toContain("if (paletteWasOpen.current && modal !== 'palette' && tour && !tour.done.includes('palette')) setTour(finishLesson(tour, 'palette'));");
  });
  it('offers making the thread urgent when there is one, and esc either way', () => {
    const tour = read('renderer/src/components/Tour.tsx');
    expect(tour).toContain('Type <K k="urgent" /> and press <K k="↵" /> to make {here} urgent, or <K k="esc" /> to close');
    expect(tour).toContain('Type what you want to do and press <K k="↵" />, or <K k="esc" /> to close');
  });
});

describe('the Later tab', () => {
  it('is hidden while nothing is in Later', () => {
    expect(laterTabShown({ count: 0, view: 'inbox', walking: false })).toBe(false);
  });
  it('shows once one thread is in it', () => {
    expect(laterTabShown({ count: 1, view: 'inbox', walking: false })).toBe(true);
  });
  it('stays while you are on it, so it never vanishes under you', () => {
    expect(laterTabShown({ count: 0, view: 'snoozed', walking: false })).toBe(true);
  });
  it('stays for the walk, which teaches it', () => {
    expect(laterTabShown({ count: 0, view: 'inbox', walking: true })).toBe(true);
  });
  it('is left out of the strip and of what Tab walks along', () => {
    expect(read('renderer/src/threads/Pages.tsx')).toContain("(t) => t.view !== 'snoozed' || laterTabShown({ count: counts.snoozed ?? 0, view, walking: keepLater })");
    expect(read('renderer/src/App.tsx')).toContain("INBOX_TABS.map((t) => t.view).filter((v) => v !== 'snoozed' || laterTabShown({ count: snoozed.length, view, walking: !!run }))");
  });
});
