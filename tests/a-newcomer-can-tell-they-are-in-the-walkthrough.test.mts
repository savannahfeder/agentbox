// A NEWCOMER CAN TELL THEY ARE IN THE WALKTHROUGH (w-9687db6270, 2026-11-22).
//
// On the first multiplayer call a new owner left the walkthrough's pages for
// Settings › Team, made a team there and pressed Start Pro as if the
// walkthrough were over, then took it for a bug. Walked on the cloud as a
// Free user: the only sign of the walkthrough was an 11px faint
// "WALKTHROUGH 2 OF 5" above the app, and on Settings, the Team page or Files
// no tip showed at all. The founder picked a narrow column beside the app
// that holds only how far through you are, with Skip at its foot
// (designs/w-9687db6270/b-skip-at-the-foot-on.png), and, off the
// walkthrough's pages, a way back to it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { awayFromWalk, finishLesson, noteSent, replyTeaches, skipTour, startTour, tourStep, withPractice, type Lesson, type TourScreen } from '../renderer/src/tour.ts';
import { TourFrame } from '../renderer/src/components/TourFrame.tsx';
import { walkPlace } from '../renderer/src/setup-split.ts';

globalThis.React = React;
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const column = (props: { done?: Lesson[]; now?: Lesson | null; finished?: boolean; away?: boolean }) =>
  renderToStaticMarkup(React.createElement(TourFrame, { done: props.done ?? ['compose'], now: props.now ?? 'open', finished: props.finished, away: props.away, onBack: () => {}, onSkip: () => {} }));

const sent = noteSent(withPractice(startTour(), { slug: 'practice', item: 'w-practice' }));
const closed = ['open', 'choose', 'close'].reduce((t, l) => finishLesson(t, l as Lesson), sent);

describe('off the walkthrough’s pages', () => {
  const at = (over: Partial<{ elsewhere: boolean; home: boolean; thread: boolean; practiceThread: boolean }>) => ({ elsewhere: false, home: false, thread: false, practiceThread: false, ...over });
  const fresh = withPractice(startTour(), { slug: 'practice' });
  it('is a page it has no tip on: Settings, the Team page, Files and the rest', () => {
    expect(awayFromWalk(sent, at({ elsewhere: true }))).toBe(true);
  });
  it('is not the list or the practice thread', () => {
    expect(awayFromWalk(sent, at({}))).toBe(false);
    expect(awayFromWalk(sent, at({ thread: true, practiceThread: true }))).toBe(false);
  });
  // Round two of the power test, 2026-11-22: Home at 3 of 5 had no tip and no way back.
  it('is Home from sending the practice thread to closing it, when Home has no tip', () => {
    expect(awayFromWalk(fresh, at({ home: true }))).toBe(false);
    expect(awayFromWalk(sent, at({ home: true }))).toBe(true);
    expect(awayFromWalk(closed, at({ home: true }))).toBe(false);
  });
  it('is a real thread while the walkthrough is still about its practice one', () => {
    expect(awayFromWalk(sent, at({ thread: true }))).toBe(true);
  });
  it('is not a real thread once the practice one is closed, since the last tip stands over any thread', () => {
    expect(awayFromWalk(closed, at({ thread: true }))).toBe(false);
  });
  it('is nowhere once the walkthrough is skipped or there is none', () => {
    expect(awayFromWalk(skipTour(sent), at({ elsewhere: true }))).toBe(false);
    expect(awayFromWalk(null, at({ elsewhere: true }))).toBe(false);
  });
});

describe('how far through you are', () => {
  // Round two of the power test, 2026-11-22: ⌘K opened at 2 of 5 read 5 of 5, then 3 of 5 after Esc.
  it('does not move on for a tip ahead of its turn', () => {
    expect(walkPlace(['compose'], 'palette').at).toBe(2);
    expect(walkPlace(['compose'], 'urgent').at).toBe(2);
    expect(walkPlace(['compose', 'open', 'choose'], 'palette').at).toBe(4);
  });
  it('reaches the last step once the thread is closed', () => {
    expect(walkPlace(['compose', 'open', 'choose', 'close'], 'palette').at).toBe(5);
  });
  it('still counts writing back once you are in the practice thread', () => {
    expect(walkPlace(['compose'], 'reply').at).toBe(3);
  });
  // Round three, 2026-11-22: ⌘K learned out of turn read 2 of 5 under the tip for step 1.
  it('is the step the tip on screen is about, whatever was learned out of turn', () => {
    expect(walkPlace(['palette'], 'compose').at).toBe(1);
    expect(walkPlace(['palette'], null).at).toBe(1);
    expect(walkPlace(['palette', 'compose'], 'open').at).toBe(2);
  });
  it('stays at the last step once everything is done', () => {
    expect(walkPlace(['compose', 'open', 'choose', 'reply', 'close', 'palette'], null).at).toBe(5);
  });
});

describe('the thread tips', () => {
  // Round three, 2026-11-22: "Press R to answer this agent" stood on a real thread
  // while the column offered Back to the walkthrough.
  const screen = (over: Partial<TourScreen>): TourScreen => ({ composer: 'none', folder: true, text: false, view: 'inbox', rows: 3, running: 0, thread: true, options: false, covered: false, ...over });
  const opened = finishLesson(sent, 'open');
  it('stand on the practice thread', () => {
    expect(tourStep(opened, screen({ practiceThread: true, options: true }))).toBe('choose');
    expect(tourStep(opened, screen({ practiceThread: true }))).toBe('reply');
  });
  it('do not stand on a real thread while the practice one is still open', () => {
    expect(tourStep(opened, screen({ practiceThread: false, options: true }))).toBeNull();
    expect(tourStep(opened, screen({ practiceThread: false }))).toBeNull();
  });
  it('leave the last tip free to stand over any thread', () => {
    expect(tourStep(closed, screen({ practiceThread: false }))).toBe('palette');
  });
  it('are told which thread is the practice one', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/<Tour tour=\{tour\} practice=\{!!tourTask\} practiceId=\{tourPractice\?\.item \?\? null\} practiceOpen=\{!!focused && focused\.id === tourPractice\?\.item\} /);
  });
});

describe('the end of the walkthrough', () => {
  // Round two and three, 2026-11-22: E on the practice thread is held for Z, and when it also
  // ended the walkthrough the practice project went first, so the held close wrote to a project
  // that was gone ("no such product: practice").
  it('writes a held action on the practice thread before taking its project away', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('const held = pendingRef.current?.item.product === tour.practice.slug ? flushPending().catch(() => {}) : Promise.resolve();');
    expect(app).toContain('void held.then(() => api.firstRunPracticeEnd()).then(() => refreshRef.current?.());');
  });
});

describe('the column beside the app', () => {
  it('says the walkthrough and how far through it you are, and Skip', () => {
    const t = text(column({}));
    expect(t).toContain('Walkthrough 2 of 5');
    expect(t).toContain('Skip walkthrough');
    expect(t).not.toContain('Back to the walkthrough');
  });
  it('says nothing the tip already says', () => {
    expect(text(column({}))).toBe('Agentbox Walkthrough 2 of 5 Skip walkthrough');
  });
  it('lights the step you are on among five', () => {
    const html = column({});
    expect(html.match(/<i class="[^"]*"/g)).toEqual(['<i class="tf-was"', '<i class="tf-is"', '<i class=""', '<i class=""', '<i class=""']);
  });
  it('offers the way back only off the walkthrough’s pages', () => {
    expect(text(column({ away: true }))).toContain('Back to the walkthrough');
  });
  it('reads done at the end, with Close and its key where Skip was, and no way back', () => {
    const t = text(column({ done: ['compose', 'open', 'choose', 'close', 'palette'], now: null, finished: true, away: true }));
    expect(t).toBe('Agentbox Walkthrough Done Close ↵');
  });
  it('keeps Skip at the foot of the column, out of the block that says where you are', () => {
    const html = column({ away: true });
    const body = html.slice(html.indexOf('class="tf-body"'), html.indexOf('class="tf-skip"'));
    expect(body).toContain('Back to the walkthrough');
    expect(body).not.toContain('Skip walkthrough');
    const css = read('renderer/src/components/tour-frame.css');
    expect(css).toMatch(/\.tour-frame \.tf-skip \{[^}]*position: absolute; left: 28px; bottom: 36px;/);
  });
  it('takes a narrow strip on the left, and the app keeps the rest of the window', () => {
    const css = read('renderer/src/components/tour-frame.css');
    expect(css).toMatch(/:root\[data-tour-frame\] \{ --tf-w: 248px;/);
    expect(css).toMatch(/\.tour-frame \{[^}]*position: fixed; left: 0; top: 0; bottom: 0; width: var\(--tf-w\);/);
    expect(css).toMatch(/:root\[data-tour-frame\] #root \{[^}]*position: fixed; top: 12px; left: calc\(var\(--tf-w\) \+ 12px\); right: 12px; bottom: 12px;/);
  });
});

describe('a reply', () => {
  // Round two of the power test, 2026-11-22: a reply to a real thread moved the count on,
  // while the practice answer was still unread.
  const practiceOne = { product: 'practice', id: 'w-practice' };
  const realOne = { product: 'backend', id: 'w-real' };
  it('teaches writing back on the practice thread', () => {
    expect(replyTeaches(sent, practiceOne)).toBe(true);
  });
  it('teaches nothing on a real thread while the walkthrough has a practice one', () => {
    expect(replyTeaches(sent, realOne)).toBe(false);
    expect(replyTeaches(withPractice(startTour(), { slug: 'practice' }), realOne)).toBe(false);
  });
  it('teaches on any thread for a walkthrough with no practice thread, and on none once it is over', () => {
    expect(replyTeaches(startTour(), realOne)).toBe(true);
    expect(replyTeaches(skipTour(sent), practiceOne)).toBe(false);
  });
  it('is what a sent reply asks', () => {
    expect(read('renderer/src/App.tsx')).toContain("if (replyTeaches(tourRef.current, item)) {\n      let t = finishLesson(tourRef.current!, 'reply');");
  });
});

describe('its name in the command bar', () => {
  // A synthetic first-day user, power test 2026-11-22: the column said Walkthrough
  // and ⌘K said "End the tutorial" and "Take the tutorial", and End read as finishing.
  const palette = read('renderer/src/components/Palette.tsx');
  it('is the walkthrough, as the column and the setup call it', () => {
    expect(palette).toContain("label: 'Skip walkthrough'");
    expect(palette).toContain("label: 'Start the walkthrough'");
    expect(palette).not.toMatch(/label: '[^']*tutorial/i);
  });
  it('is still found by the old word', () => {
    expect(palette).toMatch(/id: 'end-tutorial', label: 'Skip walkthrough', keywords: '[^']*tutorial/);
    expect(palette).toMatch(/id: 'tutorial',\s+label: 'Start the walkthrough',\s+hint: '[^']*',\s+keywords: 'tutorial /);
  });
});

describe('the way back', () => {
  const app = read('renderer/src/App.tsx');
  it('is offered from the pages the walkthrough has no tip on', () => {
    expect(app).toMatch(/const walkElsewhere = settingsOpen \|\| teamShown \|\| filesShown \|\| connectionsShown \|\| teammatesShown \|\| roomShown \|\| chatsPlaceShown \|\| search !== null;/);
    expect(app).toMatch(/const walkAway = awayFromWalk\(tour, \{ elsewhere: walkElsewhere, home: homeOpen && !focused && !walkElsewhere, thread: !!focused, practiceThread: !!focused && focused\.id === tourPractice\?\.item \}\);/);
    expect(app).toMatch(/<TourFrame done=\{tour!\.done\} now=\{tourNow\} finished=\{finishing\} away=\{walkAway\} onBack=\{backToWalk\} /);
  });
  it('goes back to where its last tip was, or Home when there was none', () => {
    expect(app).toMatch(/if \(tourNow && !walkAway\) walkSpot\.current = \{ view, home: homeOpen, item: focused \};/);
    // Recorded when the tip changes only: a page change reaches the app before its tip has gone,
    // and Back from Files then went to Home (power test round two, 2026-11-22).
    expect(app).toMatch(/walkSpot\.current = \{ view, home: homeOpen, item: focused \};\n  \}, \[tourNow\]\);/);
    expect(app).toMatch(/const backToWalk = \(\) => \{ const s = walkSpot\.current; openView\(s\?\.view \?\? 'inbox'\); if \(!s \|\| s\.home\) setHomeOpen\(true\); if \(s\?\.item\) setFocused\(s\.item\); \};/);
  });
});
