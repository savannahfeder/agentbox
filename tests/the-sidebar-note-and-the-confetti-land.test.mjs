// HER FOUR CHANGES OF 2026-08-24 EVENING, pinned.
//
// She walked the built onboarding in her own app and answered with four things.
// Three of them move something that already worked, which is exactly the shape
// of change that gets quietly undone by the next session, so each one is here
// with her sentence beside it. The first two (the default picture and the
// theme step) went when the app went to one look, w-9e434e8671.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR, COACHED, COPY, BEAT, INTRO, START,
  advance, coach, finishCard, walkRows,
} from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = read('renderer/src/components/Onboarding.tsx');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');

/* ========================================================================== */
/* 3. THE SIDEBAR NOTE IS A BEAT, NOT A PAGE                                  */
/* ========================================================================== */

describe('the sidebar note is shown in the walk rather than described on a page', () => {
  it('is not one of the introduction slabs', () => {
    expect(COPY.intro).toHaveLength(3);
    for (const slab of COPY.intro) expect(slab.piece).not.toBe('notes');
    // The introduction is the hand-off alone since 2026-10-05 (w-9f6975906c),
    // so there is no slab for the note to be.
    expect(INTRO).toEqual(['hand']);
  });

  // THE NOTE BEAT IS GONE. It rang `.rail-note` on the project rail, and the
  // rail is no longer drawn anywhere, so the beat drew nothing and only Enter
  // moved it on (w-ec62ab6b38, 2026-09-28).
  it('is no longer a beat, because the rail it rang is not drawn', () => {
    expect(COACHED).not.toContain('note');
    expect(ANCHOR.note).toBeUndefined();
    expect(BEAT.note).toBeUndefined();
    // The rows arriving now lands straight on the beat that clears them, and
    // the rows are still on the screen for it.
    expect(advance({ ...START, step: 'answer' }, { t: 'staged', examples: ['a'] }).step).toBe('clear');
    expect(walkRows([{ id: 'a' }, { id: 'b' }], { ...START, step: 'clear', examples: ['a', 'b'] }))
      .toHaveLength(2);
  });

  it('leaves no sentence and no Enter handler behind it', () => {
    expect(coach('note', 0)).toBeNull();
    expect(app).not.toMatch(/run\?\.step !== 'note'/);
  });
});

/* ========================================================================== */
/* 4. THE READY PAGE, AND WHERE THE CONFETTI FALLS                            */
/* ========================================================================== */

describe('the last card asks one thing and the celebration is in her own project', () => {
  const READ = { read: true, some: true };

  it('opens with the thing to do rather than with a success headline', () => {
    expect(finishCard({ missing: false }, READ)).toMatchObject({
      show: true, blocked: false, go: true,
      head: COPY.bringHead, line: COPY.agentsOffer,
    });
    expect(COPY.bringHead).toBe('Add the agents already on this computer.');
    // It says the tutorial is over in so many words since 2026-10-01: a
    // persona test read the old ending as no ending at all.
    expect(COPY.finishHead).toBe('You finished the tutorial.');
  });

  // IT WAS A CARD ON A MAC WITH NOTHING TO IMPORT FROM 2026-08-28 TO 2026-10-06,
  // reading "No agents to bring across yet" over a ~/.claude/agents path. That
  // was every new user's last screen, and it read as setup having failed. So a
  // Mac with nothing to bring goes straight to the confetti again, and the
  // component says so in one effect.
  it('is no card on a Mac with nothing to import, since 2026-10-06', () => {
    expect(finishCard({ missing: false }, { read: true, some: false }))
      .toMatchObject({ show: false, skip: true, blocked: false });
    expect(walk).toContain('useEffect(() => { if (skip) onDone([]); }, [skip]);');
    // THE CASE THAT MUST NOT MATCH: a Mac WITH agents still gets the card.
    expect(finishCard({ missing: false }, { read: true, some: true }))
      .toMatchObject({ show: true, blocked: false });
    // AND NOT WHILE HER MAC IS STILL BEING READ. A slow disk must not tip
    // somebody into the inbox before the offer has had a chance to exist.
    expect(finishCard({ missing: false }, { read: false, some: false }))
      .toMatchObject({ show: false, blocked: false });
    expect(walk).toContain('if (!card.show) return null;');
  });

  it('still lets nothing at all past the Claude Code gate', () => {
    // The gate outranks every other answer, including the empty card.
    for (const agents of [{ read: true, some: true }, { read: true, some: false }, { read: false, some: false }]) {
      expect(finishCard({ missing: true }, agents)).toMatchObject({ blocked: true, go: false });
    }
  });

  it('drops the confetti in her own project instead, and takes it down itself', () => {
    const finished = walk.slice(walk.indexOf('function Finished('), walk.indexOf('LANDING IN HER OWN PROJECT'));
    expect(finished).not.toContain('fr-burst');
    const landed = walk.slice(walk.indexOf('export function Landed('));
    expect(landed.slice(0, 3000)).toContain('fr-burst');
    expect(landed.slice(0, 3000)).toContain('COPY.finishHead');
    // Armed where the walk is actually written off, so it cannot fire on a
    // press the gate refused.
    const fin = app.slice(app.indexOf('const finishRun'), app.indexOf('const finishRun') + 1200);
    expect(fin.indexOf('mayOpenInbox')).toBeLessThan(fin.indexOf('setLanding'));
    // WHETHER ANYTHING LANDED, from whichever end knows. `chosen` is what this
    // function still has to file; `filed` is what the walk's last card already
    // filed itself, into as many inboxes as it had to make. Either is a reason
    // for the confetti to say agents.
    expect(fin).toMatch(/setLanding\(\{ agents: \(filed \?\? chosen\.length\) > 0 \}\)/);
  });

  it('does not stand in the way of the first thing she does in it', () => {
    // No veil, no panel, no button, and the layer takes no clicks: the first
    // row of her own inbox is clickable through this while the confetti is
    // still falling. That is the whole difference from the card it came off.
    const rule = css.slice(css.indexOf('\n.fr-landed {'), css.indexOf('}', css.indexOf('\n.fr-landed {')));
    expect(rule).toContain('pointer-events: none');
    expect(walk).toMatch(/const t = setTimeout\(onGone, LANDED_MS\);/);
    expect(walk).toMatch(/const on = \(\) => onGone\(\);/);
  });

  it('says the line that is true of the inbox behind it', () => {
    // With agents kept there is a row per agent in there, so it cannot promise
    // an empty inbox three seconds before filling it.
    expect(walk).toContain('{agents ? COPY.finishLineAgents : COPY.finishLine}');
    expect(COPY.finishLine).toMatch(/inbox is empty/);
    expect(COPY.finishLineAgents).not.toMatch(/inbox is empty/);
  });
});

/* ========================================================================== */
/* 5. WHAT DRIVING IT CAUGHT                                                  */
/* ========================================================================== */

describe('the faults driving the built walk caught', () => {
  it('makes the shot harness a real first run rather than a set-up Mac', () => {
    // The harness once opened by writing the stored look itself, so every shot
    // of the walk was of a Mac that was already set up. It clears the store,
    // and with one look there is nothing for it to write.
    const shot = read('scripts/shot-the-built-walk.mjs');
    expect(shot).toContain("localStorage.clear(); return true;");
    expect(shot).not.toMatch(/localStorage\.setItem\('zero\.(skin|theme)'/);
  });
});
