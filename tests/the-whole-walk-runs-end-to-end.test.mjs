// THE WALK FROM THE FIRST SCREEN TO THE LAST, IN ONE RUN.
//
// Everything already written about the walk tests one beat at a time: this dot
// is lit, that ring lands here, this sentence says that. What none of them does
// is walk it, and a walk is exactly the thing that breaks when a beat is added
// or moved, because each beat still passes its own test while the chain between
// them is cut. The Step union has been rewritten five times in three days.
//
// So this file drives the real state machine from START to `landed` with the
// real events, in her order, and asserts the whole shape of the run rather than
// any one frame of it:
//
//   - every beat is reached, in the order the dots count them
//   - the walk never goes backwards and never lights the same dot twice going
//     forward, apart from beat six, which is one task leaving and coming back
//   - what was chosen on an early screen is still there at the end
//   - the list under the walk holds what that beat is about, and nothing else
//   - an event arriving at the wrong moment is refused rather than obeyed
//
// If a beat is added, this file fails until the run is written through it. That
// is the point: a new beat nobody can reach is the failure that costs a person
// their first two minutes with the app, and it has no other symptom.

import { describe, expect, it } from 'vitest';
import {
  COACHED, BEAT, N_BEATS, START,
  advance, coach, inboxCleared, stepTo, walkRows,
} from '../renderer/src/onboarding.ts';
import { PRACTICE_ROWS } from '../shared/first-run-practice.mjs';

const FOLDER = '/Users/leon/Developer/side-quest';
const EXAMPLE_IDS = PRACTICE_ROWS.map((_, i) => `w-ex${i + 1}`);

/**
 * THE RUN. Every move is one the app really makes: `stepTo` where a screen
 *  just leaves, `advance` where something really happened in the store. The
 *  step after each move is recorded so the order can be read as one thing. */
function walkIt() {
  const seen = [];
  let s = { ...START };
  const at = (label) => seen.push({ label, step: s.step, dot: BEAT[s.step], run: s });

  at('opened');                                                     // welcome
  s = advance(s, { t: 'start' });                       at('got started');
  s = advance(s, { t: 'folder', path: FOLDER });        at('chose a folder');
  s = stepTo(s, 'name');                                at('named it');
  s = advance(s, { t: 'name', name: 'Side Quest' });
  // AND NAMING THE PROJECT HANDS STRAIGHT TO THE INTRODUCTION.
  s = advance(s, { t: 'made', product: 'side-quest' }); at('what an inbox is');
  s = stepTo(s, 'away');                                at('what a task is');
  // THE SIDEBAR NOTE IS NOT A SLAB.
  s = stepTo(s, 'goal');                                at('what the job is');
  // NO MOUSE RULE HERE ANY MORE. Everything after it is the real app, so the
  // pick is spent on the whole practice round rather than on one card.
  s = stepTo(s, 'look');                                at('picked a look');
  s = stepTo(s, 'hand');                                at('into practice');
  // THE PRACTICE PROJECT IS REAL AND IT IS NOT THEIRS. Made here, with the
  // three rows already waiting in it, and archived when the walk ends.
  s = advance(s, { t: 'practice', product: 'practice', examples: EXAMPLE_IDS });
  at('practising');
  // WRITING ONE IS TWO BEATS SINCE 2026-10-01. The card opens on who the
  // thread is for, which the walk never used to say a word about, and the beat
  // ends when the To list is really open (App.tsx, `onOpenMenu`).
  s = stepTo(s, 'who');                                 at('who it is for');
  s = stepTo(s, 'task');                                at('composing');
  s = advance(s, { t: 'sent', item: 'w-first', at: 1_000 }); at('it is running');
  s = advance(s, { t: 'answered' });                    at('it came back');
  s = stepTo(s, 'answer');                              at('opened it');
  // The rows arriving lands straight on the beat that clears them. The rail's
  // note beat sat between the two until w-ec62ab6b38 (2026-09-28) removed it.
  s = advance(s, { t: 'staged', examples: EXAMPLE_IDS }); at('two to close');
  // AND THE ONE THAT IS NOT FOR TODAY, which is snoozed rather than closed or
  // answered.
  s = stepTo(s, 'snooze');                              at('one to put off');
  // AND THE ONE THAT IS STOPPED, which is answered rather than closed. This is
  // the beat the whole of round four was about.
  s = stepTo(s, 'unblock');                             at('one to answer');
  // AND THEN THE TOUR OF THE OTHER TWO TABS, which is one beat however many
  // times Tab is pressed inside it: the card is a function of the view and the
  // step does not move until the walk is back on an empty inbox.
  s = stepTo(s, 'where');                               at('where it all went');
  s = stepTo(s, 'command');                             at('the palette');
  s = stepTo(s, 'done');                                at('the finish card');
  s = advance(s, { t: 'finish' });                      at('landed');

  return { seen, end: s };
}

describe('the walk, start to finish', () => {
  const { seen, end } = walkIt();

  it('gets to the end, which nothing else here checks', () => {
    expect(end.step).toBe('landed');
  });

  it('lights every dot the walk counts, and never a dot it does not', () => {
    const lit = new Set(seen.map((m) => m.dot));
    expect(lit.size).toBe(N_BEATS);
    expect([...lit].sort((a, b) => a - b)).toEqual(
      Array.from({ length: N_BEATS }, (_, i) => i + 1),
    );
  });

  it('never goes backwards, on any move', () => {
    for (let i = 1; i < seen.length; i += 1) {
      expect(
        seen[i].dot,
        `${seen[i - 1].label} -> ${seen[i].label} went from dot ${seen[i - 1].dot} to ${seen[i].dot}`,
      ).toBeGreaterThanOrEqual(seen[i - 1].dot);
    }
  });

  it('stops on each beat once, apart from the two beats that are two steps', () => {
    // The screens the walk really stands on, in order. Choosing a folder does
    // not change the screen (the folder card stays up until Submit), so the
    // moves are folded down to the steps before they are counted.
    //
    // TWO DOTS COVER TWO STEPS EACH AND BOTH ARE ON PURPOSE. Ten is her task
    // leaving and coming back, which is one beat and two screens. Sixteen is
    // the finish card and then `landed`, which draws nothing at all: the dot
    // stays lit through the confetti and the walk is over. They were six and
    // ten before the introduction went in front of the app, eleven and fifteen
    // until the mouse rule came out and `unblock` went in, ten and sixteen once
    // `where` went in after it, and eleven and eighteen once the sidebar slab
    // and the snooze beat went in on 2026-08-24.
    //
    // AND ON 2026-08-24 THEY BECAME ELEVEN AND NINETEEN: the sidebar slab came
    // back out of the introduction and went in after the tab tour, and picking
    // the look went in as beat four.
    //
    // ELEVEN AND EIGHTEEN since w-ec62ab6b38 (2026-09-28): the note beat went
    // with the rail it pointed at.
    //
    // AND TWELVE AND NINETEEN since 2026-10-01, when who a thread is for became
    // a beat of its own between opening the card and sending it. Both pairs
    // moved down by one; neither changed what it is.
    //
    // `where` IS ONE BEAT AND ONE STEP even though it takes three presses of
    // Tab. The presses move the VIEW, not the step, which is exactly why the
    // card cannot get out of step with the screen it is describing.
    const beats = seen.map((m) => m.step).filter((s, i, all) => s !== all[i - 1]);
    const times = new Map();
    for (const s of beats) times.set(BEAT[s], (times.get(BEAT[s]) ?? 0) + 1);
    const twice = new Set([12, 19]);
    for (const [dot, n] of times) {
      expect(n, `dot ${dot} was on screen ${n} times`).toBe(twice.has(dot) ? 2 : 1);
    }
    expect(beats.filter((s) => BEAT[s] === 12)).toEqual(['working', 'open']);
    expect(beats.filter((s) => BEAT[s] === 19)).toEqual(['done', 'landed']);
  });

  it('still knows the folder and the name it was given at the start', () => {
    expect(end.folder).toBe(FOLDER);
    expect(end.name).toBe('Side Quest');
    expect(end.product).toBe('side-quest');
    // AND THEIR OWN PROJECT IS STILL THEIRS AT THE END. The practice project is
    // a separate slug the whole way through and never overwrites it, which is
    // the thing that would strand somebody in a project that is about to be
    // archived out from under them.
    expect(end.practice).toBe('practice');
    expect(end.item).toBe('w-first');
    expect(end.sentAt).toBe(1_000);
    expect(end.examples).toEqual(EXAMPLE_IDS);
  });

  it('has a sentence on every beat that is meant to have one', () => {
    for (const m of seen) {
      if (!COACHED.includes(m.step)) continue;
      const say = coach(m.step, 0);
      expect(say, `${m.label} had nothing to say`).not.toBeNull();
      expect(say.quiet.length + say.lead.length).toBeGreaterThan(0);
    }
  });

  it('reaches every step this version has, so no beat is stranded', () => {
    // The dots share beat six, so the steps are counted rather than the dots.
    const reached = new Set(seen.map((m) => m.step));
    for (const step of Object.keys(BEAT)) {
      expect(reached.has(step), `nothing in the walk ever reaches ${step}`).toBe(true);
    }
  });
});

describe('what the list holds under each beat', () => {
  const { seen } = walkIt();
  // A store with everything in it that would really be there by the end: the
  // person's own task, the directive making a project composes, three examples,
  // and a Claude Code session Agentbox found running on the Mac by itself.
  const rows = [
    { id: 'w-first' }, { id: 'w-directive' }, ...EXAMPLE_IDS.map((id) => ({ id })),
    { id: 'a-found-session' },
  ];
  const at = (label) => seen.find((m) => m.label === label).run;

  it('holds only her own task while it is running and while she opens it', () => {
    for (const label of ['it is running', 'it came back', 'opened it']) {
      expect(walkRows(rows, at(label)).map((r) => r.id)).toEqual(['w-first']);
    }
  });

  it('holds exactly the three examples on both halves of beat thirteen, and nothing found on the Mac', () => {
    expect(walkRows(rows, at('two to close')).map((r) => r.id)).toEqual(EXAMPLE_IDS);
    // AND STILL ON THE HALF THAT ANSWERS THE STOPPED ONE. Without this the row
    // she is being told to open would leave the screen the moment the beat she
    // is being told to open it on begins.
    expect(walkRows(rows, at('one to answer')).map((r) => r.id)).toEqual(EXAMPLE_IDS);
  });

  it('is empty under the finish card, because that card says the inbox is empty', () => {
    expect(walkRows(rows, at('the finish card'))).toEqual([]);
  });

  it('gives everything back the moment the walk lands, one render later', () => {
    expect(walkRows(rows, at('landed'))).toEqual(rows);
  });

  it('is over when the three are gone, however they went', () => {
    const run = at('two to close');
    expect(inboxCleared(rows, run)).toBe(false);
    expect(inboxCleared(rows.filter((r) => !EXAMPLE_IDS.includes(r.id)), run)).toBe(true);
    // One left is not cleared, which is what makes the beat wait for all three.
    expect(inboxCleared([{ id: EXAMPLE_IDS[2] }], run)).toBe(false);
  });
});

describe('an event that arrives at the wrong moment', () => {
  it('is refused when it is Get started pressed twice', () => {
    const past = { ...START, step: 'task' };
    expect(advance(past, { t: 'start' })).toBe(past);
  });

  it('is refused when the task answers while she is already reading it', () => {
    // The answer landing twice, or landing after she opened the row herself,
    // must not throw her back to the step before.
    const open = { ...START, step: 'open', item: 'w-1' };
    expect(advance(open, { t: 'answered' })).toBe(open);
    const answer = { ...START, step: 'answer', item: 'w-1' };
    expect(advance(answer, { t: 'answered' })).toBe(answer);
  });

  it('never invents a name over one she typed herself', () => {
    // She types a name, then goes back and changes the folder. Her word wins.
    const named = advance({ ...START, step: 'folder' }, { t: 'name', name: 'Ledger' });
    const then = advance(named, { t: 'folder', path: '/Users/leon/dev/other-thing' });
    expect(then.name).toBe('Ledger');
    expect(then.folder).toBe('/Users/leon/dev/other-thing');
  });

  it('changes nothing else about the run, whichever event it was', () => {
    const mid = {
      step: 'clear', folder: FOLDER, name: 'Side Quest', product: 'side-quest',
      practice: 'practice', item: 'w-first', sentAt: 1_000, examples: EXAMPLE_IDS,
    };
    for (const e of [{ t: 'start' }, { t: 'answered' }]) {
      expect(advance(mid, e)).toEqual(mid);
    }
  });

  it('is handled at all, for every event the walk can send', () => {
    // A `case` deleted from `advance` returns undefined, and the next render
    // reads `.step` off it and takes the whole window down.
    const events = [
      { t: 'start' }, { t: 'folder', path: FOLDER }, { t: 'name', name: 'x' },
      { t: 'made', product: 'p' }, { t: 'practice', product: 'practice', examples: [] },
      { t: 'sent', item: 'w-1', at: 1 },
      { t: 'answered' }, { t: 'staged', examples: [] }, { t: 'finish' },
    ];
    for (const e of events) {
      const out = advance({ ...START, step: 'working' }, e);
      expect(out, `advance returned nothing for ${e.t}`).toBeTruthy();
      expect(typeof out.step, `advance lost the step on ${e.t}`).toBe('string');
    }
  });
});
