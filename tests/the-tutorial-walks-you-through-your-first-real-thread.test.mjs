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
//    shows until it is done, then never again; End the tutorial in the command bar ends
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
    expect(tourStep(after('open', 'choose', 'close'), at({ thread: true }))).toBe('startHere');
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
  // Round eleven: "after you've gone through one flow, making a new thread
  // probably shouldn't show those suggestions." Then, 2026-10-29: "it should
  // always propose suggestions if you ever need to type a task in", and, of the
  // New thread box after the first send, "when i hit n there's no guidance".
  // So they show in every New thread box until the tutorial is over.
  it('show in every New thread box while the tutorial runs', () => {
    expect(showIdeas(startTour())).toBe(true);
    expect(showIdeas(after('open', 'start'))).toBe(true);
    expect(showIdeas(noteSent(startTour()))).toBe(true);
  });
  it('and not once the tutorial is over', () => {
    expect(showIdeas(noteSent(after('close', 'palette')))).toBe(false);
  });
  it('are gone after Skip', () => {
    expect(showIdeas(skipTour(startTour()))).toBe(false);
  });
  it('never show for someone who never had the tutorial', () => {
    expect(showIdeas(null)).toBe(false);
  });
});

describe('a second New thread box during the tutorial', () => {
  // The founder, 2026-10-29: "I don't understand the purpose of it basically
  // asking me two times over to create a new thread ... after I create a task,
  // my natural logic is just to click into it." The suggestions stay in the box,
  // but no tip pushes a second thread.
  it('shows the suggestions without a tip pushing them', () => {
    const sent = noteSent(startTour());
    expect(tourStep(sent, at({ composer: 'card', folder: true, ideas: true }))).toBe(null);
    expect(tourStep(sent, at({ composer: 'inline', rows: 0, folder: true, ideas: true }))).toBe(null);
  });
});

describe('the first send', () => {
  // Walked on 2026-10-29: a picked suggestion that repeats sent as a repeating
  // task, the tab stayed on Needs you, and the "working" tip never had a row.
  it('moves to In progress even when it is a repeating suggestion', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("const first = firstTask(tour);");
    expect(app).toMatch(/tabAfterSending\(\{[^}]*kind: how\.kind, first,/);
    const { tabAfterSending } = await import('../renderer/src/threads/composer-rules.ts');
    const sent = { team: false, later: false, view: 'inbox', covered: false };
    expect(tabAfterSending({ ...sent, kind: 'repeat', first: true })).toBe('progress');
    expect(tabAfterSending({ ...sent, kind: 'repeat', first: false })).toBe(null);
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
    expect(app).toContain('<InboxClear slot={setClearSlot} first={firstTask(tour)} />');
  });
  it('offers the suggestions only once the project has a folder', async () => {
    const fs = await import('node:fs');
    const box = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(box).toContain('const ideasShown = !!(ideas?.length && (product?.repoPath || projectChosen || !askFolder) && !person && !mate);');
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
  // Measured 2026-10-29 walking the first run with the machine busy: the
  // folder was chosen and the suggestions were up, and "Choose the folder this
  // agent will work in" stayed on for most of a second while the next tip
  // settled. A tip whose screen has gone is taken down at once.
  it('takes a tip down at once when its screen has gone, rather than while the next settles', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toContain('const next = wanted && Date.now() - settling.current.since < SETTLE_MS ? null : wanted;');
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
  it('says so on the list, and nothing in the chat, whose page says it', () => {
    expect(tourStep(startTour(), at({ rows: 0, preparing: true }))).toBe('gettingReady');
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
    expect(tourStep(after('compose', 'open', 'reply', 'close'), at({ thread: true }))).toBe('startHere');
    expect(tourStep(noteSent(after('open', 'reply', 'close', 'palette')), at({ rows: 0 }))).toBe(null);
    // Someone who brought chats in and has not sent anything is then shown New thread.
    expect(tourStep(after('open', 'reply', 'close', 'palette'), at({ rows: 0 }))).toBe('start');
  });
  it('counts as learned when the bar closes, after its own tip has said what to do in it', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("if (paletteWasOpen.current && modal !== 'palette' && tour && !tour.done.includes('palette')) setTour(finishLesson(tour, 'palette'));");
  });
  it('has no glow, since nothing on screen opens it', async () => {
    // Drawn first on the page title: the glow hugged "Threads" and the card covered the tabs.
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toContain("{step !== 'palette' && !(step === 'urgent' && !urgentCell()) && step !== 'busy' && step !== 'gettingReady' && step !== 'inPalette' && step !== 'startHere' && <div key={`glow-${step}`}");
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
    expect(box).toContain("data-tour-folder={product?.repoPath || projectChosen || !askFolder ? '1' : '0'}");
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
    expect(tour).toContain('const ended = (t: TourState | null) => tourOver(t);');
    expect(fs.readFileSync(new URL('../renderer/src/tour.ts', import.meta.url), 'utf8')).toContain("!!t && !t.skipped && t.done.includes('close') && t.done.includes('palette') && (t.sent || t.done.includes('start'))");
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
    expect(box).toContain('const ideasShown = !!(ideas?.length && (product?.repoPath || projectChosen || !askFolder) && !person && !mate);');
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
    expect(box).toContain('const unpicked = askFolder && !!ideas?.length && !projectChosen && !product?.repoPath;');
    expect(box).toContain("{unpicked ? 'Choose a folder' : product?.name ?? 'No project'}");
  });
  // And then: "I thought it was actually a folder ... that can run code. It's just for personal tasks."
  it('says in the menu what a project with no folder is for', async () => {
    const box = await read();
    expect(box).toContain('{!p.repoPath && <span className="tc-row-note">For personal tasks</span>}');
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

describe('the glow around the working line', () => {
  // The founder, 2026-10-29: "the highlight of thinking is a bit uneven ...
  // it's got a lot more border on the bottom." A hidden copy of the word read
  // out to screen readers sat lower and stretched it; the lattice, drawn
  // without svg, fell outside it on the left.
  it('measures what is seen: the lattice in, the screen reader copy out', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toContain("n.parentElement?.closest('.live-announcement')");
    expect(tour).toContain("el.querySelectorAll('svg, .th-st, .live-mark, .prio-bars')");
  });
});

describe('a key a tip counts', () => {
  // The founder, 2026-10-29: "when i hit e here nothing happens, doesnt bring me
  // to inbox", with the command bar tip up on a thread. Reproduced in a fresh
  // window: the tip's listener saved the tutorial at once, the app redrew
  // before its own key handler ran and put a new handler in its place, and the
  // press reached neither. E also counted the command bar as learned.
  it("is still the app's to act on: the tutorial is saved after the press", async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    const key = tour.slice(tour.indexOf('const key = (e: KeyboardEvent) => {'), tour.indexOf("window.addEventListener('pointerdown'"));
    expect(key).toContain('const later = (t: TourState) => setTimeout(() => onChange(t), 0);');
    expect(key).not.toMatch(/\bonChange\(finishLesson/);
  });
  it('E counts the close, and not the command bar', async () => {
    const { closeLessons } = await import('../renderer/src/tour.ts');
    expect(closeLessons('palette')).toEqual(['open', 'close']);
    expect(closeLessons('reply')).toEqual(['reply', 'open', 'close']);
    expect(closeLessons('choose')).toEqual(['choose', 'open', 'close']);
  });
});

describe('the command bar tip on the empty inbox', () => {
  // Measured 2026-10-29 by the end-to-end walk: closing the only thread leaves
  // the empty inbox with the box and its suggestions, and their tip took the
  // place of the command bar's, so the tutorial never ended.
  it('comes before the suggestions once the first thread is closed', () => {
    const t = noteSent(after('open', 'reply', 'close'));
    expect(tourStep(t, at({ rows: 0, composer: 'inline', folder: true, ideas: true }))).toBe('palette');
    expect(tourStep(t, at({ rows: 0, composer: 'card', folder: true, ideas: true }))).toBe(null);
  });
});

describe('the glow reading the window', () => {
  // Main found on 2026-10-29 (the-open-task-hint-never-turns-a-loop-into-a-
  // blank-screen) that a set which changes nothing still schedules a render,
  // and inside someone else's update loop that unmounted the whole window.
  // The tutorial reads the window eight times a second, so it sets only what moved.
  it('sets the glow, the card and the tip only when they change', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toContain('if (!same(boxNow.current, b)) { boxNow.current = b; setBox(b); }');
    expect(tour).toContain('if (cardNow.current?.left !== left || cardNow.current?.top !== top) { cardNow.current = { left, top }; setCardAt(cardNow.current); }');
    expect(tour).not.toMatch(/setBox\(\(had\)/);
  });
});

describe('a thread the agent closed itself', () => {
  // Measured 2026-10-29 by the end-to-end walk: after "Thanks, that is all."
  // the agent closed the thread, so it had no Done for the close tip to point
  // at, and the tutorial waited on a close that had already happened.
  it('counts as the close, so the tutorial goes on to the command bar', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).toContain("if (wanted === 'close' && document.querySelector('.focus-body .one-title') && !document.querySelector('.ts-done')) { onChange(finishLesson(tour, 'close')); return; }");
  });
});

describe('the first thread, once sent', () => {
  // "after I create a task, my natural logic is just to click into it."
  it('opens by itself, once its row is there', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('if (!firstThread || openedFirst.current || focused || (modal !== null && modal !== \'compose\')) return;');
    expect(app).toContain('openedFirst.current = true;');
  });
  it('and the tips say to watch it, not to start another', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    expect(tour).not.toContain('to start another thread');
    expect(tour).toContain('An agent is working on this. Press <K k="↵" /> to watch it');
    expect(tour).toContain('This agent is working. You can leave and come back when it’s done');
  });
  it('Return on the working row is what that tip teaches', async () => {
    const { keyLearns } = await import('../renderer/src/tour.ts');
    expect(keyLearns('working', { key: 'Enter' })).toBe(true);
  });
});

describe('E on a thread that is waiting on you', () => {
  // The founder, 2026-10-29: "when i hit e here nothing happens". The app holds
  // the first E on a thread waiting on an answer and says so in the header;
  // the tutorial counted it as the close anyway and drew the command bar tip
  // over that sentence. Measured again by the end-to-end walk the same night.
  it('counts as the close only once the thread has really gone', async () => {
    const fs = await import('node:fs');
    const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
    // The app says so as it closes the thread; a held E never reaches that line.
    expect(tour).toContain("const closed = () => onChange(closeLessons(shown.current ?? 'close').reduce(finishLesson, tour));");
  });
});
