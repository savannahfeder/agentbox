// THE WALK TELLS YOU WHAT IT FOUND, ON THE SCREEN THAT WOULD HAVE ASKED.
//
// From a session with a new user, 2026-10-07, in the founder's words: a new user
// came in, started running an agent, and was "like, 'Oh my God, where are the
// tokens coming from? I didn't even connect my account.'"
//
// He was right that nothing said so. The app runs every worker on whichever
// coding agent is already signed in on the computer, and `needsPlan` skipped the
// one screen in the walk that talks about plans at all whenever it found one. So
// the person who had nothing was asked a question, and the person who had
// something was told nothing: the only two outcomes were a question and silence.
//
// THE ANSWER IS THE QUESTION'S OWN OTHER BRANCH. The founder, on the drawing:
// "I think this approach works perfectly and is designed well." One screen, and
// the computer decides which half of it you meet. You get "Which AI plan do you
// pay for?" or you get "Found on this computer.", never both, and never a step
// that only some machines walk.
//
// What is pinned here:
//
//   - A computer with something ready is TOLD, and the sentence names the plan
//     being spent rather than the tool underneath.
//   - The rows are the plan question's own rows, in the same order, carrying
//     what is true of each: signed in, on the disk and signed out, or not here.
//   - The row that is ready is the one Return is on, whichever engine it is.
//   - Pressing the ready row carries on; pressing the other one sets that one
//     up, which is the only other thing this screen can do.
//   - THE CASE THAT MUST NOT MATCH: a computer with nothing ready is still
//     asked, and nothing anywhere claims to have found an account.
//   - No plan tier, ever (w-e217e577e5, the sidebar row that shipped and came
//     straight back out).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  COPY, afterFound, foundLede, foundRows, litRow, planRows, readyEngines,
} from '../renderer/src/plan-setup.ts';
import { PlanQuestion } from '../renderer/src/components/PlanSetup.tsx';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const r = (engine, found, signedIn) => ({ engine, found, signedIn });

/** The machine this screen exists for: Claude signed in, nothing else here. */
const CLAUDE_READY = [r('claude', true, true), r('codex', false, false)];
const CODEX_READY = [r('claude', false, false), r('codex', true, true)];
const BOTH_READY = [r('claude', true, true), r('codex', true, true)];
const NOTHING = [r('claude', false, false), r('codex', false, false)];

describe('what it says it found', () => {
  it('names the plan that will be spent, not the tool that spends it', () => {
    expect(COPY.foundHead).toBe('Found on this computer.');
    expect(foundLede(readyEngines(CLAUDE_READY))).toMatch(/^Your agents will run on your own Claude plan\./);
    expect(foundLede(readyEngines(CODEX_READY))).toMatch(/^Your agents will run on your own ChatGPT plan\./);
    expect(`${COPY.foundHead} ${foundLede(readyEngines(CLAUDE_READY))}`).not.toMatch(/Claude Code|Codex|CLI|terminal/i);
  });

  // AND IT ANSWERS THE OTHER ROW, which is the one nobody asked for. A tester
  // with ChatGPT signed in read "Found on this computer." over a Claude row
  // offering "Set up" and could not tell whether Claude had been looked for or
  // was still something they had to do (2026-10-25, Linux).
  it('says the plan they do not need as well, when there is one', () => {
    expect(foundLede(readyEngines(CODEX_READY))).toBe('Your agents will run on your own ChatGPT plan. You do not need Claude as well.');
    expect(foundLede(readyEngines(CLAUDE_READY))).toBe('Your agents will run on your own Claude plan. You do not need ChatGPT as well.');
  });

  // AND WITH BOTH SIGNED IN THERE IS NO SECOND SENTENCE: there is no row left
  // to answer, and a line saying so would be a line about nothing.
  it('says both when both are signed in, since either one may run the work', () => {
    expect(foundLede(readyEngines(BOTH_READY))).toBe('Your agents will run on your own Claude and ChatGPT plans.');
  });

  // THE CASE THAT MUST NOT MATCH. Nothing is ready, so there is nothing to
  // claim, and this screen is the question instead.
  it('claims nothing at all when nothing is ready', () => {
    expect(readyEngines(NOTHING)).toEqual([]);
    expect(foundLede([])).toBe(null);
  });

  // THE TIER STAYS GONE. A row reading "Claude · Max 20x" shipped on
  // 2026-10-07 and came out the same day: "very critically, I want to get rid
  // of that Claude Max 20x plan."
  // The subs are the plan question's own, and they list which plans qualify:
  // "Pro, Max or a team plan". What must never appear is a tier said about the
  // person, which is what the sidebar row said about them for half a day.
  it('never says which tier they are on, on any row or in any sentence', () => {
    const said = [
      COPY.foundHead, COPY.signedIn, COPY.foundNote,
      foundLede(readyEngines(CLAUDE_READY)), foundLede(readyEngines(BOTH_READY)),
      ...foundRows(BOTH_READY).map((x) => x.right),
    ].join(' ');
    expect(said).not.toMatch(/Max 20x|your Max|your Pro|Pro plan|tier/i);
  });
});

describe('the rows, which are the plan question’s own', () => {
  it('keeps the two plans in the order the question asks them in', () => {
    expect(foundRows(CLAUDE_READY).map((x) => x.key)).toEqual(['claude', 'codex']);
    const asked = planRows().filter((x) => x.plan && x.key !== 'both');
    expect(foundRows(CLAUDE_READY).map((x) => [x.name, x.sub, x.mark]))
      .toEqual(asked.map((x) => [x.name, x.sub, x.mark]));
  });

  // AND NOTHING ELSE IS OFFERED. "Both" is a plan to set up, and "I already
  // have one" is an answer to a question that is not being asked: one was
  // found, which is why this screen is drawn at all.
  it('offers no third plan and no way to point at an install', () => {
    expect(foundRows(CLAUDE_READY)).toHaveLength(2);
    expect(foundRows(CLAUDE_READY).some((x) => x.other)).toBe(false);
  });

  it('ticks the one that is signed in and says so', () => {
    const [claude, chatgpt] = foundRows(CLAUDE_READY);
    expect(claude.right).toBe(COPY.signedIn);
    expect(claude.tick).toBe(true);
    expect(chatgpt.tick).toBeFalsy();
  });

  // THE BOUNDARY EITHER SIDE OF "NOT HERE". A tool on the disk signed out is a
  // sign-in, not an install, and saying "Set up" there offers to install
  // something that is already installed.
  it('tells an install apart from a sign-in on the row that is not ready', () => {
    expect(foundRows(CLAUDE_READY)[1].right).toBe(COPY.setUp);
    expect(foundRows([r('claude', true, true), r('codex', true, false)])[1].right).toBe(COPY.signIn);
  });

  it('puts Return on the row that is ready, whichever one that is', () => {
    expect(litRow(foundRows(CLAUDE_READY))).toBe(0);
    expect(litRow(foundRows(CODEX_READY))).toBe(1);
    expect(litRow(foundRows(BOTH_READY))).toBe(0);
  });
});

describe('what a press does', () => {
  it('carries on when the row that is pressed is the one that is ready', () => {
    expect(afterFound('claude', readyEngines(CLAUDE_READY))).toEqual({ t: 'go' });
    expect(afterFound('codex', readyEngines(CODEX_READY))).toEqual({ t: 'go' });
  });

  it('sets up the other plan when that is the row that is pressed', () => {
    expect(afterFound('codex', readyEngines(CLAUDE_READY))).toEqual({ t: 'setup', plan: 'codex' });
    expect(afterFound('claude', readyEngines(CODEX_READY))).toEqual({ t: 'setup', plan: 'claude' });
  });
});

describe('the screen itself', () => {
  const draw = (found) => renderToStaticMarkup(createElement(PlanQuestion, {
    found, onPick: () => {}, onReady: () => {}, look: async () => found ?? NOTHING,
  }));

  it('tells a computer that is ready, instead of asking it anything', () => {
    const html = draw(CLAUDE_READY);
    expect(html).toContain(COPY.foundHead);
    expect(html).toContain('Your agents will run on your own Claude plan.');
    expect(html).toContain(COPY.signedIn);
    expect(html).not.toContain(COPY.planHead);
  });

  // THE LINE UNDER THE CARD IS ABOUT THE ROW THAT IS NOT TICKED. With both
  // signed in there is nothing left to sign in to, so it says nothing.
  it('drops the line about signing in once there is nothing left to sign in to', () => {
    // The sentence carries two apostrophes, which static markup escapes, so
    // the match is on the part of it that survives being drawn.
    expect(COPY.foundNote).toMatch(/^You sign in on/);
    expect(draw(CLAUDE_READY)).toMatch(/You sign in on/);
    expect(draw(BOTH_READY)).not.toMatch(/You sign in on/);
  });

  // THE CASE THAT MUST NOT MATCH, at the screen. A computer with nothing on it
  // meets the question exactly as it did before any of this.
  it('still asks a computer that has nothing, and tells it nothing', () => {
    const html = draw(null);
    expect(html).toContain(COPY.planHead);
    expect(html).not.toContain(COPY.foundHead);
    expect(html).not.toContain('will run on your own');
  });

  // THE WALK HANDS THE READING IN, so the first frame is already the right
  // screen. Taking its own would draw the question and then replace it, and a
  // headline that changes under somebody is worse than either headline.
  it('is handed what was found by the walk, not left to find out after drawing', () => {
    const walk = read('renderer/src/components/Onboarding.tsx');
    expect(walk).toMatch(/found=\{/);
    // The walk sorts the reading with the screen's own `afterCheck`, so the two
    // cannot disagree about which half of this screen a computer meets.
    expect(walk).toMatch(/afterCheck\(/);
    // And everybody meets the step now, so the walk no longer steps around it.
    expect(walk).not.toMatch(/else onEvent\(\{ t: 'start' \}\)/);
  });
});
