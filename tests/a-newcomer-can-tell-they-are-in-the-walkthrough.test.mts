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
import { awayFromWalk, finishLesson, skipTour, startTour, withPractice, type Lesson } from '../renderer/src/tour.ts';
import { TourFrame } from '../renderer/src/components/TourFrame.tsx';

globalThis.React = React;
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const column = (props: { done?: Lesson[]; now?: Lesson | null; finished?: boolean; away?: boolean }) =>
  renderToStaticMarkup(React.createElement(TourFrame, { done: props.done ?? ['compose'], now: props.now ?? 'open', finished: props.finished, away: props.away, onBack: () => {}, onSkip: () => {} }));

const sent = finishLesson(withPractice(startTour(), { slug: 'practice', item: 'w-practice' }), 'compose');
const closed = ['open', 'choose', 'close'].reduce((t, l) => finishLesson(t, l as Lesson), sent);

describe('off the walkthrough’s pages', () => {
  it('is a page it has no tip on: Settings, the Team page, Files and the rest', () => {
    expect(awayFromWalk(sent, { elsewhere: true, thread: false, practiceThread: false })).toBe(true);
  });
  it('is not the list, Home or the practice thread', () => {
    expect(awayFromWalk(sent, { elsewhere: false, thread: false, practiceThread: false })).toBe(false);
    expect(awayFromWalk(sent, { elsewhere: false, thread: true, practiceThread: true })).toBe(false);
  });
  it('is a real thread while the walkthrough is still about its practice one', () => {
    expect(awayFromWalk(sent, { elsewhere: false, thread: true, practiceThread: false })).toBe(true);
  });
  it('is not a real thread once the practice one is closed, since the last tip stands over any thread', () => {
    expect(awayFromWalk(closed, { elsewhere: false, thread: true, practiceThread: false })).toBe(false);
  });
  it('is nowhere once the walkthrough is skipped or there is none', () => {
    expect(awayFromWalk(skipTour(sent), { elsewhere: true, thread: false, practiceThread: false })).toBe(false);
    expect(awayFromWalk(null, { elsewhere: true, thread: false, practiceThread: false })).toBe(false);
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
    expect(app).toMatch(/const walkAway = awayFromWalk\(tour, \{ elsewhere: settingsOpen \|\| teamShown \|\| filesShown \|\| connectionsShown \|\| teammatesShown \|\| roomShown \|\| chatsPlaceShown \|\| search !== null, thread: !!focused, practiceThread: !!focused && focused\.id === tourPractice\?\.item \}\);/);
    expect(app).toMatch(/<TourFrame done=\{tour!\.done\} now=\{tourNow\} finished=\{finishing\} away=\{walkAway\} onBack=\{backToWalk\} /);
  });
  it('goes back to where its last tip was, or Home when there was none', () => {
    expect(app).toMatch(/if \(tourNow && !walkAway\) walkSpot\.current = \{ view, home: homeOpen, item: focused \};/);
    expect(app).toMatch(/const backToWalk = \(\) => \{ const s = walkSpot\.current; openView\(s\?\.view \?\? 'inbox'\); if \(!s \|\| s\.home\) setHomeOpen\(true\); if \(s\?\.item\) setFocused\(s\.item\); \};/);
  });
});
