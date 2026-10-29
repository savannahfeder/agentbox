// THE TUTORIAL WALKS YOU THROUGH YOUR FIRST REAL THREAD (w-31c71743b5, 2026-10-28).
//
// What broke: the first run that starts on real work (2026-10-26) ended with
// one row and an "Open task" hint, and the founder's words were that people
// finish it thinking "wtf do I do now?". The old practice walk kept people in
// it (72% of 115 installs replied during setup) but only 17 replied three times
// to real agents on day one. So the tutorial runs on the person's own inbox: a
// gold glow on one thing and a card saying the key to press.
//
// The founder's rules for it, after seeing it drawn:
//  - "what if they don't want to? Can they just click away?" and "It's not good
//    if, for the rest of the time, there's always a glowing button." Each tip
//    shows until it is done or clicked away from, then never again; Skip
//    tutorial and Escape end all of it.
//  - "after you've gone through one flow, making a new thread probably
//    shouldn't show those suggestions." They show only before the first send.
//
// Round two, 2026-10-29, after the founder tried it: "the moment I imported it,
// all I saw was a weird flash of orange light", then no tutorial at all.
// Measured in a fresh window driven over its DevTools port: the tour started,
// and one click on the imported chat's row set it to skipped for good, because
// any click away ended everything. A click now puts one tip away. And "when
// people import agents, that is how they evaluate our app", so a chat brought
// in is pointed at before the New thread button.
import { describe, it, expect } from 'vitest';
import {
  startTour, skipTour, noteSent, finishLesson, lessonOf, tourStep, showIdeas, readTour, saveTour, TOUR_KEY,
} from '../renderer/src/tour.ts';

const inbox = { composer: 'none', folder: true, text: false, view: 'inbox', rows: 3, running: 0, thread: false, options: false, covered: false };
const at = (over) => ({ ...inbox, ...over });
const after = (...ls) => ls.reduce((t, l) => finishLesson(t, l), startTour());

describe('someone who brought chats in', () => {
  it('is pointed at a chat first, because that is how the app is judged', () => {
    expect(tourStep(startTour(), inbox)).toBe('open');
  });
  it('inside it, at the options when there are some', () => {
    expect(tourStep(startTour(), at({ thread: true, options: true }))).toBe('choose');
  });
  it('or at the reply box when there are none', () => {
    expect(tourStep(startTour(), at({ thread: true, options: false }))).toBe('reply');
  });
  it('then at closing it, once one of those is done', () => {
    expect(tourStep(after('open', 'choose'), at({ thread: true }))).toBe('close');
    expect(tourStep(after('open', 'reply'), at({ thread: true }))).toBe('close');
    expect(tourStep(after('open', 'choose', 'close'), at({ thread: true }))).toBe(null);
  });
  it('then back on the list, at New thread', () => {
    expect(tourStep(after('open'), inbox)).toBe('start');
  });
});

describe('the New thread box', () => {
  it('asks for a folder first when the project has none, even with words typed', () => {
    expect(tourStep(startTour(), at({ composer: 'card', folder: false }))).toBe('folder');
    expect(tourStep(startTour(), at({ composer: 'card', folder: false, text: true }))).toBe('folder');
  });
  it('then the suggestions, then Send', () => {
    expect(tourStep(startTour(), at({ composer: 'card' }))).toBe('pick');
    expect(tourStep(startTour(), at({ composer: 'card', text: true }))).toBe('send');
  });
  it('is the first thing for someone with no chats, on the empty inbox', () => {
    const empty = at({ rows: 0, composer: 'inline' });
    expect(tourStep(startTour(), { ...empty, folder: false })).toBe('folder');
    expect(tourStep(startTour(), empty)).toBe('pick');
  });
  it('is one tip: put away, its three steps do not come back', () => {
    expect(lessonOf('folder')).toBe('compose');
    expect(lessonOf('pick')).toBe('compose');
    expect(lessonOf('send')).toBe('compose');
    expect(tourStep(after('compose'), at({ composer: 'card' }))).toBe(null);
  });
});

describe('getting out of it', () => {
  it('a tip clicked away from is not shown again, and the next one still is', () => {
    expect(tourStep(after('open'), inbox)).toBe('start');
    expect(tourStep(after('open', 'start'), inbox)).toBe(null);
  });
  it('Skip ends everything', () => {
    const out = skipTour(startTour());
    expect(tourStep(out, inbox)).toBe(null);
    expect(tourStep(out, at({ composer: 'card' }))).toBe(null);
    expect(tourStep(out, at({ thread: true, options: true }))).toBe(null);
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
  it('show until the first send', () => {
    expect(showIdeas(startTour())).toBe(true);
    expect(showIdeas(after('open', 'start'))).toBe(true);
    expect(showIdeas(noteSent(startTour()))).toBe(false);
  });
  it('are gone after Skip', () => {
    expect(showIdeas(skipTour(startTour()))).toBe(false);
  });
  it('never show for someone who never had the tutorial', () => {
    expect(showIdeas(null)).toBe(false);
  });
});

describe('after the first send', () => {
  const sent = finishLesson(noteSent(startTour()), 'open');
  it('says the agent is working, on In progress, once', () => {
    expect(tourStep(sent, at({ view: 'progress', running: 1 }))).toBe('working');
    expect(tourStep(finishLesson(sent, 'working'), at({ view: 'progress', running: 1 }))).toBe(null);
  });
  it('does not say it on a list with nothing running', () => {
    expect(tourStep(sent, at({ view: 'progress', running: 0, rows: 0 }))).toBe(null);
  });
  it('never puts New thread or the box tips back', () => {
    expect(tourStep(sent, inbox)).toBe(null);
    expect(tourStep(sent, at({ composer: 'card' }))).toBe(null);
  });
});

describe('where it is kept', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
  it('reads back what was saved', () => {
    const st = store();
    saveTour(st, finishLesson(noteSent(startTour()), 'working'));
    expect(readTour(st)).toEqual({ sent: true, skipped: false, done: ['compose', 'working'] });
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

describe('a click', () => {
  it('puts the tip away rather than ending the tutorial', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    const down = tour.slice(tour.indexOf('const down = '), tour.indexOf('const key = '));
    expect(down).toContain('finishLesson(tour, lessonOf(step))');
    expect(down).not.toContain('skipTour');
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
    expect(box).toContain('const ideasShown = !!(ideas?.length && product?.repoPath && !person && !mate);');
  });
});

describe('a tip on a screen still arriving', () => {
  // Measured 2026-10-29 in the fresh window: for a moment after setup the inbox
  // had no rows yet, so the New thread box's tip flashed ("a weird flash of
  // orange light") and was then counted as seen, before the chat's row landed.
  it('waits for the screen to settle, and counts as seen only after a second', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toMatch(/const SETTLE_MS = 500;/);
    expect(tour).toMatch(/const SEEN_MS = 1000;/);
    expect(tour).toContain('if (was && seenFor >= SEEN_MS && !covered');
  });
});

describe('the send tip on the page', () => {
  // Measured 2026-10-29 in the fresh window: on the empty inbox the suggestions
  // hang under Send, and the "Press ⌘↵" card drawn below Send covered the one
  // just picked; moved above Send, it covered the words picked.
  it('sits under the suggestions when they are under Send', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toContain('if (ideas && ideas.top >= box.y + box.h) top = ideas.bottom + GAP;');
  });
});

describe('when the first agent answers', () => {
  // Measured 2026-10-29 in the fresh window: the first task went to In progress,
  // the agent answered 26 seconds later, and its row moved to Needs you. The
  // page left behind read "Nothing is running." with no tip at all.
  const sent = () => noteSent(startTour());
  const done = at({ view: 'progress', rows: 0, running: 0, waiting: 1 });
  it('points at Needs you from the tab you are on', () => {
    expect(tourStep(sent(), done)).toBe('answered');
    expect(tourStep(sent(), at({ view: 'later', rows: 0, waiting: 2 }))).toBe('answered');
  });
  it('and counts as the lesson about opening an answer', () => {
    expect(lessonOf('answered')).toBe('open');
    expect(tourStep(finishLesson(sent(), 'open'), done)).toBe(null);
  });
  it('not while an agent there is still working', () => {
    expect(tourStep(sent(), { ...done, rows: 1, running: 1 })).toBe('working');
  });
  it('not when nothing is waiting, nor on Needs you itself', () => {
    expect(tourStep(sent(), { ...done, waiting: 0 })).toBe(null);
    expect(tourStep(sent(), at({ view: 'inbox', rows: 1, waiting: 1 }))).toBe('open');
  });
});

describe('answering the agent', () => {
  // Measured 2026-10-29 in the fresh window: R opened the reply box and the tip
  // went, but the lesson was never counted, so Escape brought "Press R" back.
  it('shows nothing while you type a reply', () => {
    expect(tourStep(after('open'), at({ thread: true, typing: true }))).toBe(null);
    expect(tourStep(after('open', 'reply'), at({ thread: true, typing: true }))).toBe(null);
  });
  it('then points at closing it', () => {
    expect(tourStep(after('open', 'reply'), at({ thread: true }))).toBe('close');
  });
  it('counts the reply lesson as done once the reply box has the keyboard', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toContain("if (screen.typing && !tour.done.includes('reply'))");
  });
});

describe('while a chat brought in is being written up', () => {
  // Measured 2026-10-29 in a fresh window: for the 13 seconds the rewrite took,
  // the list had no row to point at, so "Press N" showed; opening the chat
  // showed "Press R" over "Writing up where this chat stands…".
  it('says nothing on the list or in the chat', () => {
    expect(tourStep(startTour(), at({ rows: 0, preparing: true }))).toBe(null);
    expect(tourStep(startTour(), at({ thread: true, preparing: true }))).toBe(null);
  });
  it('but still teaches the New thread box if it is opened', () => {
    expect(tourStep(startTour(), at({ composer: 'card', preparing: true }))).toBe('pick');
  });
});

describe('the down arrow on the empty inbox', () => {
  // The founder, 2026-10-29, on the empty inbox after answering her first
  // thread: "when I hit the down arrow, it doesn't actually do anything". ↓
  // was heard only inside the text box, and nothing had the keyboard there.
  it('reaches the suggestions when nothing else has the keyboard', async () => {
    const fs = await import('node:fs');
    const box = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(box).toContain('if (at && at !== document.body) return;');
    expect(box).toContain("window.addEventListener('keydown', down, true);");
  });
});
