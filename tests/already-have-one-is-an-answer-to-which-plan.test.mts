// "I ALREADY HAVE ONE" IS AN ANSWER TO THE PLAN QUESTION, AND THE GATE IS A
// LIST RATHER THAN THREE BUTTONS.
//
// The first draft of w-ce8c1a9275 put "point at the file yourself" on the
// walk's last card as a third button beside Get Claude Code and Check again.
// The founder, on the photograph of it: "UI wise this is very rough. In
// onboarding we already have a component for geting setup/selecting your
// harness I feel like that's a better design an dpossibly placement."
//
// They are right on both counts and the second one is the interesting one.
//
// PLACEMENT. The walk already asks "Which AI plan do you pay for?" on exactly
// the Mac this door exists for -- one where nothing can run an agent yet
// (w-9f6975906c) -- and it already carries an answer for somebody who cannot
// answer it: "I am not sure, check this computer for me". "I already have one,
// it is just somewhere you did not look" is another answer to that same
// question, and it belongs beside that one rather than three screens later.
//
// DESIGN. `PlanQuestion` is a titled page with a card of rows: a mark, a name,
// a sentence, arrows and Enter, and no Submit. Three raw buttons in a row was a
// second vocabulary for the same moment, on the one card in the app that will
// not let anybody past it.
//
// What this pins:
//
//   - The row exists, in the plan question, in the group with "check this
//     computer for me" rather than among the three plans.
//   - The rows are DATA, out of ../renderer/src/plan-setup, so what the screen
//     offers is testable without a window. They were built inline in the
//     component, where nothing could read them.
//   - The gate's three moves are the same list, not three buttons.
//   - The plans themselves are untouched: this adds an answer, it does not
//     reword the question.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY, planRows } from '../renderer/src/plan-setup.ts';
// The gate's rows live with the gate's own words, and share exactly one
// sentence with the plan question: "I already have one".
import { COPY as WALK, gateRows } from '../renderer/src/onboarding.ts';

const INSTALL = 'https://code.claude.com/docs/en/setup';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('the plan question takes one more answer', () => {
  it('still asks the same question, with the same three plans in the same order', () => {
    expect(COPY.planHead).toBe('Which AI plan do you pay for?');
    expect(planRows().filter((r) => r.plan).map((r) => r.name)).toEqual(['Claude', 'ChatGPT', 'Both']);
  });

  // THE NEW ANSWER. Not a plan, so it sits under the rule rather than among
  // the things somebody pays for.
  it('offers "I already have one" as the one answer that is not a plan', () => {
    const rows = planRows();
    const mine = rows.find((r) => r.key === 'mine');
    expect(mine).toBeTruthy();
    expect(mine.plan).toBeUndefined();
    expect(mine.name).toBe(COPY.haveOne);
    // Two rows under the rule since w-8656bdd97d: showing us where one is, and
    // not doing any of this now. Neither is a plan, which is what the rule
    // separates them for.
    expect(rows.filter((r) => r.other).map((r) => r.key)).toEqual(['mine', 'skip']);
  });

  // THE COMPUTER IS ASKED BY THE SCREEN, NOT BY A ROW, since 2026-10-09: the
  // look runs on arrival, so by the time anybody reads these rows it has
  // already happened. tests/the-plan-question-looks-while-it-asks holds that.
  it('asks the computer itself, and only then asks the person', () => {
    expect(planRows().map((r) => r.key)).toEqual(['claude', 'codex', 'both', 'mine', 'skip']);
  });

  // THE CASE THAT MUST NOT MATCH, and it cost a round: a row in the separated
  // group carries NO second line. `.fr-folder-other .fr-folder-name` spans the
  // sub's own grid column, so a sub on one of these is squeezed against the
  // right edge and clipped mid-word -- measured on the first render of this,
  // which drew "Pick it on thi…". Both lists, because the rule is the card's.
  it('never puts a second line on a row in the separated group', () => {
    for (const row of [...planRows(), ...gateRows(INSTALL)]) {
      if (row.other) expect(row.sub, `${row.key} carries a sub`).toBeUndefined();
    }
  });

  it('says it in English, with no word anybody would have to look up', () => {
    for (const row of planRows()) {
      for (const jargon of ['binary', 'PATH', 'shell', 'CLI', 'executable', 'symlink', 'harness']) {
        expect(row.name, `${row.key} says "${jargon}"`).not.toContain(jargon);
        expect(row.sub ?? '', `${row.key} says "${jargon}"`).not.toContain(jargon);
      }
    }
  });

  it('is wired to the picker rather than drawn and left dead', () => {
    const screen = read('renderer/src/components/PlanSetup.tsx');
    expect(screen).toMatch(/planRows\(\)/);
    expect(screen).toMatch(/api\.engineBin/);
  });
});

/* ----------------------------- and the gate ------------------------------ */

// THE LAST CARD OF THE WALK, which is the one screen that will not let anybody
// past it, so it is the worst place in the app to be hard to read.
describe('the gate is the same list, not three buttons', () => {
  const walk = read('renderer/src/components/Onboarding.tsx');

  it('offers three moves, in the order they are worth trying', () => {
    expect(gateRows(INSTALL).map((r) => r.key)).toEqual(['get', 'check', 'mine']);
  });

  // Install first, because most people here really do not have one. Pointing at
  // a file they have not got is no use to them.
  it('leads with getting one, and keeps pointing at a file last', () => {
    const rows = gateRows(INSTALL);
    expect(rows[0].name).toBe(WALK.missingLink);
    expect(rows[2].name).toBe(COPY.haveOne);
  });

  // THE SAME ANSWER IS THE SAME SENTENCE. Two wordings of "I already have one"
  // on two screens of one walk is how a person starts wondering whether they
  // are two different things.
  it('words the last row exactly as the plan question words it', () => {
    expect(gateRows(INSTALL)[2].name).toBe(planRows().find((r) => r.key === 'mine').name);
  });

  // THE ADDRESS STAYS IN THE PAGE. It was an <a href> before this redraw and a
  // row that merely calls window.open cannot be copied, middle-clicked or read
  // by anything that reads pages. tests/the-claude-code-line-almost-never-
  // comes-up is what caught it going missing.
  it('keeps the install row a real link', () => {
    expect(gateRows(INSTALL)[0].href).toBe(INSTALL);
    expect(gateRows(INSTALL)[1].href).toBeUndefined();
    expect(gateRows(INSTALL)[2].href).toBeUndefined();
  });

  it('draws them as the plan question draws its rows', () => {
    expect(walk).toMatch(/fr-card fr-folders/);
    // THE CASE THAT MUST NOT MATCH: the old three-button row is gone, not
    // merely hidden behind the new one.
    expect(walk).not.toMatch(/fr-gate-acts/);
  });

  // A SEARCH CAN TAKE SEVERAL SECONDS, and the row that was pressed is the only
  // honest place to say so. The three buttons this list replaced swapped their
  // own labels; losing that would be a press that looks like nothing happened.
  it('says which one is working, on the row that was pressed', () => {
    const looking = gateRows(INSTALL, { checking: true });
    expect(looking[1].name).toBe(WALK.gateChecking);
    expect(looking[2].name).toBe(COPY.haveOne);
    const choosing = gateRows(INSTALL, { pointing: true });
    expect(choosing[2].name).toBe(WALK.gatePointing);
    expect(choosing[1].name).toBe(WALK.gateCheck);
  });

  it('still refuses to open an inbox from here', () => {
    // Nothing in the gate ends the walk; that is `mayOpenInbox`'s job and it is
    // untouched. The rows are three ways to get an agent and no way past.
    expect(gateRows(INSTALL).some((r) => /open|skip|continue|inbox/i.test(r.key))).toBe(false);
  });
});
