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
//    shows until it is done, then never again; Skip tutorial and Escape end
//    all of it.
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
  it('a tip learned is not shown again, and the next one still is', () => {
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
  // The founder, 2026-10-29, in the fresh window: "It showed the Cmd+K line but
  // I clicked elsewhere by accident and it disappeared. Clicking should not get
  // rid of the tutorial." A click elsewhere had put the close tip away and
  // counted it, so the confetti said the tutorial was over and then the
  // command bar tip came after it.
  it('elsewhere does nothing; on the lit thing, it is doing what the tip asks', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    const down = tour.slice(tour.indexOf('const down = '), tour.indexOf('const key = '));
    expect(down).toContain('if (!onTarget(e.target)) return;');
    expect(down).toContain('finishLesson(tour, lessonOf(step))');
    expect(tour).not.toContain('quietAt');
  });
});

describe('a tip that leaves the screen', () => {
  const was = at({});
  it('is learned when the screen it asked for comes', async () => {
    const { learnedBy } = await import('../renderer/src/tour.ts');
    expect(learnedBy('open', was, at({ thread: true }))).toBe(true);
    expect(learnedBy('start', was, at({ composer: 'card' }))).toBe(true);
    expect(learnedBy('answered', at({ view: 'progress' }), at({ view: 'inbox' }))).toBe(true);
  });
  it('and not when something else took its place', async () => {
    const { learnedBy } = await import('../renderer/src/tour.ts');
    expect(learnedBy('open', was, at({ view: 'progress' }))).toBe(false);
    expect(learnedBy('start', was, at({ thread: true }))).toBe(false);
    expect(learnedBy('palette', was, at({ thread: true }))).toBe(false);
    expect(learnedBy('close', at({ thread: true }), at({ thread: true, covered: true }))).toBe(false);
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
    expect(box).toContain('const ideasShown = !!(ideas?.length && (product?.repoPath || projectChosen) && !person && !mate);');
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
    expect(tour).toContain('if (was && seenFor >= SEEN_MS && !covered && learnedBy(was, before.current, screen))');
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

describe('the practice tutorial does not offer itself on top', () => {
  // The founder, 2026-10-29, making her first project from the New thread box:
  // "It just strangely opened this modal layered on top. I don't think we
  // should ask people for permission." The practice round's offer on a new
  // project is for people who came through the old first run.
  it('is never offered to someone the new first run took through', async () => {
    const { offerOnNewProject } = await import('../renderer/src/tutorial.ts');
    expect(offerOnNewProject({ made: true, walking: false, offered: false, touring: true })).toBe(false);
    expect(offerOnNewProject({ made: true, walking: false, offered: false, touring: false })).toBe(true);
  });
  it('and the app says which people those are', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('touring: tourRef.current !== null,');
  });
});

describe('the command bar', () => {
  // The founder, 2026-10-29: "make sure that our onboarding flow teaches people
  // about the Cmd+K menu bar." It is the last tip, once a first thread is closed.
  it('is pointed out on the list once the first thread is closed', () => {
    expect(tourStep(noteSent(after('open', 'reply', 'close')), at({ rows: 0 }))).toBe('palette');
    expect(tourStep(after('open', 'choose', 'close', 'start'), at({ view: 'progress', rows: 0 }))).toBe('palette');
    // Measured with three chats brought in: the bar came before New thread, and pressing N used it up unread.
    expect(tourStep(after('open', 'choose', 'close'), at({ rows: 2 }))).toBe('start');
    // Measured in the fresh window: closing the only thread leaves the empty inbox, where the box is drawn on the page.
    expect(tourStep(noteSent(after('open', 'reply', 'close')), at({ rows: 0, composer: 'inline' }))).toBe('palette');
  });
  it('not before, not inside a thread, and not once it has been opened', () => {
    expect(tourStep(after('compose', 'open'), at({ rows: 0 }))).not.toBe('palette');
    expect(tourStep(after('compose', 'open', 'reply', 'close'), at({ thread: true }))).toBe(null);
    expect(tourStep(noteSent(after('open', 'reply', 'close', 'palette')), at({ rows: 0 }))).toBe(null);
    // Someone who brought chats in and has not sent anything is then shown New thread.
    expect(tourStep(after('open', 'reply', 'close', 'palette'), at({ rows: 0 }))).toBe('start');
  });
  it('counts as learned when the bar opens', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("if (modal === 'palette' && tour && !tour.done.includes('palette')) setTour(finishLesson(tour, 'palette'));");
  });
  it('has no glow, since nothing on screen opens it', async () => {
    // Drawn first on the page title: the glow hugged "Threads" and the card covered the tabs.
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toContain("{step !== 'palette' && <div key={`glow-${step}`}");
  });
});

describe('a tip is learned by pressing its key', () => {
  // Measured 2026-10-29 in the fresh window: E closed the first thread, but the
  // card the close put up covered the window as the tip went, so the lesson
  // was not counted and the command bar tip never came.
  it('names the key each tip asks for', async () => {
    const { keyLearns } = await import('../renderer/src/tour.ts');
    expect(keyLearns('close', { key: 'e' })).toBe(true);
    expect(keyLearns('close', { key: 'E' })).toBe(true);
    expect(keyLearns('start', { key: 'n' })).toBe(true);
    expect(keyLearns('open', { key: 'Enter' })).toBe(true);
    expect(keyLearns('choose', { key: '2' })).toBe(true);
    expect(keyLearns('reply', { key: 'r' })).toBe(true);
  });
  it('and not another key, or the same key with a modifier', async () => {
    const { keyLearns } = await import('../renderer/src/tour.ts');
    expect(keyLearns('close', { key: 'r' })).toBe(false);
    expect(keyLearns('close', { key: 'e', metaKey: true })).toBe(false);
    expect(keyLearns('choose', { key: '0' })).toBe(false);
    expect(keyLearns('send', { key: 'Enter' })).toBe(false);
  });
});

describe('My Workspace, chosen on purpose', () => {
  // The founder, 2026-10-29: "it doesn't act like my workspace is legitimate
  // but I would think that's probably something I should be able to select and
  // have approved. Until it's selected, it probably shouldn't be viable."
  it('counts as the folder once it is picked from the menu', async () => {
    const fs = await import('node:fs');
    const box = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(box).toContain("data-tour-folder={product?.repoPath || projectChosen ? '1' : '0'}");
    expect(box).toContain('setProjectChosen(true);');
  });
  it('has no suggestions, so the tip points at the words instead', () => {
    expect(tourStep(startTour(), at({ composer: 'inline', folder: true, ideas: false }))).toBe('write');
    expect(tourStep(startTour(), at({ composer: 'inline', folder: true, ideas: true }))).toBe('pick');
    expect(tourStep(startTour(), at({ composer: 'inline', folder: true, ideas: false, text: true }))).toBe('send');
    expect(lessonOf('write')).toBe('compose');
  });
});

describe('the end of the tutorial', () => {
  // The founder, 2026-10-29: "it would be nice if, at the end, it did a little
  // thing. Previously we had confetti explode when it was done." Fired on the
  // close first, it said the tutorial was over with the command bar tip still
  // to come.
  it('bursts the confetti once, when the close and the command bar are both learned', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toContain("const ended = (t: TourState | null) => !!t && !t.skipped && t.done.includes('close') && t.done.includes('palette');");
    expect(tour).toContain('if (covered || hadEnded.current === ended(tour)) return;');
    expect(tour).toContain('{burst ? <ConfettiBurst key={burst} /> : null}');
  });
  it('draws the burst the walk once ended on', async () => {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    globalThis.React = React;
    const { ConfettiBurst } = await import('../renderer/src/components/ConfettiBurst.tsx');
    const html = renderToStaticMarkup(React.createElement(ConfettiBurst));
    expect(html).toContain('fr-burst');
    expect((html.match(/fr-bit/g) ?? []).length).toBe(40);
  });
});

describe('suggestions wherever the first task is typed', () => {
  // The founder, 2026-10-29: "it should always propose suggestions if you ever
  // need to type a task in. We don't want to have to force people to come up
  // with a task because that's probably when they'll turn."
  it('offers a set for My Workspace too, none of them about code it does not have', async () => {
    const { ideasFor } = await import('../renderer/src/first-run.ts');
    const plain = ideasFor({ folder: false });
    expect(plain.length).toBeGreaterThanOrEqual(3);
    for (const i of plain) expect(i.text).not.toMatch(/project|app|code|changes|packages/i);
    expect(ideasFor({ folder: true })[0].text).toBe('Explain how this project is put together');
  });
  it('shows them once a folder is set or My Workspace is picked', async () => {
    const fs = await import('node:fs');
    const box = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(box).toContain('const ideasShown = !!(ideas?.length && (product?.repoPath || projectChosen) && !person && !mate);');
    expect(box).toContain('const offeredIdeas = product?.repoPath ? ideas ?? [] : ideasFor({ folder: false });');
  });
});

describe('closing a thread before its tip comes up', () => {
  // Measured 2026-10-29 in the fresh window: E pressed on the first answer
  // while "Press R" was up counted the reply, not the close, so neither the
  // confetti nor the command bar tip came.
  it('counts as the close, whichever tip is up', async () => {
    const { closesThread } = await import('../renderer/src/tour.ts');
    expect(closesThread({ key: 'e' }, true)).toBe(true);
    expect(closesThread({ key: 'E' }, true)).toBe(true);
    expect(closesThread({ key: 'e' }, false)).toBe(false);
    expect(closesThread({ key: 'e', metaKey: true }, true)).toBe(false);
  });
});

describe('a thread opened while its agent is still working', () => {
  // The founder, 2026-10-29: "I was curious about things so I did not hit N,
  // clicked into the task, and hit R ... I think you need better handling if
  // the user goes off path." Nothing said the agent was still at it.
  it('says the answer will come to Needs you', () => {
    expect(tourStep(noteSent(startTour()), at({ thread: true, busy: true }))).toBe('busy');
    expect(lessonOf('busy')).toBe('busy');
  });
  it('and asks for nothing else on that page while it works', () => {
    const t = finishLesson(noteSent(startTour()), 'busy');
    expect(tourStep(t, at({ thread: true, busy: true }))).toBe(null);
    expect(tourStep(t, at({ thread: true, busy: false }))).toBe('reply');
  });
});

describe('a menu open over the tip', () => {
  // The founder, 2026-10-29, with the project menu open over the suggestions:
  // "in the event that you open up another component, it should probably have a
  // higher z-index than the border of this component." The glow sat over it.
  it('puts the tip aside until it closes, without counting it', async () => {
    const { learnedBy } = await import('../renderer/src/tour.ts');
    const box = at({ composer: 'inline', folder: true, ideas: true });
    expect(tourStep(startTour(), { ...box, menu: true })).toBe(null);
    expect(tourStep(startTour(), box)).toBe('pick');
    expect(learnedBy('pick', box, { ...box, menu: true })).toBe(false);
  });
  it('but not the folder tip, which is about that menu', () => {
    expect(tourStep(startTour(), at({ composer: 'inline', folder: false, menu: true }))).toBe('folder');
  });
});

describe('the folder chip before a choice', () => {
  // The founder, 2026-10-29: "it's going to be a bit confusing because a
  // particular folder is already selected and it's also not obvious what my
  // workspace is. Most people probably won't know what that is and even I forgot."
  const read = async () => (await import('node:fs')).readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
  it('asks for a folder rather than showing My Workspace as picked', async () => {
    const box = await read();
    expect(box).toContain('const unpicked = !!ideas?.length && !projectChosen && !product?.repoPath;');
    expect(box).toContain("{unpicked ? 'Choose a folder' : product?.name ?? 'No project'}");
  });
  it('says in the menu what a project with no folder is for', async () => {
    const box = await read();
    expect(box).toContain('{!p.repoPath && <span className="tc-row-note">No folder · for work that isn’t code</span>}');
  });
});

describe('the command bar tip on a thread', () => {
  // Measured 2026-10-29: E closed the first thread and the app went straight
  // on to the next one waiting, so the command bar tip, drawn only on the
  // list, never came.
  it('shows on the next thread too, once that thread asks for nothing first', () => {
    const t = noteSent(after('open', 'choose', 'reply', 'close'));
    expect(tourStep(t, at({ thread: true, options: true }))).toBe('palette');
    expect(tourStep(t, at({ thread: true, busy: true }))).toBe('busy');
  });
});
