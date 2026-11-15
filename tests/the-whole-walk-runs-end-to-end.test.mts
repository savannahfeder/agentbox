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
import { PRACTICE_ROWS } from '../shared/first-run-practice.mts';

const FOLDER = '/Users/leon/Developer/side-quest';
const EXAMPLE_IDS = PRACTICE_ROWS.map((_, i) => `w-ex${i + 1}`);

/**
 * THE RUN. Every move is one the app really makes: `stepTo` where a screen
 *  just leaves, `advance` where something really happened in the store. The
 *  step after each move is recorded so the order can be read as one thing. */
function walkIt({ bare = false, reply = false } = {}) {
  const seen = [];
  let s = { ...START };
  const at = (label) => seen.push({ label, step: s.step, dot: BEAT[s.step], run: s });

  at('opened');                                                     // welcome
  if (bare) {
    // A MAC WHERE NOTHING CAN RUN AN AGENT YET (w-9f6975906c) is asked which
    // plan it pays for, set up, and handed on to the folder screen.
    s = stepTo(s, 'plan');                              at('which plan');
    s = stepTo(s, 'folder');                            at('got started');
  } else {
    s = advance(s, { t: 'start' });                     at('got started');
  }
  s = advance(s, { t: 'folder', path: FOLDER });        at('chose a folder');
  s = stepTo(s, 'name');                                at('named it');
  s = advance(s, { t: 'name', name: 'Side Quest' });
  // AND NAMING THE PROJECT HANDS STRAIGHT TO THE HAND-OFF. The three slabs
  // that stood between them went on 2026-10-05 (w-9f6975906c).
  // NO MOUSE RULE HERE ANY MORE, AND NO THEME STEP SINCE w-9e434e8671.
  s = advance(s, { t: 'made', product: 'side-quest' }); at('into practice');
  // THE PRACTICE PROJECT IS REAL AND IT IS NOT THEIRS. Made here, with the
  // three rows already waiting in it, and archived when the walk ends.
  s = advance(s, { t: 'practice', product: 'practice', examples: EXAMPLE_IDS });
  at('looking around');
  // THE LOOK AROUND IS TWO STOPS, EACH LEFT BY ITS NEXT (2026-10-06), and the
  // plus is the beat after them.
  s = stepTo(s, 'tabs');                                at('the tabs');
  s = stepTo(s, 'make');                                at('practising');
  // WRITING ONE IS TWO BEATS AGAIN SINCE 2026-10-06: the card opens and she
  // sends it. The beat about who it was to went with single player.
  s = stepTo(s, 'task');                                at('composing');
  s = advance(s, { t: 'sent', item: 'w-first', at: 1_000 }); at('it is running');
  s = advance(s, { t: 'answered' });                    at('it came back');
  s = stepTo(s, 'answer');                              at('opened it');
  // AND SHE MAY REPLY TO IT (2026-10-06), which sends it back to work and
  // brings it back changed, through the same two beats it took the first time.
  if (reply) {
    s = advance(s, { t: 'replied', at: 2_000 });        at('replied to it');
    s = advance(s, { t: 'answered' });                  at('it came back again');
    s = stepTo(s, 'answer');                            at('opened it again');
  }
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
  s = stepTo(s, 'board');                               at('the board');
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
    // TEN AND SEVENTEEN since w-9e434e8671: the theme step went with the
    // themes.
    //
    // ELEVEN AND NINETEEN since 2026-10-01: who a thread is for, and the
    // board, each became a beat of their own, so both pairs came up two.
    //
    // EIGHT AND SIXTEEN since 2026-10-05 (w-9f6975906c): the three
    // introduction slabs went, so both pairs came down three.
    //
    // NINE AND SEVENTEEN since 2026-10-06: the look around added two beats in
    // front of the plus and the beat about To went.
    //
    // `where` IS ONE BEAT AND ONE STEP even though it takes three presses of
    // Tab. The presses move the VIEW, not the step, which is exactly why the
    // card cannot get out of step with the screen it is describing.
    const beats = seen.map((m) => m.step).filter((s, i, all) => s !== all[i - 1]);
    const times = new Map();
    for (const s of beats) times.set(BEAT[s], (times.get(BEAT[s]) ?? 0) + 1);
    const twice = new Set([BEAT.working, BEAT.done]);
    for (const [dot, n] of times) {
      expect(n, `dot ${dot} was on screen ${n} times`).toBe(twice.has(dot) ? 2 : 1);
    }
    expect(beats.filter((s) => BEAT[s] === BEAT.working)).toEqual(['working', 'open']);
    expect(beats.filter((s) => BEAT[s] === BEAT.done)).toEqual(['done', 'landed']);
  });

  // A REPLY IS THE ONE MOVE BACK, AND IT IS ON PURPOSE (2026-10-06). Her words:
  // "your first task doesn't let you actually reply but forces you to do 'e'".
  // Replying sends the thread back to work, so the walk steps back to the beat
  // that watches it run and comes forward through the same two beats again.
  it('takes a reply back to work and forward again, and nowhere else', () => {
    const { seen: replied, end: after } = walkIt({ reply: true });
    const back = [];
    for (let i = 1; i < replied.length; i += 1) {
      if (replied[i].dot < replied[i - 1].dot) back.push(`${replied[i - 1].step}->${replied[i].step}`);
    }
    expect(back).toEqual(['answer->working']);
    expect(after.step).toBe('landed');
    expect(after.replies).toBe(1);
    expect(after.sentAt).toBe(2_000);
    // And only from her own open thread: anywhere else the walk does not move.
    for (const step of ['open', 'working', 'clear', 'unblock']) {
      const run = { ...START, step, item: 'w-first' };
      expect(advance(run, { t: 'replied', at: 5 }), step).toBe(run);
    }
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

  it('a Mac with nothing set up is asked its plan once, between the welcome and the folder, and still lands', () => {
    const bare = walkIt({ bare: true });
    expect(bare.seen.slice(0, 3).map((m) => m.step)).toEqual(['welcome', 'plan', 'folder']);
    expect(bare.seen.filter((m) => m.step === 'plan')).toHaveLength(1);
    expect(bare.end.step).toBe('landed');
    expect(bare.end.folder).toBe(FOLDER);
    // And a Mac that is set up never sees it.
    expect(seen.some((m) => m.step === 'plan')).toBe(false);
  });

  it('reaches every step this version has, so no beat is stranded', () => {
    // The dots share beat six, so the steps are counted rather than the dots.
    // The plan step is only on a Mac with nothing set up, so that run counts too.
    const reached = new Set([...seen, ...walkIt({ bare: true }).seen].map((m) => m.step));
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

  // THE EXAMPLES ARE IN THE LIST FROM THE FIRST LOOK (2026-10-06), so the look
  // around stands on an inbox with something in it and the inbox does not
  // empty itself while she writes her first thread. Codex, consulted on the
  // round: "don't make the inbox mysteriously empty when creation begins."
  it('holds her own task and the examples from the look around on, and nothing found on the Mac', () => {
    expect(walkRows(rows, at('looking around')).map((r) => r.id)).toEqual(EXAMPLE_IDS);
    for (const label of ['it is running', 'it came back', 'opened it']) {
      expect(walkRows(rows, at(label)).map((r) => r.id)).toEqual(['w-first', ...EXAMPLE_IDS]);
    }
  });

  it('holds the examples on both halves of beat thirteen, and nothing found on the Mac', () => {
    // Her own task is still kept, and by this beat it is closed, so the inbox
    // tab does not draw it.
    expect(walkRows(rows, at('two to close')).map((r) => r.id)).toEqual(['w-first', ...EXAMPLE_IDS]);
    // AND STILL ON THE HALF THAT ANSWERS THE STOPPED ONE. Without this the row
    // she is being told to open would leave the screen the moment the beat she
    // is being told to open it on begins.
    expect(walkRows(rows, at('one to answer')).map((r) => r.id)).toEqual(['w-first', ...EXAMPLE_IDS]);
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
