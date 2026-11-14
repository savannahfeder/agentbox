// THE WALKTHROUGH ENDS ON HOME AND SAYS YOU FINISHED (w-1e52420829, 2026-11-14).
//
// Someone finished the walkthrough six times and each time said the same
// thing: "It just went from urgent to showing confetti. There was never any
// modal that indicated we were starting the app", "it just goes to this page
// with nothing happening in between". Walked on a throwaway copy: the last tip
// went, the bar above the app went with it, and what was left was the inbox
// with four real threads and confetti. Nothing said the walkthrough was over,
// and the app starts on Home, not there. They also said the walkthrough showed
// no way round the app, no team and no files.
//
// They approved two pictures. The walkthrough's last word is a tip on Home's
// box, where a real thread starts, with the bar reading "Walkthrough done".
// After it a Next card stays on Home until it is done or hidden, pointing at
// the first thread, the team, the tools and the files.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { closeFinish, finishLesson, finishedPlace, firstThreadSent, hideNext, madeUrgent, noteSent, readTour, saveTour, skipTour, startTour, tourFinishing, tourLive, tourOver, type Lesson, type Tour } from '../renderer/src/tour.ts';
import { addedAFile, finishedHello, nextRows, nextShown, saysFinished } from '../renderer/src/home/next-steps.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lessons = (t: Tour, ...ls: Lesson[]) => ls.reduce(finishLesson, t);
const almost = lessons(noteSent(startTour()), 'working', 'open', 'choose', 'close');
const over = finishLesson(almost, 'palette');

describe('the lesson that ends the walkthrough', () => {
  it('starts the finishing moment and the Next card', () => {
    expect(tourOver(over)).toBe(true);
    expect(tourFinishing(over)).toBe(true);
    expect(over.next).toEqual({});
  });
  it('is the urgent tip when a thread was made urgent on the way', () => {
    const urgent = madeUrgent(over);
    expect(tourOver(urgent)).toBe(false);
    expect(tourFinishing(urgent)).toBe(false);
    expect(tourFinishing(finishLesson(urgent, 'urgent'))).toBe(true);
  });
  it('is not any lesson before it', () => {
    expect(tourFinishing(almost)).toBe(false);
    expect(almost.next).toBeUndefined();
  });
  it('is not a walkthrough that was skipped', () => {
    expect(tourFinishing(skipTour(almost))).toBe(false);
    expect(tourFinishing(skipTour(over))).toBe(false);
  });
  // Everyone who finished before this was built has a finished walkthrough saved with neither field.
  it('is not a walkthrough finished before there was a finishing moment', () => {
    const old: Tour = { sent: true, skipped: false, done: over.done };
    expect(tourOver(old)).toBe(true);
    expect(tourFinishing(old)).toBe(false);
    expect(tourFinishing(finishLesson(old, 'palette'))).toBe(false);
    expect(nextShown(old, [])).toBe(false);
  });
  it('does not count as the walkthrough still running', () => {
    expect(tourLive(over)).toBe(false);
  });
});

describe('the finishing moment ends', () => {
  it('when it is closed, and the Next card stays', () => {
    const closed = closeFinish(over);
    expect(tourFinishing(closed)).toBe(false);
    expect(closed.next).toEqual({});
  });
  it('when a first real thread is sent, which the Next card ticks', () => {
    const sent = firstThreadSent(over);
    expect(tourFinishing(sent)).toBe(false);
    expect(sent.next).toEqual({ thread: true });
  });
  it('and a thread sent by someone with no Next card changes nothing', () => {
    const old: Tour = { sent: true, skipped: false, done: over.done };
    expect(firstThreadSent(old)).toBe(old);
    expect(firstThreadSent(almost)).toBe(almost);
  });
  it('and is kept across a restart, with what the Next card knows', () => {
    const kept = new Map<string, string>();
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); } };
    saveTour(store, over);
    expect(tourFinishing(readTour(store))).toBe(true);
    saveTour(store, hideNext(firstThreadSent(over)));
    expect(readTour(store)).toMatchObject({ next: { thread: true, hidden: true } });
    expect(tourFinishing(readTour(store))).toBe(false);
  });
});

describe('where the last tip sits', () => {
  const box = { left: 370, top: 318, width: 760, height: 122 };
  const hello = { left: 370, top: 220 };
  it('rings Home’s box with even room, and stands above the greeting on its left edge', () => {
    expect(finishedPlace(box, hello, 44)).toEqual({ glow: { x: 364, y: 312, w: 772, h: 134 }, left: 370, top: 156 });
  });
  it('stays inside the window on a short one', () => {
    expect(finishedPlace(box, { left: 370, top: 40 }, 44).top).toBe(12);
  });
});

describe('the Next card', () => {
  const none = { thread: false, invited: false, tools: false, files: false, team: true };
  it('has the walkthrough ticked and four things to do, in the approved words', () => {
    expect(nextRows(none)).toEqual([
      { key: 'walkthrough', words: 'Finish the walkthrough', where: '', done: true },
      { key: 'thread', words: 'Start your first thread', where: 'Home', done: false },
      { key: 'team', words: 'Invite your team', where: 'Team', done: false },
      { key: 'tools', words: 'Connect your tools', where: 'Connections', done: false },
      { key: 'files', words: 'Add a file', where: 'Files', done: false },
    ]);
  });
  it('ticks each one from what has really happened', () => {
    const rows = nextRows({ thread: true, invited: true, tools: false, files: true, team: true });
    expect(rows.filter((r) => r.done).map((r) => r.key)).toEqual(['walkthrough', 'thread', 'team', 'files']);
  });
  // Walked: a new team's Files already holds team-look.md, which the app put there, and the line read as done.
  it('counts a file you added, not the team look the app keeps or one an agent wrote', () => {
    expect(addedAFile([{ name: 'team-look.md' }])).toBe(false);
    expect(addedAFile([{ name: 'team-look.md' }, { name: 'report.md', agent: 'Claude Code' }])).toBe(false);
    expect(addedAFile([{ name: 'team-look.md' }, { name: 'pricing.csv' }])).toBe(true);
    expect(addedAFile([])).toBe(false);
  });
  it('does not ask a copy with no team to invite one', () => {
    expect(nextRows({ ...none, team: false }).map((r) => r.key)).toEqual(['walkthrough', 'thread', 'tools', 'files']);
  });
  it('shows once the walkthrough is finished, until it is hidden or every line is done', () => {
    expect(nextShown(over, nextRows(none))).toBe(true);
    expect(nextShown(almost, nextRows(none))).toBe(false);
    expect(nextShown(hideNext(over), nextRows(none))).toBe(false);
    expect(nextShown(over, nextRows({ thread: true, invited: true, tools: true, files: true, team: true }))).toBe(false);
    expect(nextShown(null, nextRows(none))).toBe(false);
  });
});

describe('the greeting on Home', () => {
  it('says you finished, with your first name, in place of the time of day', () => {
    expect(finishedHello('Dana Whitfield')).toBe('You finished the walkthrough, Dana');
    expect(finishedHello(null)).toBe('You finished the walkthrough');
  });
  // The tip above it says the same sentence, and one screen says a thing once.
  it('does not say it while the tip is up', () => {
    expect(saysFinished(over, true)).toBe(false);
  });
  it('says it once the tip is closed, until a first thread is sent or the card is gone', () => {
    expect(saysFinished(closeFinish(over), true)).toBe(true);
    expect(saysFinished(firstThreadSent(over), true)).toBe(false);
    expect(saysFinished(closeFinish(over), false)).toBe(false);
    expect(saysFinished(almost, false)).toBe(false);
  });
});

describe('the window', () => {
  const app = read('renderer/src/App.tsx');
  const tour = read('renderer/src/components/Tour.tsx');
  const frame = read('renderer/src/components/TourFrame.tsx');
  const home = read('renderer/src/home/HomePage.tsx');
  it('keeps the bar above the app through the finishing moment, reading done, with Close where Skip was', () => {
    expect(app).toContain('const tourFramed = !fresh && homeOn && (tourLive(tour) || tourFinishing(tour));');
    expect(frame).toContain("<span>{finished ? 'Walkthrough done' : `Walkthrough ${at} of ${of}`}</span>");
    expect(frame).toContain("{finished ? 'Close' : 'Skip walkthrough'}");
    expect(app).toMatch(/<TourFrame done=\{tour!\.done\} now=\{tourNow\} finished=\{finishing\} onSkip=\{\(\) => setTour\(finishing \? closeFinish\(tour!\) : skipTour\(tour!\)\)\} \/>/);
  });
  it('goes to Home for it, and ends it when you leave Home', () => {
    expect(app).toContain("if (!finishOnHome.current) { if (homeHere) finishOnHome.current = true; else { setModal(null); openView('inbox'); setHomeOpen(true); } return; }");
    expect(app).toContain('if (!homeHere) setTour(closeFinish(tourRef.current!));');
  });
  it('says the approved words on Home’s box', () => {
    expect(tour).toContain('You finished the walkthrough. Type your first real thread and press <K k={CMD} /><K k="↵" />');
    expect(tour).toContain("document.querySelector('.hm-start .tc-card')");
    expect(app).toMatch(/\{finishing && <TourFinished covered=\{/);
  });
  it('ticks the first thread when one is sent, and not for the practice thread', () => {
    const practice = app.indexOf("// The walkthrough's practice thread: no toast and no undo.");
    const first = app.indexOf('if (made?.id && tourRef.current) setTour(firstThreadSent(tourRef.current));');
    expect(first).toBeGreaterThan(practice);
    expect(app.slice(practice, first)).toContain('return;');
  });
  it('draws the Next card where the team card was, and hides it for good on Hide', () => {
    expect(home).toMatch(/\{next \? \(\s*<section className="hm-card hm-glass hm-next" aria-label="Next">/);
    expect(home).toContain('<button type="button" className="hm-link" onClick={next.onHide}>Hide</button>');
    expect(app).toContain('onHide: () => setTour(hideNext(tourRef.current!))');
  });
  it('opens the page each line names', () => {
    expect(app).toMatch(/onGo: \(key\) => \{ if \(key === 'team'\) openChatsPlace\('team'\); else if \(key === 'tools'\) openConnectionsPage\(null\); else if \(key === 'files'\) openFiles\(null\); else/);
  });
});
