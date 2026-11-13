// THE PLAN QUESTION LOOKS AT THE COMPUTER WHILE IT ASKS.
//
// The founder, on a photograph of the question with its five rows: "Oh I see. I
// would think this step is actually better fit also checking first at the same
// time. Otherwise they may select something we cant run. Best to figure it out
// now."
//
// THE GAP THEY SPOTTED IS REAL AND IT IS IN THE DATA, not in the drawing.
//
// The walk probes both engines at the WELCOME step (`askMac` in
// components/Onboarding.tsx) and then throws almost all of it away: it reduces
// the two readings to `needsPlan`, one boolean, which is true whenever nothing
// is both found AND signed in. `afterCheck` -- tested since w-9f6975906c and
// right all along -- can tell three cases apart from exactly the same two
// readings:
//
//   ready    something is here and signed in, so there is no question to ask
//   found    a tool IS on this computer, just signed out, so the screen already
//            knows which plan is here and which is not
//   nothing  the machine really is empty, and the question is the right one
//
// Only `nothing` was ever reaching the screen as a question worth asking. On a
// machine with Codex sitting on the disk signed out, the walk drew three plans
// and let somebody pick Claude -- and then went off to install Claude Code,
// which is the "select something we cant run" in their note.
//
// WHAT `found` MEANT UNTIL 2026-10-24, AND WHY IT DOES NOT NOW (w-8656bdd97d).
// It was `{ t: 'setup', plan }`, handed straight to `onPick`, which mounts the
// setup card, which starts the tool's own login on its first render. A tester
// on a fresh Linux copy pressed Get started and had a ChatGPT OAuth page open
// in the browser with nothing in between. The founder's rule survives whole: it
// is about what the screen KNOWS, and the found screen says it on the rows --
// Sign in beside the plan that is on the disk, Set up beside the one that is
// not -- so nobody picks blind. Knowing which plan somebody has is not the same
// as signing them in to it without being asked.
//
// So the step runs `afterCheck` ON ARRIVAL, against the reading the welcome
// step already took, and only asks when asking is the honest thing to do.
//
// AND "CHECK THIS COMPUTER FOR ME" IS GONE AS A ROW, because it is what the
// screen now does by itself. A row that re-runs something already done is a
// button that cannot change its own answer.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY, planRows, planNote, afterCheck } from '../renderer/src/plan-setup.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const r = (engine, found, signedIn) => ({ engine, found, signedIn });

describe('it looks before it trusts the answer', () => {
  // The three readings `afterCheck` already told apart, and the two that must
  // never reach the question. These are not new rules; what is new is that the
  // screen acts on them instead of a boolean made out of them.
  it('does not ask at all when a tool is here and signed in', () => {
    expect(afterCheck([r('claude', false, false), r('codex', true, true)])).toEqual({ t: 'ready' });
  });

  it('does not ask when the answer is on the disk already, signed out', () => {
    expect(afterCheck([r('claude', false, false), r('codex', true, false)])).toEqual({ t: 'found' });
  });

  it('asks only when the computer really is empty', () => {
    expect(afterCheck([r('claude', false, false), r('codex', false, false)])).toEqual({ t: 'nothing' });
  });

  // THE WIRING, which is the whole of the change. The question runs the look on
  // arrival and hands the three answers to the three things that handle them,
  // rather than waiting for somebody to press a row.
  it('runs the look when the screen opens, not when a row is pressed', () => {
    const screen = read('renderer/src/components/PlanSetup.tsx');
    const fn = screen.slice(screen.indexOf('export function PlanQuestion'), screen.indexOf('export function PlanSetupCard'));
    expect(fn).toMatch(/useEffect/);
    expect(fn).toMatch(/afterCheck/);
    // And it reuses the reading the welcome step already took, rather than
    // spending a second pair of probes on the same two questions.
    expect(fn).toMatch(/look/);
  });

  it('is handed that reading by the walk rather than taking its own', () => {
    const walk = read('renderer/src/components/Onboarding.tsx');
    // `askMac` keeps the readings now, not the boolean it used to reduce them
    // to, so the question has the answer the instant it is drawn -- and the
    // walk sorts them with the same `afterCheck` the screen does, rather than
    // with a second rule of its own that could disagree with it.
    expect(walk).toMatch(/afterCheck\(/);
    expect(walk).toMatch(/look=\{askMac\}/);
  });

  // THE CACHE IS THE POINT OF HANDING IT IN, AND IT IS ALSO THE TRAP. Pointing
  // at a file changes the very thing the reading is OF, so the press that
  // changes it has to ask again; reading back the cached answer would report
  // the machine as it was before the press and leave somebody looking at
  // "nothing is set up" having just set something up.
  it('looks again after a file is chosen, instead of reading its own cache', () => {
    const walk = read('renderer/src/components/Onboarding.tsx');
    expect(walk).toMatch(/askMac = \(fresh = false\)/);
    expect(walk).toMatch(/if \(fresh \|\| !asked\.current\)/);
    const screen = read('renderer/src/components/PlanSetup.tsx');
    expect(screen).toMatch(/await check\(true\)/);
  });

  // AND THE ARRIVAL LOOK RUNS ONCE. `onReady` is written inline at the call
  // site, so it is a new function on every render of the walk; without the ref
  // the effect re-fires on each one and the step probes the machine in a loop
  // for as long as somebody sits on it.
  it('runs the arrival look once, not once per render of the walk', () => {
    const screen = read('renderer/src/components/PlanSetup.tsx');
    const fn = screen.slice(screen.indexOf('export function PlanQuestion'), screen.indexOf('export function PlanSetupCard'));
    expect(fn).toMatch(/if \(asked\.current\) return;/);
    expect(fn).toMatch(/asked\.current = true;/);
  });
});

describe('what the one line underneath says', () => {
  it('says it is looking, while it is', () => {
    expect(planNote({ looking: true })).toEqual({ text: COPY.checking, bad: false });
  });

  // NOT AN ERROR. An empty computer is the ordinary case for this screen and
  // the question above is exactly the right question for it.
  it('says the computer is empty once it knows, and does not call that a fault', () => {
    expect(planNote({ looked: true })).toEqual({ text: COPY.nothingHere, bad: false });
  });

  it('says what went wrong when a chosen file is not something agents can run', () => {
    expect(planNote({ refused: true })).toEqual({ text: COPY.notThatOne, bad: true });
  });

  // Before the look lands, the quiet line is the promise about passwords, which
  // is what this screen said before any of this.
  it('keeps the password line as the resting state', () => {
    expect(planNote({})).toEqual({ text: COPY.privacy, bad: false });
  });

  // A refusal is the newest thing that happened, so it wins over the rest.
  it('lets the newest thing win', () => {
    expect(planNote({ looking: true, looked: true, refused: true }).text).toBe(COPY.notThatOne);
    expect(planNote({ looking: true, looked: true }).text).toBe(COPY.checking);
  });
});

describe('the rows the question is left with', () => {
  // AND THE WAY PAST IT (w-8656bdd97d). This screen had none, so a new user
  // who did not want to sign in right now was held on the walk's one
  // unskippable step; `PlanBar` on the inbox is where Not now comes back.
  it('is the three plans, the one way out and the way past', () => {
    expect(planRows().map((x) => x.key)).toEqual(['claude', 'codex', 'both', 'mine', 'skip']);
  });

  // THE CASE THAT MUST NOT MATCH. "I am not sure, check this computer for me"
  // is what the screen does by itself now, so a row offering it is a button
  // that cannot change its own answer.
  it('no longer offers to check the computer, because it already did', () => {
    expect(planRows().some((x) => x.key === 'check')).toBe(false);
    expect('notSure' in COPY).toBe(false);
    expect(read('renderer/src/components/PlanSetup.tsx')).not.toMatch(/notSure/);
  });

  it('keeps showing it where one is, which no amount of looking can replace', () => {
    const mine = planRows().find((x) => x.key === 'mine');
    expect(mine.name).toBe(COPY.haveOne);
    expect(mine.other).toBe(true);
  });
});
