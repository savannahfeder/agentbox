// AN ANSWER THAT LANDED WHERE NOBODY COULD SEE IT IS NOT READ (w-a3487b7f7b).
//
// WHAT BROKE, measured on the real store. On w-612d9c3d28 the question went in
// at 23:40:13: "i never published the repos of my early tests; i meant can you
// validate if that was consistent with that era". The cloud run started a
// second later and its answer reached the row at 23:41:02 (`result`, source
// agent, with `answeredThrough` written 0ms after it, so the row went back to
// Needs you). The answer is in the ledger, and building the thread off that
// ledger and its traces draws it, so every mechanism the app has delivered it.
// Two hours and nineteen minutes later: "was this really a time? never saw
// your response earlier", and the agent answered the same question again at
// 02:05:27.
//
// The one surface that was meant to point back at it is the unread dot, and
// the app had already put it out. App.tsx marked the open thread read the
// instant an answer arrived on it — `if (focused) markSeen(focused)` — with no
// test of whether anybody was looking. `isUnread` then reads the row's newest
// `result` against that moment, and the next turn at 23:46:24 overwrote
// `result`, so nothing anywhere pointed at the paragraph that was missed.
//
// Every turn on that thread that DID arrive ended with options or named a
// file, and both of those draw a second surface the dot cannot silence: the
// options picker in the dock, and the file chip. A pure answer has only the
// stream, so a stream scrolled up is the whole of it.
//
// The rule now: an arriving message counts as read only when the window is the
// one in front AND the conversation is resting at its end, which is where a
// new message is drawn. `LEAVE_SLACK` is the same tolerance `holdAtBottom`
// uses to decide they scrolled away, so the stick and the dot cannot disagree
// about where the end is.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEAVE_SLACK } from '../renderer/src/thread-bottom.ts';
import { readWhenTheySeeIt, sawWhatLanded, threadPane } from '../renderer/src/read-what-you-saw.ts';

const ID = 'w-612d9c3d28';

// A window with one thread pane in it, as the rule reads it. The pane can be
// scrolled and the window can be left and come back, which is what a person
// does; both tell their listeners.
const window = ({ front = true, showing = true, gap = 0, pane = true, id = ID } = {}) => {
  const scrolls = new Set();
  const backs = new Set();
  let here = front;
  const box = {
    scrollTop: 1000 - gap, scrollHeight: 2000, clientHeight: 1000,
    addEventListener: (_type, fn) => scrolls.add(fn),
    removeEventListener: (_type, fn) => scrolls.delete(fn),
  };
  return {
    hasFocus: () => here,
    visibilityState: showing ? 'visible' : 'hidden',
    querySelector: (sel) => (pane && sel === threadPane(id) ? box : null),
    // The window itself, which is where a focus event is heard.
    back: { addEventListener: (_type, fn) => backs.add(fn), removeEventListener: (_type, fn) => backs.delete(fn) },
    // A hand on the scrollbar: `to` is how much is left under the fold.
    scrollTo: (to) => { box.scrollTop = 1000 - to; [...scrolls].forEach((fn) => fn()); },
    // Coming back to the window after being in another app.
    comeBack: () => { here = true; [...backs].forEach((fn) => fn()); },
    watching: () => scrolls.size + backs.size,
  };
};

describe('an answer landing on the open thread', () => {
  it('is read when the app is in front with the conversation at its end', () => {
    expect(sawWhatLanded(window({ gap: 0 }), ID)).toBe(true);
  });

  it('is NOT read when the thread has been scrolled up off the end', () => {
    // The reported case: 301px of the conversation under the fold.
    expect(sawWhatLanded(window({ gap: 301 }), ID)).toBe(false);
  });

  it('holds the same tolerance the stick uses, either side of it', () => {
    expect(sawWhatLanded(window({ gap: LEAVE_SLACK }), ID)).toBe(true);
    expect(sawWhatLanded(window({ gap: LEAVE_SLACK + 1 }), ID)).toBe(false);
  });

  it('is NOT read when the window is behind another or hidden', () => {
    expect(sawWhatLanded(window({ front: false }), ID)).toBe(false);
    expect(sawWhatLanded(window({ showing: false }), ID)).toBe(false);
  });

  it('is NOT read when the thread it names is not the pane on screen', () => {
    // A pane still mounted for the thread just left must not answer for
    // this one, which is what the id on the pane is for.
    expect(sawWhatLanded(window({ id: 'w-0000000000' }), ID)).toBe(false);
    expect(sawWhatLanded(window({ pane: false }), ID)).toBe(false);
  });

  it('names the pane Focus.tsx actually draws', () => {
    const focus = fs.readFileSync(fileURLToPath(new URL('../renderer/src/components/Focus.tsx', import.meta.url)), 'utf8');
    expect(focus).toContain('className="focus-scroll" data-thread-id={item.id}');
    expect(threadPane(ID)).toBe(`.focus-scroll[data-thread-id="${ID}"]`);
  });
});

// AND IT IS READ BY SCROLLING DOWN TO IT, without leaving the thread or the
// window (Codex, gpt-6-luna, 2026-11-02: often 5, bad 2). The arrival asks
// once, so without this the dot it correctly kept would never come off.
describe('reaching a message that landed above the fold', () => {
  it('marks it read, once, the moment the end comes into view', () => {
    const page = window({ gap: 301 });
    let read = 0;
    readWhenTheySeeIt(page, ID, () => { read += 1; });
    expect(read).toBe(0);
    page.scrollTo(200);          // part of the way: still not the end
    expect(read).toBe(0);
    page.scrollTo(0);            // the end
    expect(read).toBe(1);
    page.scrollTo(0);            // and it does not keep saying so
    expect(read).toBe(1);
    expect(page.watching()).toBe(0);
  });

  it('marks it read at once, and watches nothing, when already at the end', () => {
    const page = window({ gap: 0 });
    let read = 0;
    readWhenTheySeeIt(page, ID, () => { read += 1; });
    expect(read).toBe(1);
    expect(page.watching()).toBe(0);
  });

  it('does not read it while the window is behind another, however it scrolls', () => {
    const page = window({ gap: 301, front: false });
    let read = 0;
    readWhenTheySeeIt(page, ID, () => { read += 1; });
    page.scrollTo(0);
    expect(read).toBe(0);
  });

  it('lets go when the thread is left', () => {
    const page = window({ gap: 301 });
    let read = 0;
    const release = readWhenTheySeeIt(page, ID, () => { read += 1; }, { back: page.back });
    expect(page.watching()).toBe(2);
    release();
    expect(page.watching()).toBe(0);
    page.scrollTo(0);
    expect(read).toBe(0);
  });

  // COMING BACK TO THE WINDOW IS THE OTHER WAY IT ARRIVES IN FRONT OF YOU, and
  // it belongs to the same watch: App.tsx used to mark it read on its own on
  // the way back, leaving this watch armed behind it, so Mark Unread on the
  // open thread was undone by the next scroll (Codex, round two, 2026-11-02:
  // often 2, bad 4). The comment on `focusedArrival` has protected Mark Unread
  // since it was written; one owner and one success is what keeps it true.
  it('reads it on the way back to the window, and lets go of everything', () => {
    const page = window({ gap: 0, front: false });
    let read = 0;
    readWhenTheySeeIt(page, ID, () => { read += 1; }, { back: page.back });
    expect(read).toBe(0);
    page.comeBack();
    expect(read).toBe(1);
    expect(page.watching()).toBe(0);
  });

  it('never marks it read twice, so Mark Unread then a scroll stands', () => {
    const page = window({ gap: 0, front: false });
    let read = 0;
    readWhenTheySeeIt(page, ID, () => { read += 1; }, { back: page.back });
    page.comeBack();             // read on the way back
    page.scrollTo(301);          // Mark Unread, then read back up the thread
    page.scrollTo(0);            // and down to the end again
    expect(read).toBe(1);
  });

  it('stays armed when the window comes back still scrolled up', () => {
    const page = window({ gap: 301, front: false });
    let read = 0;
    readWhenTheySeeIt(page, ID, () => { read += 1; }, { back: page.back });
    page.comeBack();
    expect(read).toBe(0);
    expect(page.watching()).toBe(2);
    page.scrollTo(0);
    expect(read).toBe(1);
  });

  it('watches nothing when the thread has no pane to watch', () => {
    const page = window({ pane: false });
    let read = 0;
    expect(() => readWhenTheySeeIt(page, ID, () => { read += 1; })()).not.toThrow();
    expect(read).toBe(0);
  });
});

describe('App.tsx', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../renderer/src/App.tsx', import.meta.url)), 'utf8');

  // The arrival effect, from `useEffect` to its `[focusedArrival]` deps.
  const arrival = /useEffect\(\(\) => \{[\s\S]*?\}, \[focusedArrival\]\)/.exec(src);

  it('reads the rule before it marks an arrival read', () => {
    // A bare `if (focused) markSeen(focused)` here is the bug.
    expect(arrival, 'the arrival effect is still in App.tsx').not.toBeNull();
    expect(arrival[0]).toContain('readWhenTheySeeIt(document, focused.id');
    expect(arrival[0]).toContain('markSeen(focused)');
  });

  it('leaves the one watch to decide it, on the way back to the window too', () => {
    // A second markSeen on the focus handler is the round-two finding: it marks
    // it read behind the watch's back and leaves the watch armed.
    const onFocus = /const back = \(\) => \{[\s\S]*?\};/.exec(src);
    expect(onFocus, 'the window-focus handler is still in App.tsx').not.toBeNull();
    expect(onFocus[0]).not.toContain('markSeen');
    expect(arrival[0]).toContain('back: window');
  });

  it('still tells the team they are there, which is a different question', () => {
    // Gating the dot must not quietly stop "Seen by": that one asks whether
    // they are AT the app, and markSeen makes the same test itself.
    expect(arrival[0]).toContain('document.hasFocus() && document.visibilityState === \'visible\'');
    expect(arrival[0]).toContain('api.teamSeen');
  });

  it('still marks a thread read when it is opened, whatever the scroll says', () => {
    // Opening never relied on the arrival effect: every door sets focused and
    // calls markSeen itself. If that stopped being true, guarding the arrival
    // would leave every thread they read still dotted.
    expect(src.match(/setFocused\((?:item|row|target|next\.item|stop\.item)\); markSeen\(/g)?.length ?? 0).toBeGreaterThan(5);
  });
});
