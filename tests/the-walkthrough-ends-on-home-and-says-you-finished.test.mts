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
// Home's box, with the bar reading "Walkthrough done". A card of things to do
// next was built beside it and taken out the same day: "the next card is not
// needed".
//
// 2026-11-16, after they finished it in a real window. The tip told you to
// type a first thread and send it, and nothing else ended it: "it should be
// more like, 'Hit Enter to finish it' ... something really simple that does
// the equivalent of hitting the close button". ↵ closes it now. The gold ring
// round Home's box pointed at where to type, which the tip no longer asks
// for, so it went too: "I don't like that it stays with this gold highlight".
// Home's greeting also said you finished once the tip had gone, and that came
// out: "I don't like the idea of the header saying, 'You finished the walkthrough.'"
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { FINISH_MS, closeFinish, finishLesson, finishedPlace, madeUrgent, noteSent, skipTour, startTour, tourFinishing, tourLive, tourOver, type Lesson, type Tour } from '../renderer/src/tour.ts';
import * as homeModel from '../renderer/src/home/home-model.ts';
import * as tourRules from '../renderer/src/tour.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lessons = (t: Tour, ...ls: Lesson[]) => ls.reduce(finishLesson, t);
const almost = lessons(noteSent(startTour()), 'working', 'open', 'choose', 'close');
const over = finishLesson(almost, 'palette');
// Everyone who finished before this was built has a finished walkthrough saved without the field.
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
    expect(tourOver(closeFinish(over))).toBe(true);
  });
  it('and closing changes nothing else', () => {
    expect(closeFinish(over)).toEqual({ ...over, finishing: false });
  });
  // 2026-11-16: "I'm on this page and it still seems to show this. Only when I
  // hit Close does it actually do something." It goes by itself after a beat.
  it('by itself after a few seconds', () => {
    expect(FINISH_MS).toBeGreaterThanOrEqual(5000);
    expect(FINISH_MS).toBeLessThanOrEqual(10_000);
  });
});

describe('where the last tip sits', () => {
  it('stands above the greeting on its left edge', () => {
    expect(finishedPlace({ left: 370, top: 220 }, 44)).toEqual({ left: 370, top: 156 });
  });
  it('stays inside the window on a short one', () => {
    expect(finishedPlace({ left: 370, top: 40 }, 44).top).toBe(12);
  });
  it('lights nothing on Home', () => {
    const tour = read('renderer/src/components/Tour.tsx');
    const finished = tour.slice(tour.indexOf('export function TourFinished'), tour.indexOf('export function Tour('));
    expect(finished).not.toContain('tour-glow');
    expect(read('renderer/src/components/tour.css')).not.toContain('tour-glow-box');
  });
});

describe('the greeting on Home', () => {
  const app = read('renderer/src/App.tsx');
  it('is the time of day, during the finishing moment and after it', () => {
    expect(app).toContain('<HomePage hello={greeting(new Date(now).getHours(), snap.team?.me?.name ?? null)} now={now}');
  });
  it('has no way left to say you finished', () => {
    expect(Object.keys(homeModel)).not.toContain('finishedHello');
    expect(Object.keys(tourRules)).not.toContain('saysFinished');
    expect(Object.keys(tourRules)).not.toContain('firstThreadSent');
    expect(app).not.toMatch(/finishedHello|saysFinished|firstThreadSent/);
    expect(read('renderer/src/tour.ts')).not.toMatch(/\bgreets\b/);
  });
});

describe('the window', () => {
  const app = read('renderer/src/App.tsx');
  const tour = read('renderer/src/components/Tour.tsx');
  const frame = read('renderer/src/components/TourFrame.tsx');
  const home = read('renderer/src/home/HomePage.tsx');
  it('keeps the column beside the app through the finishing moment, reading done, with Close where Skip was', () => {
    expect(app).toContain('const tourFramed = !fresh && homeOn && (tourLive(tour) || tourFinishing(tour));');
    expect(frame).toContain("<h2 className=\"tf-place\"><b>Walkthrough</b>{finished ? 'Done' : `${at} of ${of}`}</h2>");
    expect(frame).toContain("{finished ? <>Close <kbd className=\"tf-key\">↵</kbd></> : 'Skip walkthrough'}");
    expect(app).toMatch(/<TourFrame done=\{tour!\.done\} now=\{tourNow\} finished=\{finishing\} away=\{walkAway\} onBack=\{backToWalk\} onSkip=\{\(\) => setTour\(finishing \? closeFinish\(tour!\) : skipTour\(tour!\)\)\} \/>/);
  });
  it('shows the same key beside Close, as a key and only once the walkthrough is done', () => {
    const css = read('renderer/src/components/tour-frame.css');
    expect(css).toMatch(/\.tour-frame \.tf-key \{[^}]*border: 1px solid rgba\(var\(--tour-gold\), \.7\); border-radius: 6px;/);
    expect(css).toMatch(/\.tour-frame\.tf-done \.tf-skip \{ display: inline-flex; align-items: center; gap: 8px; color: var\(--text\); \}/);
    expect(frame.match(/tf-key/g)).toHaveLength(1);
  });
  it('goes to Home for it, and ends it when you leave Home', () => {
    expect(app).toContain("if (!finishOnHome.current) { if (homeHere) finishOnHome.current = true; else { setModal(null); openView('inbox'); setHomeOpen(true); } return; }");
    expect(app).toContain('if (!homeHere) setTour(closeFinish(tourRef.current!));');
  });
  // Their pick of five drawn in the running app: the tip alone above the
  // greeting, in these words, "and then it would be nice if the close in the
  // top corner also had a little enter icon beside it".
  it('says you finished and names the one key that closes it, above Home’s greeting', () => {
    expect(tour).toContain('You finished the walkthrough. Press <K k="↵" /> to close');
    expect(tour).not.toContain('Type your first real thread');
    expect(tour).toContain("document.querySelector('.hm-hello')");
    expect(app).toMatch(/\{finishing && <TourFinished covered=\{/);
  });
  it('ends the finishing moment by itself after a few seconds', () => {
    expect(app).toContain('const gone = setTimeout(() => { if (tourRef.current?.finishing) setTour(closeFinish(tourRef.current)); }, FINISH_MS);');
  });
  // 2026-11-16, of the list under the inbox's box: "those suggestions look
  // really weird on that background. We don't need suggestions anymore."
  it('hands the box no suggestions', () => {
    expect(app).not.toMatch(/ideas=\{/);
    expect(app).not.toMatch(/FIRST_IDEAS/);
  });
  it('adds no card to Home', () => {
    expect(home).not.toMatch(/hm-next|aria-label="Next"/);
    expect(app).not.toMatch(/next-steps|nextRows|hideNext/);
  });
});
