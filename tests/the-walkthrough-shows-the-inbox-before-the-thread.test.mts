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
import { finishLesson, fitsBesideTabs, noteSent, startTour, tourStep, withPractice, type TourScreen } from '../renderer/src/tour.ts';
import { walkPlace } from '../renderer/src/setup-split.ts';

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

// Walked again with four chats brought in: after E closed the practice thread the bar read
// 5 of 5 over an inbox with no tip for 20 seconds and more, because the chats were still
// being written up and that held every tip on the list.
describe('the last tip, with chats still being written up', () => {
  const closed = ['working', 'open', 'reply', 'close'].reduce((t, l) => finishLesson(t, l as 'close'), sent);
  const writing = { practice: false, rows: 0, waiting: 4, preparing: true };
  it('shows on Needs you and on In progress once the practice thread is closed', () => {
    expect(tourStep(closed, screen({ ...writing, view: 'inbox' }))).toBe('palette');
    expect(tourStep(closed, screen({ ...writing, view: 'progress' }))).toBe('palette');
  });
  it('does not show before the close, on another page, or under the New thread box', () => {
    expect(tourStep(finishLesson(finishLesson(sent, 'open'), 'reply'), screen({ ...writing, view: 'inbox' }))).toBeNull();
    expect(tourStep(closed, screen({ ...writing, view: 'files' }))).toBeNull();
    expect(tourStep(closed, screen({ ...writing, view: 'inbox', composer: 'card' }))).toBeNull();
  });
  it('is said once: with ⌘K learned the list is quiet again', () => {
    expect(tourStep(finishLesson(closed, 'palette'), screen({ ...writing, view: 'inbox' }))).toBeNull();
  });
});

// That tip sat centred under the tabs, which is the line the column names are on: with a
// Status column it covered the word (the picture read "TUS").
describe('where the last tip sits on a list', () => {
  it('is level with the tabs when they end before it begins', () => {
    expect(fitsBesideTabs(390, 557, 8)).toBe(true);
    expect(fitsBesideTabs(549, 557, 8)).toBe(true);
  });
  it('stays under them when they would touch it, or there are none', () => {
    expect(fitsBesideTabs(550, 557, 8)).toBe(false);
    expect(fitsBesideTabs(700, 557, 8)).toBe(false);
    expect(fitsBesideTabs(null, 557, 8)).toBe(false);
  });
  it('is how the card is placed', () => {
    expect(read('renderer/src/components/Tour.tsx')).toMatch(/top = tabsEnd !== null && !fitsBesideTabs\(tabsEnd, left, GAP\) \? box\.y \+ box\.h \+ 3 \* GAP : box\.y \+ \(box\.h - h\) \/ 2;/);
  });
});

describe('what stays as it was', () => {
  it('in the open practice thread the tips are the thread\'s', () => {
    const opened = finishLesson(sent, 'open');
    expect(tourStep(opened, screen({ thread: true, practiceThread: true, practice: false }))).toBe('reply');
  });
  it('a tour with no practice thread still points at the first row that needs you', () => {
    expect(tourStep(noteSent(startTour()), screen({ view: 'inbox', rows: 2 }))).toBe('open');
  });
});

describe('the practice thread, opened', () => {
  // 2026-11-13: it opened with every earlier message showing, and that read as the wrong screen for a
  // finished thread ("it just shows the response + summary and the numbered options, that's all").
  it('opens folded, like every finished thread', () => {
    const thread = read('renderer/src/components/ItemThread.tsx');
    expect(thread).toContain('setEarlierOpen(kept ? !!kept.earlier : false);');
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
