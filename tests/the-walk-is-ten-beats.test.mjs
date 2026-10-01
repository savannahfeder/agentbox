// THE WALK SHE APPROVED, BEAT BY BEAT.
//
// IT WAS TEN BEATS AND IT IS FIFTEEN SINCE 2026-08-23. Five screens went in
// front of the app: three slabs of introduction, the rule said out loud, and
// the hand-off into the practice project.
//
// The file keeps its name because the ORDER is what it pins, and the order of
// the ten she approved is untouched inside the fifteen.
//
// So two things are pinned here: the order of the beats, which is hers off the
// page, and the ring being smaller than the one in the shots she was looking
// at.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ANCHOR, COACHED, BEAT, N_BEATS, RING_PAD_MAX, RING_PAD_MIN, TEXT_GAP, TEXT_MAX,
  advance, coach, forcedStep, inboxCleared, ring, START, walkRows,
} from '../renderer/src/onboarding.ts';
import { EXAMPLES, stampsFor } from '../shared/first-run-examples.mjs';
import * as workItems from '../main/store/work-items.mjs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('the ten beats, in her order', () => {
  it('starts on the plus and not on the palette', () => {
    // Beat four used to open the palette over an empty app. AND THE PLUS IS
    // REACHED THROUGH THE INTRODUCTION AND THE LOOK NOW. Naming the project
    // opens the first slab, the look is the last screen before the hand-off,
    // and the practice project is what opens the plus.
    const made = advance({ ...START, step: 'name' }, { t: 'made', product: 'p' });
    expect(made.step).toBe('inbox');
    const practising = advance({ ...made, step: 'hand' }, { t: 'practice', product: 'practice', examples: [] });
    expect(practising.step).toBe('make');
    // w-ec62ab6b38 (2026-09-28): the plus is labelled New thread now, not New task.
    // AND THE TEAM HEADER'S NEW THREAD BUTTON AFTER IT (2026-10-01). That
    // layout draws no plus, and its button has no aria-label, so the first
    // beat of the tutorial drew no card at all in a persona test.
    expect(ANCHOR.make).toEqual(['button[aria-label="New thread"]', '.th-right button[data-hint="new-task"]', 'button.th-new']);
    // AND IT IS THE PLUS ALONE, WHICH SHE RULED ON AGAINST US (2026-08-27). A
    // round put the idle page's compose field in front of the plus, because
    // that field is 710px wide, sits mid-window and wears a `C` cap while the
    // plus is a 34px icon in the corner. It teaches the control that is there
    // every day, not the one that is there only at inbox zero.
    expect(ANCHOR.make).not.toContain('.idle-field');
  });

  it('puts ⌘K near the end rather than at the start', () => {
    // It was the tenth and last beat until 2026-08-22, when the ending grew a
    // beat behind it. It is still late in the walk, which is the half of this
    // she asked for: "The Command K bar is not the best place to start."
    // Seventeen since w-ec62ab6b38 (2026-09-28) took the note beat out.
    expect(BEAT.command).toBe(17);
    // AND THE BEAT IN FRONT OF IT IS THE TOUR OF THE OTHER TWO TABS, added
    // 2026-08-24. ⌘K used to follow the empty inbox straight away; now the walk
    // shows where the work went first, so an empty inbox means something by the
    // time the palette comes up.
    expect(BEAT.where).toBe(16);
    // THE SIDEBAR NOTE BEAT IS GONE. It rang the project rail, which is no
    // longer drawn anywhere, so the beat drew nothing (w-ec62ab6b38, 2026-09-28).
    expect(BEAT.note).toBeUndefined();
    expect(ANCHOR.note).toBeUndefined();
    // AND THE PALETTE COMES BEFORE THE KEY THAT OPENS IT. This said the button
    // alone until the beat was photographed with the palette up: the card was
    // gone from the screen, because the walk does not draw over something she
    // has opened and the button is OUTSIDE the palette. So nine command rows,
    // no sentence anywhere in the window and nothing saying how to get out, on
    // the one beat that exists to teach ⌘K. The order is the same one `snooze`
    // and `unblock` already use: the thing that is only on the screen part of
    // the time wins while it is there.
    expect(ANCHOR.command).toEqual(['.modal.palette', 'button[aria-label="Commands"]']);
  });

  it('ends on the finish card, which is where her agents are asked about', () => {
    // The import spent a day as the eighth beat and a few hours as a screen of
    // its own at the end; it is part of the card now, so there is no beat
    // after this one.
    // Eighteen since w-ec62ab6b38 (2026-09-28) took the note beat out.
    expect(BEAT.done).toBe(18);
    expect(BEAT.command).toBeLessThan(BEAT.done);
    expect(BEAT.agents).toBeUndefined();
  });

  it('lets the answered task land in the inbox instead of opening it', () => {
    // The app used to open it for her, which teaches nothing about processing
    // one.
    const sent = advance({ ...START, step: 'working', item: 'w-1' }, { t: 'answered' });
    expect(sent.step).toBe('open');
    expect(coach('open', 0)).toEqual({
      // THREE "IT"S AND NOT ONE NOUN, until 2026-08-28.
      quiet: 'Your agent worked on its own, and this row is what it sent back.',
      lead: 'Press ', key: '↵', tail: ' to open it.',
    });
  });

  it('rings the reply box, which is the half of its card still on the screen', () => {
    // Her sentence names two ways out and the reply box is the one with
    // something to point at. The button is not coming back to suit the walk.
    expect(ANCHOR.answer).toEqual(['.focus-dock .dock-card', '.focus-dock']);
    expect(coach('answer', 0).lead).toBe('Reply to it, or press ');
    expect(coach('answer', 0).key).toBe('E');
  });

  it('has no beat that says the walk is over while it carries on', () => {
    // What stood there said "This is inbox zero. Get back here every day.",
    // which is a closing line with ⌘K and the finish card still to come.
    expect(coach('zero', 0)).toBeNull();
    expect(ANCHOR.zero).toBeUndefined();
    // "inbox zero" is said again since w-ec62ab6b38 (2026-09-28), at her word,
    // on the tab tour where it is reached, and never as a closing line.
    for (const step of COACHED) {
      const say = coach(step, 0);
      if (step !== 'where') expect(JSON.stringify(say)).not.toContain('inbox zero');
      expect(JSON.stringify(say)).not.toContain('Get back here');
    }
  });

  it('counts every beat it renders, and renders every beat it counts', () => {
    // Eighteen since w-ec62ab6b38 (2026-09-28) took the note beat out.
    expect(N_BEATS).toBe(18);
    for (const step of COACHED) expect(coach(step, 0)).not.toBeNull();
    expect(new Set(Object.values(BEAT)).size).toBe(N_BEATS);
    for (const step of COACHED) expect(forcedStep(step)).toBe(step);
  });
});

describe('the ring landed between the drawing and the trim, which is what she asked for', () => {
  // TWO ANSWERS, IN ORDER, AND THE SECOND ONE IS THE LAW.
  //
  // So the pad is no longer one number. It is a share of the short side of the
  // thing, between 6 and 14, which leaves the small rings where they were and
  // gives the inbox row the middle of the two sizes she has seen.
  const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
  const halo = css.slice(css.indexOf('.fr-ring .halo'), css.indexOf('}', css.indexOf('.fr-ring .halo')));

  it('pads a small thing by 6 and a wide row by 14', () => {
    expect(RING_PAD_MIN).toBe(6);
    expect(RING_PAD_MAX).toBe(14);
  });

  it('keeps the glow she liked and no stroke she did not', () => {
    // The grey stroke was `.fr-ring .edge` and it is gone from the stylesheet
    // entirely, so nothing can put it back by changing a colour.
    expect(css).not.toContain('.fr-ring .edge');
    expect(halo).toContain('var(--fr-glow)');
    expect(halo).toMatch(/stroke-width:\s*6/);
    expect(halo).toMatch(/blur\(3px\)/);
  });

  it('lands between the two sizes she has seen, on the row she complained about', () => {
    // Both ends are rectangles, so the middle is arithmetic and not an
    // impression of a blur. The drawing rang the whole 75px row at a pad of 8,
    // which is 91 tall. The trim rings the 41px run of its words at a pad of 5,
    // which is 51. The middle of those is 71 and this is 69.
    const ROW_INK = { x: 55, y: 165, w: 997, h: 41 };
    const now = ring(ROW_INK, { left: 22, right: 1077 }, { w: 1440, h: 900 });
    expect(now.ring.h).toBe(69);
    expect(now.ring.h).toBeGreaterThan(51);
    expect(now.ring.h).toBeLessThan(91);
    expect(Math.abs(now.ring.h - (51 + 91) / 2)).toBeLessThanOrEqual(2);
  });

  it('leaves the small rings the size they were, because she never asked', () => {
    // The ⌘ in the corner: her complaint there was the shape, not the size.
    const CMD = { x: 1343, y: 47, w: 18, h: 18 };
    expect(ring(CMD, { left: 0, right: 1440 }, { w: 1440, h: 900 }).ring.h).toBe(30);
  });

  it('keeps her 18px between the ring and the card', () => {
    // 7 was too little and 28 was too much.
    expect(TEXT_GAP).toBe(18);
  });

  it('hangs the card off the right edge of a thing in the corner', () => {
    // Against the plus in the top right, starting the card at the plus ran it
    // 85px off a 1440 window.
    const plus = { x: 1300, y: 48, w: 28, h: 28 };
    const g = ring(plus, { left: 0, right: 1440 }, { w: 1440, h: 900 });
    expect(g.text.right).toBe(1440 - (plus.x + plus.w));
    expect(g.text.w).toBeLessThanOrEqual(TEXT_MAX);
  });
});

describe('beat eight: three examples, and clearing them is the beat', () => {
  it('stages three, and every one says it is an example', () => {
    expect(EXAMPLES).toHaveLength(3);
    for (const e of EXAMPLES) expect(e.result.startsWith('Example.')).toBe(true);
    // A question, a piece of finished work, and a decision made without her.
    expect(EXAMPLES.map((e) => e.kind)).toEqual(['question', 'task', 'review']);
  });

  it('writes the agent half after her half, which is what puts a row in the inbox', () => {
    // `answeredHerAsk` in list-rules.ts: her own open row carrying a result an
    // agent wrote after her last word. Same millisecond is not after.
    for (const e of EXAMPLES) {
      const at = stampsFor(e, 1_700_000_000_000);
      expect(at.agent).toBeGreaterThan(at.hers);
    }
  });

  it('reads as three different moments rather than three at once', () => {
    const at = EXAMPLES.map((e) => stampsFor(e, 1_700_000_000_000).hers);
    expect(new Set(at).size).toBe(3);
  });

  it('shows only its own three rows while the beat is up', () => {
    const run = { ...START, step: 'clear', examples: ['a', 'b', 'c'] };
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'the-directive' }];
    expect(walkRows(rows, run).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('holds the whole list down until she presses Open my inbox', () => {
    const rows = [{ id: 'agent:1' }, { id: 'agent:2' }, { id: 'the-directive' }];
    expect(walkRows(rows, { ...START, step: 'done' })).toEqual([]);
    // And the button is what releases them.
    expect(walkRows(rows, { ...START, step: 'landed' })).toEqual(rows);
  });

  it('is over when none of the three is left, however she cleared it', () => {
    const run = { ...START, step: 'clear', examples: ['a', 'b', 'c'] };
    expect(inboxCleared([{ id: 'a' }], run)).toBe(false);
    expect(inboxCleared([{ id: 'the-directive' }], run)).toBe(true);
    // And an empty list before anything was staged is not inbox zero.
    expect(inboxCleared([], { ...START, step: 'clear' })).toBe(false);
  });

  it('really lands three rows in a store, in one call', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-examples-'));
    const now = 1_700_000_000_000;
    const ids = [];
    for (const e of EXAMPLES) {
      const at = stampsFor(e, now);
      const made = workItems.createWorkItem(
        dir, { title: e.title, kind: e.kind, priority: 5, labels: ['founder', 'first-run'] },
        { source: 'system', now: at.hers },
      );
      workItems.updateWorkItem(dir, made.id, { title: e.title }, { source: 'founder', now: at.hers });
      workItems.updateWorkItem(dir, made.id, { result: e.result }, { source: 'agent', now: at.agent });
      ids.push(made.id);
    }
    const items = ids.map((id) => workItems.readWorkItem(dir, id, now));
    for (const it of items) {
      expect(it.status).toBe('open');
      expect(it.labels).toContain('founder');
      expect(it.labels).toContain('first-run');
      expect(it.wrote.result.source).toBe('agent');
      expect(it.wrote.result.ts).toBeGreaterThan(it.wrote.title.ts);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

/* * WHAT THE LITTLE DOTS ARE — ANSWERED BY DELETING
   THEM, AND THE TEST FOR IT LIVES ELSEWHERE NOW.

   a tester's first question on her onboarding call was "what are the little dots
   at the bottom?", and the answer built here on 08-24 was a hover title and an
   accessible name saying which step of how many. Four tests held that.

 The row is off every screen of the walk now, so there is nothing left to label, and these
 four tests asserted markup that no longer exists.

   `tests/her-three-off-the-page-of-nineteen.test.mjs` holds what replaced them,
   and it is the stronger claim: no `.fr-dots` row in the walk, no `.fr-dots`
   rule in the stylesheet, no `dotsBottom` export and no import of it. Nothing
   is asserted twice by deleting this.
*/
