// THE BAR SAID AGENTS COULD NOT START WHILE ONE WAS RUNNING (F-132).
//
// A brand new user on a Linux box with Codex on PATH and a signed-in
// auth.json sent their first task. The inbox drew "Agents cannot start until
// they have a plan to run on." across the top, with Set up with Claude and Set
// up with ChatGPT. Seconds later the same page showed the thread WORKING, and
// a few seconds after that a commit permission card. The sentence was false
// while it was on screen, and it was pushing somebody into a setup they did
// not need.
//
// TWO THINGS WERE WRONG AND THEY ARE SEPARATE.
//
//   THE BAR BELIEVED A CHECK THAT NEVER ANSWERED. `readiness` runs the tool's
//   own `login status` with a 15 second deadline; a check that times out, or
//   that cannot be spawned, threw, and both the main process and the renderer
//   turned that into `signedIn: false` -- a definite no built out of no
//   answer. The same was true of a search that came back unsure. This file
//   holds the rule the rest of the app already keeps: "Only a real yes or no;
//   a check that never answered says nothing" (main/engine-setup.mjs), and
//   "an unsure search never takes Claude Code away from anybody"
//   (main/settings.mjs). So a reading now carries `certain`, and only a
//   certain no raises the bar.
//
//   AND A RUNNING AGENT IS PROOF THE SENTENCE IS FALSE. Whatever any probe
//   thinks, a page that is drawing a live run cannot also say agents cannot
//   start. The bar comes down while anything is running and comes back when
//   nothing is.
//
// THE WALK IS DELIBERATELY NOT CHANGED. `needsPlan` still asks the plan
// question on an unsure reading: that screen offers a way past, so asking when
// unsure costs a click. The bar makes an unprompted claim about the app's own
// behaviour, so it has to be sure.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsPlan, sureNoPlan } from '../renderer/src/plan-setup.ts';
import { createEngineSetup } from '../main/engine-setup.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const reading = (found, signedIn, certain = true) => ({ found, signedIn, certain });

/** A tool that answers `login status` with `code`, or never answers at all. */
function machine({ found = true, code = 1, path: at = '/bin/codex', certain = true, hang = false } = {}) {
  return {
    find: async () => ({ found, path: at, certain }),
    spawn: () => ({ exit: hang ? new Promise(() => {}) : Promise.resolve(code), kill() {} }),
  };
}
// The deadline never fires, so the tool's own answer is the one being read.
const quick = { wait: () => new Promise(() => {}), poll: 0, env: {} };

describe('when the bar may say agents cannot start', () => {
  it('says it when both readings certainly found nothing', () => {
    expect(sureNoPlan([reading(false, false), reading(false, false)])).toBe(true);
  });

  // The boundary on one side: a tool sitting on the disk, certainly signed
  // out, is still no plan, and the bar is how somebody gets back into setup.
  it('says it when a tool is here and the sign-in check certainly said no', () => {
    expect(sureNoPlan([reading(true, false), reading(false, false)])).toBe(true);
  });

  // The boundary on the other side.
  it('does not say it when a plan is signed in', () => {
    expect(sureNoPlan([reading(false, false), reading(true, true)])).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH, and the one that was on screen: no answer.
  it('does not say it when a reading never answered', () => {
    expect(sureNoPlan([reading(true, false, false), reading(false, false)])).toBe(false);
    expect(sureNoPlan([reading(false, false, false), reading(false, false, false)])).toBe(false);
  });

  // The walk keeps asking on an unsure reading; only the bar needs certainty.
  it('leaves the walk asking when it cannot be sure', () => {
    expect(needsPlan([reading(true, false, false), reading(false, false, false)])).toBe(true);
  });
});

describe('what a reading of this computer is sure of', () => {
  it('is sure of a no when the tool answered no', async () => {
    const setup = createEngineSetup({ ...quick, ...machine({ code: 1 }) });
    expect(await setup.readiness('codex')).toEqual({ engine: 'codex', found: true, signedIn: false, certain: true });
  });

  it('is sure of a yes when the tool answered yes', async () => {
    const setup = createEngineSetup({ ...quick, ...machine({ code: 0 }) });
    expect(await setup.readiness('codex')).toEqual({ engine: 'codex', found: true, signedIn: true, certain: true });
  });

  // The one that put the bar on screen: `login status` never came back, so the
  // deadline killed it and the error became "signed out".
  it('is sure of nothing when the sign-in check did not answer', async () => {
    const setup = createEngineSetup({
      ...machine({ hang: true }),
      env: {}, poll: 0,
      wait: () => Promise.resolve(),
    });
    const r = await setup.readiness('codex');
    expect(r.certain).toBe(false);
    expect(r.signedIn).toBe(false);
  });

  it('is sure of nothing when the search for the tool was unsure', async () => {
    const setup = createEngineSetup({ ...quick, ...machine({ found: false, certain: false }) });
    expect(await setup.readiness('codex')).toEqual({ engine: 'codex', found: false, signedIn: false, certain: false });
  });

  it('is sure there is nothing when the search certainly found nothing', async () => {
    const setup = createEngineSetup({ ...quick, ...machine({ found: false }) });
    expect(await setup.readiness('claude')).toEqual({ engine: 'claude', found: false, signedIn: false, certain: true });
  });
});

describe('what the inbox does with it', () => {
  const app = read('renderer/src/App.tsx');

  // `planBar` asks `sureNoPlan` and answers null when it cannot be sure, so
  // the certainty rule still decides whether there is a bar at all.
  it('raises the bar off the certain answer, not off the bare reading', () => {
    expect(app).toMatch(/setPlanWords\(planBar\(/);
    expect(app).toMatch(/certain: x\.certain/);
  });

  it('never draws the bar while an agent is running', () => {
    const line = app.split('\n').find((l) => l.includes('<PlanBar'));
    expect(line).toMatch(/!snap\.supervisor\.running\?\.length/);
  });

  // The search is the app's own, so what it is sure of has to survive the trip.
  it('carries what the search was sure of into the setup', () => {
    const ipc = read('main/ipc.mjs');
    expect(ipc).toMatch(/certain: s\.claudeCertain/);
    expect(ipc).toMatch(/certain: s\.certain/);
  });

  // A probe the page could not run is the same no answer, and used to arrive
  // as found: false, signedIn: false -- a definite no made out of a failure.
  it('does not turn a probe it could not run into a certain no', () => {
    const api = read('renderer/src/api.ts');
    const fn = api.slice(api.indexOf('async engineSetup('), api.indexOf('async setProjectSetting('));
    expect(fn.match(/certain: false/g)?.length).toBe(2);
  });
});
