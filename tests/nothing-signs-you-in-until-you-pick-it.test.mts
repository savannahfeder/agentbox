// LOOKING AT THE COMPUTER NEVER STARTS A SIGN-IN. YOU DO.
//
// Found by the tester on a Linux box, 2026-10-23 (F-12, F-13). A brand new copy
// with Codex on the disk and signed out: press Get started and the ChatGPT
// OAuth page was already open in the browser. "Setting up ChatGPT." then waited
// for ever on two links -- "Open the sign-in page again" and "Show what is
// happening" -- with no Claude anywhere, no way past, and a Back arrow that
// returned to Get started and started the same sign-in over again.
//
// IT WAS ONE LINE AND IT WAS `afterCheck`. One tool found signed out answered
// `{ t: 'setup', plan }`, and the question screen handed that straight to
// `onPick`, which mounts the setup card, which calls `engineSetup('start')` on
// its first render. Nothing between pressing Get started and somebody's browser
// opening on an OAuth page was ever a press of theirs.
//
// WHAT THE FOUNDER'S OWN EARLIER RULE WAS, AND HOW IT SURVIVES. The short cut
// was asked for ("Otherwise they may select something we cant run", 2026-10-09,
// w-ce8c1a9275). That rule is about what the screen KNOWS, not about skipping
// the press: the found screen already says which plan is on the disk ("Sign
// in") and which is not ("Set up"), so nobody picks blind and nobody is sent to
// install what is installed.
//
// What is pinned here:
//
//   - No reading of any computer returns a sign-in to start. `setup` is gone.
//   - A tool on the disk signed out draws the found screen, with both plans on
//     it, and opens no browser until a row is pressed.
//   - Every screen that can stand between a new user and their inbox has a way
//     past it, and so does the setup card while it waits on a browser.
//   - THE CASES THAT MUST NOT MATCH: a computer with something signed in still
//     carries straight on, and an empty computer is still asked the question.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COPY, afterCheck, foundRows, litRow, planRows, readyEngines } from '../renderer/src/plan-setup.ts';
import { PlanQuestion, PlanSetupCard } from '../renderer/src/components/PlanSetup.tsx';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const r = (engine, found, signedIn) => ({ engine, found, signedIn });

/** The tester's machine: Codex on the disk, signed out, no Claude Code at all. */
const CODEX_OUT = [r('claude', false, false), r('codex', true, false)];
const CLAUDE_OUT = [r('claude', true, false), r('codex', false, false)];
const BOTH_OUT = [r('claude', true, false), r('codex', true, false)];
const CODEX_READY = [r('claude', false, false), r('codex', true, true)];
const NOTHING = [r('claude', false, false), r('codex', false, false)];

describe('what a look at the computer is allowed to answer', () => {
  it('never answers with a sign-in to start, whatever it finds', () => {
    for (const readings of [CODEX_OUT, CLAUDE_OUT, BOTH_OUT, CODEX_READY, NOTHING]) {
      expect(afterCheck(readings).t).not.toBe('setup');
    }
  });

  // THE CASE THE TESTER HIT. Something is here, nothing is signed in, so the
  // screen says what it found and waits.
  it('says what it found when a tool is on the disk signed out', () => {
    expect(afterCheck(CODEX_OUT)).toEqual({ t: 'found' });
    expect(afterCheck(CLAUDE_OUT)).toEqual({ t: 'found' });
    expect(afterCheck(BOTH_OUT)).toEqual({ t: 'found' });
  });

  // THE BOUNDARY EITHER SIDE. Signed in is still a yes with no question, and an
  // empty computer is still the question.
  it('still carries on when something is signed in, and still asks an empty computer', () => {
    expect(afterCheck(CODEX_READY)).toEqual({ t: 'ready' });
    expect(afterCheck(NOTHING)).toEqual({ t: 'nothing' });
  });
});

describe('the screen a signed-out computer meets', () => {
  const draw = (found) => renderToStaticMarkup(createElement(PlanQuestion, {
    found, onPick: () => {}, onReady: () => {}, onSkip: () => {}, look: async () => found ?? NOTHING,
  }));

  it('offers Claude as well as ChatGPT, which is what the new-user flow skipped', () => {
    const html = draw(CODEX_OUT);
    expect(html).toContain(COPY.claude);
    expect(html).toContain(COPY.chatgpt);
    expect(html).toContain(COPY.signIn);
    expect(html).toContain(COPY.setUp);
  });

  it('says a browser is about to open before one does', () => {
    expect(COPY.foundOut).toMatch(/browser/i);
    expect(draw(CODEX_OUT)).toContain(COPY.foundOut);
  });

  // AND RETURN RESTS ON THE ONE THAT IS HERE. On the tester's machine the first
  // row is Claude, which is not on the computer, so a blind Return went off to
  // install a second tool beside the one already sitting there.
  it('rests Return on the plan that is on the computer, not on an install', () => {
    expect(litRow(foundRows(CODEX_OUT))).toBe(1);
    expect(litRow(foundRows(CLAUDE_OUT))).toBe(0);
    // Nothing anywhere is still the first row, because there is nothing better.
    expect(litRow(foundRows(NOTHING))).toBe(0);
  });

  // AND THE ROW IT RESTS ON IS REALLY THIS SCREEN'S. A copy opened straight
  // onto the step draws the question for a frame while the look runs, and
  // without a key of its own this is the same mounted list, which keeps the row
  // Return was resting on there. Measured in a browser on the built renderer:
  // the ring sat on Claude on a computer with only Codex on it.
  it('is its own list, not the question’s with different words in it', () => {
    const screen = read('renderer/src/components/PlanSetup.tsx');
    expect(screen).toMatch(/key="found"/);
    expect(screen).toMatch(/key="ask"/);
  });

  // THE CASE THAT MUST NOT MATCH. A computer that is signed in has its own
  // sentence and is not warned about a browser it will never see.
  it('does not warn a computer that is already signed in', () => {
    expect(draw(CODEX_READY)).not.toContain(COPY.foundOut);
    expect(draw(CODEX_READY)).toContain('Your agents will run on your own ChatGPT plan.');
  });
});

describe('the way past', () => {
  it('is on the question, so an empty computer is not held there either', () => {
    const out = planRows().find((x) => x.key === 'skip');
    expect(out?.name).toBe(COPY.notNow);
    expect(out?.other).toBe(true);
  });

  it('is on the found screen whenever nothing on it can run an agent yet', () => {
    expect(foundRows(CODEX_OUT).some((x) => x.key === 'skip')).toBe(true);
    expect(foundRows(BOTH_OUT).some((x) => x.key === 'skip')).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH. The ready row IS the way on, so a second one
  // beside it would be two words for one press.
  it('is not on the found screen when a plan is already signed in', () => {
    expect(foundRows(CODEX_READY).some((x) => x.key === 'skip')).toBe(false);
    expect(readyEngines(CODEX_READY)).toEqual(['codex']);
  });

  it('is on the setup card while it waits on somebody’s browser', () => {
    const html = renderToStaticMarkup(createElement(PlanSetupCard, {
      plan: 'codex', onDone: () => {}, onSkip: () => {}, state: { engine: 'codex', phase: 'signing-in', error: null, log: '' },
    }));
    expect(html).toContain(COPY.skip);
    expect(html).toContain(COPY.openAgain);
  });

  // AND LEAVING STOPS THE SIGN-IN. A `codex login` left running holds a port
  // and reopens a page nobody is waiting on any more.
  it('cancels the sign-in it started when somebody leaves it', () => {
    const screen = read('renderer/src/components/PlanSetup.tsx');
    const fn = screen.slice(screen.indexOf('export function PlanSetupCard'));
    expect(fn).toMatch(/engineSetup\('cancel'/);
  });
});
