// THE WALKTHROUGH SHOWS THE INBOX BEFORE THE THREAD (2026-11-12).
//
// The founder walked the first run: "All it did was make a new task. It was on
// the home page and didn't even explain the inbox itself." Walked on a
// throwaway copy: sending the practice thread opened it that instant, so the
// bar above read 1 of 5 and then 3 of 5, the inbox was never on screen, and
// the sidebar stayed open where the app folds it ("that's not how the app
// works"). Now the practice thread goes where every thread goes: In progress
// while its agent works, then Needs you, and you open it from the list. The
// tips are about that one row, never a real thread beside it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { finishLesson, noteSent, startTour, tourStep, withPractice, type TourScreen } from '../renderer/src/tour.ts';
import { walkPlace } from '../renderer/src/setup-split.ts';
import { opensWhole } from '../renderer/src/thread-place.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const screen = (over: Partial<TourScreen> = {}): TourScreen => ({ composer: 'none', folder: true, text: false, view: 'inbox', rows: 4, running: 0, waiting: 4, thread: false, options: false, covered: false, ...over });
const sent = noteSent(withPractice(startTour(), { slug: 'practice', item: 'w-1' }));

describe('after the practice thread is sent', () => {
  it('In progress: the tip is on the practice row while its agent works', () => {
    expect(tourStep(sent, screen({ view: 'progress', practice: true, rows: 1 }))).toBe('working');
  });
  it('In progress, once it has left for Needs you: the tip points at that tab', () => {
    expect(tourStep(sent, screen({ view: 'progress', practice: false, rows: 0, waiting: 5 }))).toBe('answered');
  });
  it('Needs you: the tip is on the practice row, to open it', () => {
    expect(tourStep(sent, screen({ view: 'inbox', practice: true, rows: 5, waiting: 5 }))).toBe('open');
  });
  it('never lands on a real thread: with only chats brought in on screen there is no tip', () => {
    expect(tourStep(sent, screen({ view: 'inbox', practice: false, rows: 4, waiting: 4 }))).toBeNull();
    expect(tourStep(sent, screen({ view: 'inbox', practice: false, rows: 4, waiting: 4, preparing: true }))).toBeNull();
  });
  it('counts as step two of five the whole way', () => {
    for (const now of ['working', 'open'] as const) expect(walkPlace(sent.done, now)).toEqual({ at: 2, of: 5 });
  });
});

describe('what stays as it was', () => {
  it('in the open practice thread the tips are the thread\'s', () => {
    const opened = finishLesson(sent, 'open');
    expect(tourStep(opened, screen({ thread: true, practice: false }))).toBe('reply');
  });
  it('a tour with no practice thread still points at the first row that needs you', () => {
    expect(tourStep(noteSent(startTour()), screen({ view: 'inbox', rows: 2 }))).toBe('open');
  });
});

describe('the practice thread, opened', () => {
  it('shows all of itself: your ask, what the agent did, its answer', () => {
    expect(opensWhole(['founder', 'first-run'])).toBe(true);
    expect(opensWhole(['founder'])).toBe(false);
    expect(opensWhole(null)).toBe(false);
    const thread = read('renderer/src/components/ItemThread.tsx');
    expect(thread).toContain('const practice = opensWhole(item.labels);');
    expect(thread).toContain('setEarlierOpen(kept ? !!kept.earlier : practice);');
  });
});

describe('the window', () => {
  const app = read('renderer/src/App.tsx');
  const tour = read('renderer/src/components/Tour.tsx');
  it('sends the practice thread to In progress and leaves it for you to open', () => {
    const at = app.indexOf("// The walkthrough's practice thread: no toast and no undo.");
    const sendIt = app.slice(at, at + 700);
    expect(sendIt).toContain("setHomeOpen(false); setFocused(null); setView('progress'); setSelected(0);");
    expect(sendIt).not.toMatch(/setFocused\(row\)/);
  });
  it('gives its agent long enough to be seen working', () => {
    expect(app).toContain('}, p.replies ? ANSWER_AFTER_MS : PRACTICE_RUN_MS);');
    expect(read('renderer/src/tour.ts')).toContain('export const PRACTICE_RUN_MS = 6_000;');
  });
  it('tells the tips which row is the practice thread, and they light only that one', () => {
    expect(app).toMatch(/<Tour tour=\{tour\} practice=\{!!tourTask\} practiceId=\{tourPractice\?\.item \?\? null\}/);
    expect(tour).toContain('const practiceRow = (id: string) => document.querySelector<HTMLElement>(`.list-pane .row[data-item-id="${id}"]:not([data-catching-up])`);');
    expect(tour).toContain("case 'working': return one(practiceId ? practiceRow(practiceId) : firstRow(true));");
    expect(tour).toContain("case 'open': return one(practiceId ? practiceRow(practiceId) : firstRow(false));");
  });
  it('puts the list\'s cursor on it, so the key the tip names opens it', () => {
    expect(tour).toContain("if (practiceId && (next === 'open' || next === 'working') && !walked.current) point.current(practiceId);");
  });
  it('says what the inbox is, in the tip on the row', () => {
    expect(tour).toContain('Your agent is working. It moves to Needs you when it has something for you');
    expect(tour).toContain('Agents land here when they need you. Press <K k="↵" /> to open this one');
  });
  it('folds the sidebar as the app does', () => {
    expect(app).toContain('sidebarFolded({ phone: onPhone(), shrinks: sidebarShrinks, pointedAt: railOpen })');
  });
});
