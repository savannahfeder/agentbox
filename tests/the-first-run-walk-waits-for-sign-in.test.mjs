// THE FIRST-RUN WALK WAITS UNTIL SOMEBODY IS SIGNED IN.
//
// 2026-10-04, the second report from the first teammate to install the team
// version: after the fix that gave the Google sign-in a waiting page, she
// pulled it, clicked Continue with Google several times and "nothing changed
// on screen", with not one "team: Google sign-in:" line in the terminal. The
// press was never reaching the page.
//
// Measured in a copy booted as a new user: the first-run walk is drawn UNDER
// the sign-in page (z-index 300 against 900), invisible but live. On its
// guided steps it holds every press that is not on the thing it points at
// (Onboarding.tsx, HELD_EVENTS on the window, capture phase,
// stopImmediatePropagation). The same mouse event on the Google button:
//   walk on "welcome" -> the page turned to "Finish in your browser";
//   walk on "make"    -> nothing, and nothing in the terminal.
// A real mouse click through macOS did the same. And the walk gets to its
// guided steps behind the page by itself: Return in the email or password
// field went to the walk's "Get started" (it moved welcome -> folder and the
// sign-in form never submitted), and the walk is saved, so every restart
// resumed it right where it held the clicks.
//
// So with a team configured and nobody signed in, the walk neither starts nor
// draws; it picks up where it was once the person is signed in.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(ROOT, 'renderer/src/App.tsx'), 'utf8');

describe('the first-run walk and the sign-in page', () => {
  it('knows when a team build has nobody signed in, including while it is still finding out', () => {
    const def = app.match(/const walkWaitsForSignIn = ([^;]+);/);
    expect(def).not.toBeNull();
    expect(def[1]).toContain('snap?.team?.configured');
    expect(def[1]).toContain('!snap.team.signedIn');
    // not only once the first look is over: the walk was clickable in that gap
    expect(def[1]).not.toContain('started');
  });

  it('does not start the walk then', () => {
    const start = app.slice(app.indexOf('WHETHER IT RUNS AT ALL'), app.indexOf('WHETHER IT RUNS AT ALL') + 600);
    expect(start).toMatch(/if \(walkWaitsForSignIn\) return;/);
  });

  it('does not draw the walk or the practice band then, so neither can hold a press or a key', () => {
    expect(app).toMatch(/\{run && !modeDraft && !walkWaitsForSignIn && \(\s*<Onboarding/);
    expect(app).toMatch(/\{inPractice && !walkWaitsForSignIn && <PracticeBand \/>\}/);
  });

  it('a single-person build (no team cloud) still walks as before', () => {
    // walkWaitsForSignIn is false whenever no team is configured
    expect(app).toMatch(/const walkWaitsForSignIn = !api\.isFixtures && !!snap\?\.team\?\.configured &&/);
  });
});
