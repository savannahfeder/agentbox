// THE TUTORIAL WALKS YOU THROUGH YOUR FIRST REAL THREAD (w-31c71743b5, 2026-10-28).
//
// What broke: the first run that starts on real work (2026-10-26) ended with
// one row and an "Open task" hint, and the founder's words were that people
// finish it thinking "wtf do I do now?". The old practice walk kept people in
// it (72% of 115 installs replied during setup) but only 17 replied three times
// to real agents on day one. So the tutorial now runs on the person's own
// inbox: a gold glow on one thing and a card saying the key to press, to make,
// aim and send a first thread, then four tips that each show once, the first
// time they apply.
//
// The founder's rules for it, after seeing it drawn:
//  - "what if they don't want to? Can they just click away?" Clicking away,
//    closing the New thread box or Skip ends all of it, the later tips too, so
//    nothing pops up after someone said no. "It's not good if, for the rest of
//    the time, there's always a glowing button." A later tip goes on any click.
//  - "after you've gone through one flow, making a new thread probably
//    shouldn't show those suggestions." The suggestions show only while the
//    guided part is on and nothing has been sent.
import { describe, it, expect } from 'vitest';
import {
  startTour, skipTour, noteSent, finishLesson, tourStep, showIdeas, readTour, saveTour, TOUR_KEY,
} from '../renderer/src/tour.ts';

const inbox = { composer: 'none', folder: true, text: false, view: 'inbox', rows: 3, running: 0, thread: false, options: false, covered: false };
const at = (over) => ({ ...inbox, ...over });

describe('the guided part, for someone who brought chats in', () => {
  const s = startTour();
  it('starts on the New thread button', () => {
    expect(tourStep(s, inbox)).toBe('start');
  });
  it('goes to the suggestions once the box is open and empty', () => {
    expect(tourStep(s, at({ composer: 'card' }))).toBe('pick');
  });
  it('goes to Send once there are words', () => {
    expect(tourStep(s, at({ composer: 'card', text: true }))).toBe('send');
  });
});

describe('the guided part, for someone with no chats', () => {
  const s = startTour();
  const empty = at({ rows: 0, composer: 'inline' });
  it('never asks for the New thread button, because the box is already on the page', () => {
    expect(tourStep(s, empty)).not.toBe('start');
  });
  it('asks for a folder first when the project has none', () => {
    expect(tourStep(s, { ...empty, folder: false })).toBe('folder');
  });
  it('asks for a folder before words, even with words typed', () => {
    expect(tourStep(s, { ...empty, folder: false, text: true })).toBe('folder');
  });
  it('goes to the suggestions once the project has a folder', () => {
    expect(tourStep(s, empty)).toBe('pick');
  });
});

describe('getting out of it', () => {
  it('ends everything, so nothing keeps glowing and nothing else pops up', () => {
    const out = skipTour(startTour());
    expect(tourStep(out, inbox)).toBe(null);
    expect(tourStep(out, at({ composer: 'card' }))).toBe(null);
    expect(tourStep(out, at({ thread: true, options: true }))).toBe(null);
  });
  it('a later tip clicked away is not shown again, and the next one still is', () => {
    const s = finishLesson(noteSent(startTour()), 'open');
    expect(tourStep(s, inbox)).toBe(null);
    expect(tourStep(s, at({ thread: true, options: true }))).toBe('choose');
  });
  it('shows nothing to someone who never had the tutorial', () => {
    expect(tourStep(null, inbox)).toBe(null);
    expect(tourStep(null, at({ thread: true, options: true }))).toBe(null);
  });
  it('shows nothing while something else covers the window', () => {
    expect(tourStep(startTour(), at({ covered: true }))).toBe(null);
  });
});

describe('the suggestions', () => {
  it('show while the guided part is on and nothing has been sent', () => {
    expect(showIdeas(startTour())).toBe(true);
  });
  it('are gone after the first send', () => {
    expect(showIdeas(noteSent(startTour()))).toBe(false);
  });
  it('are gone after clicking away or skipping', () => {
    expect(showIdeas(skipTour(startTour()))).toBe(false);
  });
  it('never show for someone who never had the tutorial', () => {
    expect(showIdeas(null)).toBe(false);
  });
});

describe('after the first send', () => {
  const sent = noteSent(startTour());
  it('says the agent is working, on In progress', () => {
    expect(tourStep(sent, at({ view: 'progress', running: 1 }))).toBe('working');
  });
  it('does not say it on a list with nothing running', () => {
    expect(tourStep(sent, at({ view: 'progress', running: 0, rows: 0 }))).toBe(null);
  });
  it('says it once', () => {
    expect(tourStep(finishLesson(sent, 'working'), at({ view: 'progress', running: 1 }))).toBe(null);
  });
  it('then points at a thread that needs you, once', () => {
    const s = finishLesson(sent, 'working');
    expect(tourStep(s, inbox)).toBe('open');
    expect(tourStep(finishLesson(s, 'open'), inbox)).toBe(null);
  });
  it('then at the options, in a thread that has them', () => {
    const s = finishLesson(finishLesson(sent, 'working'), 'open');
    expect(tourStep(s, at({ thread: true, options: true }))).toBe('choose');
    expect(tourStep(s, at({ thread: true, options: false }))).toBe(null);
  });
  it('then at Done, on the next thread opened after the options tip', () => {
    const s = finishLesson(finishLesson(finishLesson(sent, 'working'), 'open'), 'choose');
    expect(tourStep(s, at({ thread: true }))).toBe('close');
    expect(tourStep(finishLesson(s, 'close'), at({ thread: true }))).toBe(null);
  });
  it('never puts the guided steps back', () => {
    expect(tourStep(sent, at({ composer: 'card' }))).toBe(null);
  });
});

describe('where it is kept', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
  it('reads back what was saved', () => {
    const st = store();
    saveTour(st, finishLesson(noteSent(startTour()), 'working'));
    expect(readTour(st)).toEqual({ guided: false, sent: true, skipped: false, done: ['working'] });
  });
  it('reads nothing as no tutorial', () => {
    expect(readTour(store())).toBe(null);
  });
  it('reads a broken value as no tutorial', () => {
    const st = store();
    st.setItem(TOUR_KEY, '{nope');
    expect(readTour(st)).toBe(null);
  });
});

describe('the first thread after bringing chats in', () => {
  // Walked in the built app on 2026-10-29: the box opened on My Workspace, which
  // has no folder, so it asked for one although the chats had just made a project.
  it('goes to the project the newest chat ran in', async () => {
    const fs = await import('node:fs');
    const first = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');
    const bring = first.slice(first.indexOf('const bringIn = useCallback('), first.indexOf('// THE KEYBOARD'));
    expect(bring).toMatch(/if \(n === 1\) try \{ localStorage\.setItem\(LAST_PRODUCT_KEY, p\.slug\)/);
  });
});

describe('the first send', () => {
  // Walked on 2026-10-29: a picked suggestion that repeats sent as a repeating
  // task, the tab stayed on Needs you, and the "working" tip never had a row.
  it('moves to In progress even when it is a repeating suggestion', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("const first = !!tour && showIdeas(tour);");
    expect(app).toContain("(how.kind === 'task' || (first && how.kind === 'repeat'))");
  });
});

describe('the empty inbox during the tutorial', () => {
  // Walked on 2026-10-29: with no chats the folder card sat over the suggestions,
  // and the page still said "Nothing needs you" over a first task.
  it('says what to do instead of "Nothing needs you"', async () => {
    const fs = await import('node:fs');
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(pages).toContain("{first ? 'Give an agent its first task' : 'Nothing needs you'}");
    expect(app).toContain('<InboxClear slot={setClearSlot} first={showIdeas(tour)} />');
  });
  it('offers the suggestions only once the project has a folder', async () => {
    const fs = await import('node:fs');
    const box = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(box).toContain('const ideaRows = ideas?.length && product?.repoPath && !person && !mate ? (');
  });
});
