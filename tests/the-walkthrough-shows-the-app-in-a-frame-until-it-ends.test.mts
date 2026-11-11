// THE WALKTHROUGH SHOWS THE APP IN A FRAME UNTIL IT ENDS (w-fbe5e95dea, 2026-11-10).
//
// The founder, on the walkthrough's first tip over Home: "this page as
// mentioned before should not be full screen. there should still be some
// space that kinda indicates to people alright we're still testing". The
// setup showed the app as a window inside its own page; the walkthrough then
// dropped it to the window's full size, so nothing said the practice was
// still practice. While the walkthrough runs the app now sits inset in the
// setup's own ground, with a slim bar above it: the setup's step dashes, how
// far through the walkthrough you are, and Skip. It goes when the walkthrough
// ends or is skipped.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { walkPlace } from '../renderer/src/setup-split.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const frame = fs.readFileSync(new URL('../renderer/src/components/TourFrame.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/components/tour-frame.css', import.meta.url), 'utf8');

describe('how far through the walkthrough you are', () => {
  it('starts at 1 of 5 and moves on with each thing done', () => {
    expect(walkPlace([], null)).toEqual({ at: 1, of: 5 });
    expect(walkPlace(['compose'], 'reply')).toEqual({ at: 3, of: 5 });
    expect(walkPlace(['compose', 'reply', 'open', 'close'], 'palette')).toEqual({ at: 5, of: 5 });
  });
  it('never counts past the end', () => {
    expect(walkPlace(['compose', 'reply', 'open', 'close', 'palette'], null).at).toBe(5);
  });
});

describe('the frame', () => {
  it('is up while the walkthrough runs on a computer, and not during the setup', () => {
    expect(app).toMatch(/const tourFramed = !fresh && homeOn && tourLive\(tour\);/);
    expect(app).toMatch(/if \(tourFramed\) root\.dataset\.tourFrame = ''; else delete root\.dataset\.tourFrame;/);
  });
  it('insets the app on the setup’s ground, rounded, with room above for its bar', () => {
    expect(css).toMatch(/:root\[data-tour-frame\] #root \{[^}]*position: fixed; top: 52px; left: 16px; right: 16px; bottom: 16px;[^}]*border-radius: 14px;/);
    expect(css).toMatch(/:root\[data-tour-frame\]\[data-theme="light"\] \{ --tf-ground: #fff; \}/);
    // A light sky paints the whole body its frame colour (home/home.css); the frame's white wins over it.
    expect(css).toMatch(/html:root\[data-tour-frame\]\[data-theme="light"\] body \{ background: var\(--tf-ground\) !important; \}/);
  });
  it('draws its bar outside the app, where the window can still be dragged', () => {
    expect(app).toMatch(/\{tourFramed && createPortal\(<TourFrame /);
    expect(css).toMatch(/\.tour-frame \{[^}]*-webkit-app-region: drag;/);
    expect(css).toMatch(/\.tour-frame button \{[^}]*-webkit-app-region: no-drag;/);
  });
  it('lets you skip the walkthrough from the bar', () => {
    expect(frame).toMatch(/<button type="button" className="tf-skip" onClick=\{onSkip\}>Skip walkthrough<\/button>/);
    expect(app).toMatch(/onSkip=\{\(\) => setTour\(skipTour\(tour!\)\)\}/);
  });
});
