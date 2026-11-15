// THE WALKTHROUGH NAMES HOME FIRST AND FILES LAST (w-1e52420829, 2026-11-15).
//
// Someone walked the new first run several times and said each time that it
// showed one thread and nothing of the app around it: "Our app starts on the
// home page, so you just randomly jump into the inbox without giving any
// context", "You don't explain files". Walked on a throwaway copy: five steps,
// every one about the practice thread, and no tip ever said what Home or Files
// is. Asked what it should cover, they said "because not everybody will have a
// team, it's good just to show the homepage as well as the files page", and of
// the five ways drawn, the one with a tip on Home before the practice thread
// and Files named afterwards, with no particular file pointed at.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { filesDue, finishLesson, madeUrgent, noteSent, readTour, saveTour, skipTour, startTour, tourFinishing, tourLive, tourOver, tourStep, type Lesson, type Tour, type TourScreen } from '../renderer/src/tour.ts';
import { walkPlace } from '../renderer/src/setup-split.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const screen = (over: Partial<TourScreen> = {}): TourScreen => ({ composer: 'none', folder: true, text: false, view: 'inbox', rows: 4, running: 0, waiting: 4, thread: false, options: false, covered: false, ...over });
const home = (over: Partial<TourScreen> = {}) => screen({ composer: 'inline', home: true, text: true, ...over });
const lessons = (t: Tour, ...ls: Lesson[]) => ls.reduce(finishLesson, t);
const fresh = startTour({ pages: true });
const threadDone = lessons(noteSent(fresh), 'working', 'open', 'choose', 'close', 'palette');

describe('the first tip', () => {
  it('is on Home, before anything is asked for', () => {
    expect(tourStep(fresh, home())).toBe('home');
    expect(tourStep(fresh, home({ text: false, ideas: true }))).toBe('home');
  });
  it('gives way to the practice thread once it is read', () => {
    expect(tourStep(finishLesson(fresh, 'home'), home())).toBe('send');
  });
  it('is learned by sending too, so nobody is sent back to it', () => {
    expect(noteSent(fresh).done).toContain('home');
    expect(tourStep(noteSent(fresh), home())).not.toBe('home');
  });
  it('waits for Home to be on screen, and for nothing to be over it', () => {
    expect(tourStep(fresh, screen({ view: 'inbox' }))).not.toBe('home');
    expect(tourStep(fresh, home({ covered: true }))).toBe(null);
    expect(tourStep(fresh, home({ menu: true }))).not.toBe('home');
  });
});

describe('the last tip', () => {
  it('is owed once the practice thread is closed and the command bar is known', () => {
    expect(filesDue(threadDone)).toBe(true);
    expect(filesDue(lessons(noteSent(fresh), 'working', 'open', 'choose', 'close'))).toBe(false);
  });
  it('waits for the urgent tip when a thread was made urgent on the way', () => {
    const urgent = madeUrgent(threadDone);
    expect(filesDue(urgent)).toBe(false);
    expect(tourStep(urgent, screen())).toBe('urgent');
    expect(filesDue(finishLesson(urgent, 'urgent'))).toBe(true);
  });
  it('shows on the Files page and nowhere else', () => {
    expect(tourStep(threadDone, screen({ view: 'inbox', files: true }))).toBe('files');
    expect(tourStep(threadDone, screen({ view: 'inbox' }))).toBe(null);
    expect(tourStep(threadDone, home())).toBe(null);
  });
  it('keeps the walkthrough going until it is read, and ends it when it is', () => {
    expect(tourOver(threadDone)).toBe(false);
    expect(tourLive(threadDone)).toBe(true);
    const read2 = finishLesson(threadDone, 'files');
    expect(tourOver(read2)).toBe(true);
    expect(tourFinishing(read2)).toBe(true);
  });
  it('is not owed by a walkthrough that was skipped', () => {
    expect(filesDue(skipTour(threadDone))).toBe(false);
  });
});

// Everyone part-way through or finished when this was built has no `pages` saved.
describe('a walkthrough begun before this', () => {
  const old = lessons(noteSent(startTour()), 'working', 'open', 'choose', 'close', 'palette');
  it('is over where it always was, and owes neither tip', () => {
    expect(tourOver(old)).toBe(true);
    expect(filesDue(old)).toBe(false);
    expect(tourStep(startTour(), home())).not.toBe('home');
    expect(noteSent(startTour()).done).not.toContain('home');
  });
  it('still counts five steps', () => {
    expect(walkPlace([], null)).toEqual({ at: 1, of: 5 });
  });
});

describe('the count in the bar', () => {
  it('is seven steps, Home the first and Files the last', () => {
    expect(walkPlace([], 'home', true)).toEqual({ at: 1, of: 7 });
    expect(walkPlace(['home'], 'compose', true)).toEqual({ at: 2, of: 7 });
    expect(walkPlace(threadDone.done, 'files', true)).toEqual({ at: 7, of: 7 });
  });
  // Walked: the urgent tip read "7 of 7" and so did the Files tip after it.
  it('keeps the urgent tip on the command bar’s step, with Files still to come', () => {
    expect(walkPlace(threadDone.done, 'urgent', true)).toEqual({ at: 6, of: 7 });
    expect(walkPlace(['compose', 'open', 'choose', 'close', 'palette'], 'urgent')).toEqual({ at: 5, of: 5 });
  });
  it('moves past Home for someone who sent the practice thread without pressing Next', () => {
    expect(walkPlace(noteSent(fresh).done, 'working', true)).toEqual({ at: 3, of: 7 });
  });
});

describe('what is kept', () => {
  it('survives a restart', () => {
    const kept = new Map<string, string>();
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); } };
    saveTour(store, threadDone);
    expect(filesDue(readTour(store))).toBe(true);
    saveTour(store, startTour());
    expect(readTour(store)?.pages).toBeUndefined();
  });
});

describe('the window', () => {
  const app = read('renderer/src/App.tsx');
  const tour = read('renderer/src/components/Tour.tsx');
  const frame = read('renderer/src/components/TourFrame.tsx');
  it('starts a new walkthrough with both tips where there is a Home to show', () => {
    expect(app).toContain('setTour(startTour({ pages: homeOn }));');
  });
  it('says what each place is, in the approved words, with no file pointed at', () => {
    expect(tour).toContain('This is Home. Start a thread here and see what needs you');
    expect(tour).toContain('This is Files. Everything your agents make is kept here');
    expect(tour).toContain("case 'home': return one(document.querySelector('.hm-start .tc-card'));");
    expect(tour).toContain("case 'files': return one(document.querySelector('.workspace-tab[data-tab=\"files\"]'));");
  });
  it('moves on with Next or ↵, which the box under the tip must not take as a new line', () => {
    expect(tour).toContain("if ((step === 'home' || step === 'files') && e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); learnSoon(lessonOf(step)); return; }");
    expect(tour).toMatch(/\{\(step === 'home' \|\| step === 'files'\) && <button type="button" className="tour-act tour-next" onClick=\{\(\) => learnSoon\(lessonOf\(step\)\)\}>Next <K k="↵" \/><\/button>\}/);
  });
  it('takes you to Files for the last tip, and counts leaving the page as having read it', () => {
    expect(app).toContain('if (!filesStopSeen.current) { if (filesShown) filesStopSeen.current = true; else { setModal(null); openFiles(null); } return; }');
    expect(app).toContain("if (!filesShown) setTour(finishLesson(tourRef.current!, 'files'));");
  });
  it('counts seven in the bar for a walkthrough that has both', () => {
    expect(frame).toContain('const { at, of } = walkPlace(done, now, pages);');
    expect(app).toMatch(/<TourFrame done=\{tour!\.done\} now=\{tourNow\} pages=\{!!tour!\.pages\} finished=\{finishing\}/);
  });
});
