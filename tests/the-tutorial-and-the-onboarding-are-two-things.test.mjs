// THE TUTORIAL AND THE ONBOARDING ARE TWO THINGS.
//
// In an onboarding session with a non-technical tester, the tester finished
// the practice round and wanted to start it again, and expected a "go back to
// practice" control to do that.
//
// The tester only got there by being told out loud, mid-call, and what they
// were sent to was the wrong thing anyway: ⌘K's one row starts at the welcome
// screen and asks somebody who has used Agentbox for a week where their code
// is and what to call a project they already have.
//
// That came down to three asks: a practice round that can be rerun on its
// own, kept apart from the full onboarding, and findable from ⌘K.
//
// One file, three describes, one per ask. Everything here is a claim about
// behaviour rather than about wording, EXCEPT where the wording is the
// behaviour: the last card tells people to type a word, and the word has to be
// the word that finds the row.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COPY, IN_PRACTICE, START, STEPS, afterCommand, coach, practising, tutorialRun,
} from '../renderer/src/onboarding.ts';
import { comeBackTo, neverOffered, offerOnNewProject, rememberOffered } from '../renderer/src/tutorial.ts';
import { matchesQuery } from '../renderer/src/palette-rows.ts';
import { NAME, Name } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const palette = read('renderer/src/components/Palette.tsx');
const card = read('renderer/src/components/TutorialOffer.tsx');

/**
 * A localStorage that is a plain Map, so the offer's one bit can be driven
 *  without a window. Same shape the walk's own storage tests use. */
const store = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};

/**
 * The two rows, sliced out of the palette by id, in the shape ⌘K matches on.
 *  Read out of the source rather than written down here, because the whole
 *  point of this file is that the two rows and the walk's last card cannot
 *  drift apart. */
function row(id) {
  const from = palette.indexOf(`id: '${id}'`);
  expect(from, `no ⌘K row called ${id}`).toBeGreaterThan(-1);
  const chunk = palette.slice(from, from + 900);
  // BOTH QUOTE STYLES AND THE NAME FILLED IN, because a row whose words name
  // the app is a template literal now rather than a quoted string. Reading only
  // `'...'` came back empty, and an empty label passes nothing while looking
  // like it passed.
  const field = (key) => {
    const m = new RegExp(key + ": (?:'([^']*)'|`([^`]*)`)").exec(chunk);
    return String(m?.slice(1).find(Boolean) ?? '')
      .replaceAll('${NAME}', NAME).replaceAll('${Name}', Name);
  };
  return {
    label: field('label'),
    hint: field('hint'),
    keywords: field('keywords'),
    src: chunk,
  };
}

const TUTORIAL = row('tutorial');
const ONBOARDING = row('first-run');

/* ========================================================================== */
/* ASK ONE: "it should have given her the tutorial screen as she made a new    */
/* project."                                                                  */
/* ========================================================================== */

describe('1. the tutorial offers itself when somebody makes a new project', () => {
  it('is offered on a project the store really took, and never on a failure', () => {
    // Nothing is offered off the back of a refusal. The new project card stays
    // open holding what was typed, and a question over the top of that is a
    // second thing to answer while the first one is unresolved.
    expect(offerOnNewProject({ made: true, walking: false, offered: false })).toBe(true);
    expect(offerOnNewProject({ made: false, walking: false, offered: false })).toBe(false);
  });

  it('is never offered in the middle of the onboarding, which makes projects itself', () => {
    // The walk makes a project on its way through. A card offering the practice
    // round to somebody eight beats into the practice round would be the app
    // interrupting itself.
    expect(offerOnNewProject({ made: true, walking: true, offered: false })).toBe(false);
  });

  /*
   * HOW LOUDLY, AND TO WHOM. a person making their fifth
     project must not be offered a tutorial the same way a person making their
     first is, and nothing may read as nagging.

     THE RULE IS NOT A COUNT OF PROJECTS, and that is the judgement this file
     pins. a tester was not on her first project — she had walked the whole
     onboarding and had projects already — and she is exactly who the offer is
     for. What separates her from the power user on their fifth is not how many
     projects they have; it is whether this app has ever ASKED them. */
  it('asks once, ever, and never again once it has been answered either way', () => {
    const s = store();
    expect(neverOffered(s)).toBe(true);
    rememberOffered(s);
    expect(neverOffered(s)).toBe(false);
    // And the second answer is the same answer: nothing here counts.
    rememberOffered(s);
    expect(neverOffered(s)).toBe(false);
  });

  it('writes the bit on BOTH buttons, so turning it down is an answer too', () => {
    // An offer that only remembers being accepted comes back on the next
    // project, which is the nagging she refuses.
    const started = app.slice(app.indexOf('const startTutorial = useCallback'), app.indexOf('}, []);', app.indexOf('const startTutorial = useCallback')));
    expect(started).toContain('rememberOffered(localStorage)');
    const declined = app.slice(app.indexOf('<TutorialOffer'), app.indexOf('<TutorialOffer') + 1400);
    expect(declined).toContain('onNot={');
    expect(declined).toContain('rememberOffered(localStorage)');
  });

  it('counts a walk that really showed somebody around, and not one that was skipped', () => {
    // `practised` is the flag, and the two callers that set it are the finish
    // card and the import card. The quiet way out passes nothing, on purpose:
    // somebody who skipped has seen none of the practice, and the next project
    // they make is exactly the moment they might want it after all.
    expect(app).toContain('if (practised) rememberOffered(localStorage);');
    expect(app).toContain('onDone={(chosen) => finishRun(chosen, { practised: true })}');
    expect(app).toContain('finishRun([], { filed: added, practised: true });');
    expect(app).toContain("onLeave={() => finishRun([], { celebrate: false })}");
    const out = app.slice(app.indexOf('<WayOut'), app.indexOf('<WayOut') + 400);
    expect(out).not.toContain('practised');
  });

  it('is a card over her own app, not a screen that takes the window away', () => {
    // The setup screens are corner to corner and opaque (`.fr-screen`), and
    // they are right to be: there is nothing behind them worth seeing. A person
    // who just made their fourth project has an inbox with work in it.
    expect(card).toContain('className="fr-stay-scrim"');
    expect(card).toContain('className="fr-stay"');
    expect(card).not.toContain('fr-screen');
  });

  it('is two lines and two buttons, which is the way-out card\'s own shape', () => {
    // Same register, so it is the same card rather than a second design of
    // one. Nothing was added to styles.css for it.
    expect(card).toContain('{COPY.offerHead}');
    expect(card).toContain('{COPY.offerLine}');
    expect(card).toContain('{COPY.offerGo}');
    expect(card).toContain('{COPY.offerNot}');
    expect(read('renderer/src/styles.css')).not.toMatch(/\.tutorial-offer/);
  });

  it('has a way out on the keyboard as well as under the pointer', () => {
    // A card with no Escape on it is a card somebody is stuck behind.
    expect(card).toContain("e.key !== 'Escape'");
    expect(card).toContain('onNot()');
    // Capture phase and stopped dead, for the same reason the way-out card's
    // is: Escape reaches App.tsx too, and this must not close a task on its way
    // to closing itself.
    expect(card).toContain("window.addEventListener('keydown', on, true)");
    expect(card).toContain('e.stopImmediatePropagation()');
  });

  it('makes no promise about how long it takes, because nobody has timed it', () => {
    for (const line of [COPY.offerHead, COPY.offerLine, COPY.offerLater]) {
      expect(line).not.toMatch(/\bminutes?\b|\bseconds?\b|\d+\s*min/i);
    }
  });

  it('says nothing in it is kept, which is only true since the walk deletes it', () => {
    // The practice project is deleted at the end of the walk rather than
    // archived, so this card may say so. Before that it could not have.
    expect(COPY.offerLine.toLowerCase()).toContain('nothing in it is kept');
    // "your code" until 2026-10-01; most of the team has no code in it.
    expect(COPY.offerLine.toLowerCase()).toContain('nothing in it is yours');
  });

  it('says where the tutorial lives to the one person who turns it down', () => {
    // The only moment in the app where saying it is worth a sentence: she has
    // just proved she knows it exists and decided not to take it. It names the
    // key AND the word, because "hit Command+K" alone is what did not work on
    // the call. AND THE WORD IS TUTORIAL SINCE 2026-08-28.
    expect(COPY.offerLater).toContain('⌘K');
    expect(COPY.offerLater.toLowerCase()).toContain('tutorial');
    expect(app).toContain('showToast(WALK_COPY.offerLater)');
  });
});

/* ========================================================================== */
/* ASK TWO: the onboarding stays reachable for testing, and the tutorial is   */
/* a separate thing.                                                          */
/* ========================================================================== */

describe('2. the two of them are two things, and a stranger can tell them apart', () => {
  it('is two rows in ⌘K, doing two different things', () => {
    expect(TUTORIAL.src).toContain('run: onTutorial');
    expect(ONBOARDING.src).toContain('run: onFirstRun');
    expect(app).toContain('onFirstRun={walkAgain}');
    expect(app).toContain('onTutorial={() => startTutorial(');
  });

  it('names each of them in four words or fewer', () => {
    for (const r of [TUTORIAL, ONBOARDING]) {
      expect(r.label.split(/\s+/).length, r.label).toBeLessThanOrEqual(4);
    }
    expect(TUTORIAL.label).toBe('Take the tutorial');
    expect(ONBOARDING.label).toBe(`Set ${NAME} up again`);
  });

  it('says on each row the one thing somebody would want before pressing it', () => {
    // What each leaves behind. The onboarding makes a real project on its way
    // through and that fact has survived every cut to this hint since 08-23.
    expect(ONBOARDING.hint).toContain('makes a project');
    expect(ONBOARDING.hint).toContain('welcome screen');
    expect(TUTORIAL.hint).toContain('nothing is kept');
  });

  it('sends one typed word to exactly one row, whichever word gets typed', () => {
    // Her older rule on this list: two rows under one word is a choice nobody
    // should have to make correctly at speed.
    const both = [
      { ...TUTORIAL, id: 'tutorial' },
      { ...ONBOARDING, id: 'first-run' },
    ];
    const hits = (q) => both.filter((r) => matchesQuery(q, r)).map((r) => r.id);

    // a tester's words, and the American spelling of the one the label uses.
    expect(hits('practice')).toEqual(['tutorial']);
    expect(hits('practise')).toEqual(['tutorial']);
    expect(hits('tutorial')).toEqual(['tutorial']);
    expect(hits('walkthrough')).toEqual(['tutorial']);
    expect(hits('show me around')).toEqual(['tutorial']);
    // The word actually typed for it during the onboarding call.
    expect(hits('onboarding')).toEqual(['first-run']);
    expect(hits('first run')).toEqual(['first-run']);
    expect(hits('new user')).toEqual(['first-run']);
  });

  it('leaves the fresh-install command alone, because that is a third thing', () => {
    // opens a SECOND Agentbox that has never been set up (main/fresh-user.mjs).
    // Untouched by the split.
    expect(palette).toContain('label: `Open ${NAME} as a new user`');
    expect(palette).toContain('onFreshUser(false)');
  });

  it('starts the tutorial on the hand-off card, with no setup screen in front', () => {
    const run = tutorialRun('cascade');
    expect(run.step).toBe('hand');
    expect(run.tutorial).toBe(true);
    // Everything before the hand-off is setup, and setup is what the person
    // running this did weeks ago.
    for (const step of ['welcome', 'folder', 'name', 'look', 'inbox', 'away', 'goal']) {
      expect(STEPS.indexOf(step), step).toBeLessThan(STEPS.indexOf('hand'));
    }
  });

  it('walks exactly the same ten beats as the onboarding does', () => {
    // ONE WALK, ENTERED AT TWO DOORS. A second copy of these beats is a second
    // copy that drifts, which is the whole reason the split is a field on the
    // run rather than a state machine of its own.
    // Ten, not eleven, since w-ec62ab6b38 (2026-09-28) took the note beat out,
    // and eleven again since 2026-10-01: writing a thread is the card opening on
    // who it is for and then the send, which the walk never used to say.
    expect(IN_PRACTICE).toEqual([
      'make', 'who', 'task', 'working', 'open', 'answer',
      'clear', 'snooze', 'unblock', 'where', 'command',
    ]);
    // And the band that says nothing in here is real is on the screen for all
    // of them, in the tutorial exactly as in the onboarding.
    for (const step of IN_PRACTICE) {
      expect(practising({ ...tutorialRun('cascade'), step, practice: 'practice' }), step).toBe(true);
    }
  });

  it('ends when the ⌘K beat is over, where the onboarding goes on to the card', () => {
    // The person running the tutorial set Agentbox up weeks ago, their agents are
    // imported, and ⌘K has a row of its own for importing more. A card offering
    // to set up something already set up is the success page a tester pressed past
    // without reading (2026-08-24).
    expect(afterCommand(tutorialRun('cascade'))).toBe('end');
    expect(afterCommand(START)).toBe('done');
    expect(afterCommand(null)).toBe('done');
    expect(app).toContain("if (afterCommand(run) === 'end') { finishRun([], { practised: true }); return; }");
  });

  it('never forgets that the first run was finished, which the onboarding must', () => {
    // `walkAgain` calls `restartFirstRun` because that walk really is the first
    // run and has to believe it. The tutorial does not: the person is set up and
    // stays set up.
    const fn = app.slice(app.indexOf('const startTutorial = useCallback'), app.indexOf('}, []);', app.indexOf('const startTutorial = useCallback')));
    expect(fn).not.toContain('restartFirstRun');
    expect(fn).toContain('setRun(tutorialRun(product))');
    // And it touches neither the store nor the main process.
    expect(fn).not.toMatch(/api\./);
    expect(fn).not.toMatch(/localStorage\.clear/);
  });

  it('hands the compose card back to a real project, never to the practice one', () => {
    // `finishRun` hands the remembered slot back to `run.product`. A tutorial
    // makes no project of its own, so it carries the one the person was in — or
    // the slot is handed back to null and their next task goes to whatever is
    // first on the row.
    const products = [
      { slug: 'cascade' },
      { slug: 'practice', practice: true },
    ];
    expect(comeBackTo(products, 'cascade', null)).toBe('cascade');
    expect(comeBackTo(products, null, 'cascade')).toBe('cascade');
    // The practice project is refused outright: it is about to be deleted.
    expect(comeBackTo(products, 'practice', 'cascade')).toBe('cascade');
    expect(comeBackTo(products, 'practice', null)).toBe(null);
    // And so is a slug naming nothing at all.
    expect(comeBackTo(products, 'gone', null)).toBe(null);
    expect(comeBackTo([], 'cascade', null)).toBe(null);
  });

  /*
   * AND THE ⌘K BEAT'S MEMORY IS PUT BACK ON EVERY START. This is the same class
     of bug as the staging ref (./walk-staging.ts, fixed hours earlier the same
     day) and it is the one the split would have walked straight into: two ways
     into the walk on one mounted app means two walks on one mounted app. */
  it('puts the ⌘K beat back to nobody-has-opened-it before either walk starts', () => {
    for (const name of ['walkAgain', 'startTutorial']) {
      const from = app.indexOf(`const ${name} = useCallback`);
      const fn = app.slice(from, app.indexOf('}, []);', from));
      expect(fn, name).toContain('sawPalette.current = false;');
    }
  });
});

/* ========================================================================== */

/* ========================================================================== */

describe('3. the walk itself teaches where the tutorial lives', () => {
  const last = coach('command', 0);

  it('says on the last card that this tutorial is one of the things ⌘K holds', () => {
    // a tester found the way back only because she was told out loud. The
    // sentence points at itself; it said "so is this walk" until 2026-08-28,
    // when walk stopped being a word anybody outside this repository reads.
    const said = `${last.quiet} ${last.lead}${last.key}${last.tail}`;
    expect(said).toContain('⌘K');
    expect(last.quiet.toLowerCase()).toContain('so is this');
  });

  it('names the word to type, because the key on its own was not enough', () => {
    // What worked on the call was being told which word to type. The
    // palette is eighty rows long and a key with no word is a key with no
    // destination.
    expect(last.quiet.toLowerCase()).toContain('type tutorial');
  });

  it('teaches a word that really finds the tutorial and finds nothing else', () => {
    // THE ONE PLACE WORDING IS BEHAVIOUR. If the row is ever relabelled, this
    // sentence becomes a lie, and this is the assertion that says so.
    const typed = /type (\w+)/.exec(last.quiet.toLowerCase())?.[1];
    expect(typed).toBeTruthy();
    const both = [
      { ...TUTORIAL, id: 'tutorial' },
      { ...ONBOARDING, id: 'first-run' },
    ];
    expect(both.filter((r) => matchesQuery(typed, r)).map((r) => r.id)).toEqual(['tutorial']);
  });

  it('pays for it out of the two lines it already had, and adds no third', () => {
    // The budget is a type, and this walks the whole beat rather than trusting
    // the other file to have.
    expect(last.why).toBeUndefined();
    expect(Object.keys(last).sort()).toEqual(['key', 'lead', 'quiet', 'tail']);
  });

  it('still ends on the thing she does next, which is her own first real task', () => {
    expect(last.lead).toBe('Press ');
    expect(last.key).toBe('⌘K');
    // w-ec62ab6b38 (2026-09-28): the app's word for a row is thread now, not task.
    expect(last.tail).toContain('first real thread');
  });

  it('teaches it on the tutorial as well as on the onboarding, because it is one card', () => {
    // The beat is shared, so the person who reached it through the tutorial is
    // told the same thing. That is the point of the split being a field.
    expect(IN_PRACTICE).toContain('command');
    expect(afterCommand(tutorialRun(null))).toBe('end');
  });
});
