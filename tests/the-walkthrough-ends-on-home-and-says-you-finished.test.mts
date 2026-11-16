// THE WALKTHROUGH ENDS ON HOME AND SAYS YOU FINISHED (w-1e52420829, 2026-11-14).
//
// Someone finished the walkthrough six times and each time said the same
// thing: "It just went from urgent to showing confetti. There was never any
// modal that indicated we were starting the app", "it just goes to this page
// with nothing happening in between". Walked on a throwaway copy: the last tip
// went, the bar above the app went with it, and what was left was the inbox
// with four real threads and confetti. Nothing said the walkthrough was over,
// and the app starts on Home, not there.
//
// They approved a picture of it: the walkthrough's last word is a tip on
// Home's box, where a real thread starts, with the bar reading "Walkthrough
// done". Once the tip has gone, Home's greeting says you finished until a
// first real thread is sent. A card of things to do next was built beside it
// and taken out the same day: "the next card is not needed".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { closeFinish, finishLesson, finishedPlace, firstThreadSent, madeUrgent, noteSent, readTour, saveTour, saysFinished, skipTour, startTour, tourFinishing, tourLive, tourOver, type Lesson, type Tour } from '../renderer/src/tour.ts';
import { finishedHello } from '../renderer/src/home/home-model.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lessons = (t: Tour, ...ls: Lesson[]) => ls.reduce(finishLesson, t);
const almost = lessons(noteSent(startTour()), 'working', 'open', 'choose', 'close');
const over = finishLesson(almost, 'palette');
// Everyone who finished before this was built has a finished walkthrough saved with neither field.
const old: Tour = { sent: true, skipped: false, done: over.done };

describe('the lesson that ends the walkthrough', () => {
  it('starts the finishing moment', () => {
    expect(tourOver(over)).toBe(true);
    expect(tourFinishing(over)).toBe(true);
  });
  it('is the urgent tip when a thread was made urgent on the way', () => {
    const urgent = madeUrgent(over);
    expect(tourOver(urgent)).toBe(false);
    expect(tourFinishing(urgent)).toBe(false);
    expect(tourFinishing(finishLesson(urgent, 'urgent'))).toBe(true);
  });
  it('is not any lesson before it', () => {
    expect(tourFinishing(almost)).toBe(false);
  });
  it('is not a walkthrough that was skipped', () => {
    expect(tourFinishing(skipTour(almost))).toBe(false);
    expect(tourFinishing(skipTour(over))).toBe(false);
  });
  it('is not a walkthrough finished before there was a finishing moment', () => {
    expect(tourOver(old)).toBe(true);
    expect(tourFinishing(old)).toBe(false);
    expect(tourFinishing(finishLesson(old, 'palette'))).toBe(false);
  });
  it('does not count as the walkthrough still running', () => {
    expect(tourLive(over)).toBe(false);
  });
});

describe('the finishing moment ends', () => {
  it('when it is closed', () => {
    expect(tourFinishing(closeFinish(over))).toBe(false);
  });
  it('when a first real thread is sent', () => {
    expect(tourFinishing(firstThreadSent(over))).toBe(false);
  });
  it('and a thread sent by anyone else changes nothing', () => {
    expect(firstThreadSent(old)).toBe(old);
    expect(firstThreadSent(almost)).toBe(almost);
    const sent = firstThreadSent(over);
    expect(firstThreadSent(sent)).toBe(sent);
  });
  // The tip itself is not: tests/the-finished-tip-goes-at-the-first-key-or-click.
  it('and what the greeting says is kept across a restart', () => {
    const kept = new Map<string, string>();
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); } };
    saveTour(store, closeFinish(over));
    expect(tourFinishing(readTour(store))).toBe(false);
    expect(saysFinished(readTour(store))).toBe(true);
    saveTour(store, firstThreadSent(over));
    expect(saysFinished(readTour(store))).toBe(false);
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

describe('the greeting on Home', () => {
  it('says you finished, with your first name, in place of the time of day', () => {
    expect(finishedHello('Dana Whitfield')).toBe('You finished the walkthrough, Dana');
    expect(finishedHello(null)).toBe('You finished the walkthrough');
  });
  // The tip above it says the same sentence, and one screen says a thing once.
  it('does not say it while the tip is up', () => {
    expect(saysFinished(over)).toBe(false);
  });
  it('says it once the tip is closed, until a first real thread is sent', () => {
    expect(saysFinished(closeFinish(over))).toBe(true);
    expect(saysFinished(firstThreadSent(closeFinish(over)))).toBe(false);
    expect(saysFinished(firstThreadSent(over))).toBe(false);
  });
  it('never says it to someone who skipped, has not finished, or finished before this was built', () => {
    expect(saysFinished(skipTour(closeFinish(over)))).toBe(false);
    expect(saysFinished(almost)).toBe(false);
    expect(saysFinished(old)).toBe(false);
    expect(saysFinished(null)).toBe(false);
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
  it('counts a first thread when one is sent, and not the practice thread', () => {
    const practice = app.indexOf("// The walkthrough's practice thread: no toast and no undo.");
    const first = app.indexOf('if (made?.id && tourRef.current) setTour(firstThreadSent(tourRef.current));');
    expect(first).toBeGreaterThan(practice);
    expect(app.slice(practice, first)).toContain('return;');
  });
  it('hands Home the greeting', () => {
    expect(app).toContain('<HomePage hello={!fresh && saysFinished(tour) ? finishedHello(snap.team?.me?.name ?? null) : greeting(');
  });
  it('adds no card to Home', () => {
    expect(home).not.toMatch(/hm-next|aria-label="Next"/);
    expect(app).not.toMatch(/next-steps|nextRows|hideNext/);
  });
});
