// MARGARETTE COULD NOT GET OUT OF THE TUTORIAL.
//
// She is not an engineer and she is the first person outside the building to
// walk the onboarding. On the call, in order:
//
// FOUR THINGS WERE HOLDING HER IN, and the first is the one that made the card
// never appear at all. Each has a section below.
//
//   1. THE PRESS NEVER REACHED THE PAGE. `.fr-band`, the 38px practice strip,
//      carried `-webkit-app-region: drag` across the whole window, and the Skip
//      button sits inside that strip. A drag region in Electron is not a CSS
//      effect: it is a native region on the window, and on macOS a mousedown
//      inside it is taken by the window server as "pick this window up". The
//      page is never told. `.fr-out` did say `-webkit-app-region: no-drag`, and
//      it was overruled, because Electron builds ONE region by walking the
//      reported rectangles IN ORDER (shell/browser/ui/drag_util.mm,
//      DraggableRegionsToSkRegion: kUnion_Op for a draggable rect,
//      kDifference_Op for a non-draggable one). App.tsx draws <WayOut> before
//      <PracticeBand>, so the button was subtracted first and the strip put it
// straight back. Read off the built app:
//
//        no-drag  button.fr-out   36x38 at 1700,0
//        drag     div.fr-band   1752x38 at 0,0     <- puts it back
//
//   2. ESCAPE DID NOTHING. Nothing listened for it. She said the word and
//      pressed the key.
//
//   3. THE CARD OPENED ON "KEEP GOING", focused, first and drawn, at somebody
//      who had already pressed Skip.
//
// 4. RETURN DID NOTHING EITHER, which is worse than either button being the
// wrong one. The coaching card installs a capture-phase keydown listener that
// eats every cap the beat did not ask for, and Return on the `make` beat is a
// wrong cap, so `preventDefault` cancelled the focused button's own activation.
// The card had two buttons and neither could be reached from the keyboard.
//
// Nothing below makes the card louder. It just stops arguing.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { COPY, NOT_THE_WALK, keyToken, pressCounts, swallowPress } from '../renderer/src/onboarding.ts';
import { PracticeBand } from '../renderer/src/components/Onboarding.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('renderer/src/styles.css');
const onboarding = read('renderer/src/components/Onboarding.tsx');
/**
 * The component's code without the essays beside it, because everything
 *  asserted here is wiring and every comment quotes somebody at length. */
const code = onboarding.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const app = read('renderer/src/App.tsx');
/**
 * THE STYLESHEET WITHOUT ITS ESSAYS. Every rule this file reads has a
 *  paragraph over it quoting somebody, and several of those paragraphs quote the
 *  very declaration being asserted absent — the comment on `.fr-band` says in so
 *  many words that it USED to say `-webkit-app-region: drag`. Matching against
 *  the prose would pass forever. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
/** One rule out of the stylesheet, by selector. */
const rule = (sel) => {
  const at = cssCode.indexOf(`${sel} {`);
  expect(at, `there is no ${sel} rule`).toBeGreaterThan(-1);
  return cssCode.slice(at, cssCode.indexOf('}', at));
};
/**
 * The component alone, off the raw file, bounded the way the other WayOut
 *  tests bound it: the essay above `PracticeBand` starts at this marker. */
const wayOut = onboarding.slice(
  onboarding.indexOf('export function WayOut'),
  onboarding.indexOf('THE DOTS ARE GONE'),
);

describe('1. the press reaches the page: nothing draggable covers Skip', () => {
  it('the practice strip does not drag the window across its whole width any more', () => {
    // This one line is the entire defect. It was `-webkit-app-region: drag` on
    // a rule that is `left: 0; right: 0; top: 0; height: 38px`, which is the
    // exact rectangle the way out lives in.
    expect(rule('.fr-band')).not.toMatch(/-webkit-app-region:\s*drag/);
  });

  it('a lane inside the strip drags it instead, and it stops short of the right edge', () => {
    const lane = rule('.fr-band-drag');
    expect(lane).toMatch(/-webkit-app-region:\s*drag/);
    expect(lane).toMatch(/position: absolute/);
    // Left, top and bottom of the strip; the whole of it but the last stretch.
    expect(lane).toMatch(/left: 0/);
    expect(lane).toMatch(/right: \d+px/);
  });

  it('the lane and the button cannot overlap at any window the app opens', () => {
    // NOT A STRING MATCH. Both numbers come out of the stylesheet and the sum
    // is done here, so widening either one without thinking fails this.
    const reserve = Number(rule('.fr-band-drag').match(/right: (\d+)px/)[1]);
    const inset = Number(rule('.fr-out').match(/right: (\d+)px/)[1]);
    const size = Number(rule('.fr-out').match(/font-size: (\d+)px/)[1]);
    const pad = Number(rule('.fr-out').match(/padding: 0 (\d+)px/)[1]);
    // Both are measured from the RIGHT edge, so the window width cancels: the
    // lane ends `reserve` in and the button starts `inset + its width` in.
    // The widest that word can be is one glyph per character at the font size,
    // which no proportional face ever reaches, plus its padding on both sides.
    const widest = COPY.leave.length * size + pad * 2;
    expect(COPY.leave.split(' ')).toHaveLength(1);
    expect(inset + widest).toBeLessThan(reserve);
    // And it never eats into the capsule either. `.fr-band-pill` reserves 260px
    // of the window and is centred, so there is 130px of clear strip that side
    // at every width, down to the narrowest window the app will open.
    const pill = cssCode.slice(cssCode.indexOf('.fr-band-pill {'), cssCode.indexOf('.fr-band-dot'));
    const capsule = Number(pill.match(/max-width: min\(\d+px, calc\(100vw - (\d+)px\)\)/)[1]);
    expect(reserve).toBeLessThanOrEqual(capsule / 2);
    expect(read('main/main.mjs')).toMatch(/minWidth: 980/);
  });

  it('the strip really draws the lane, inside itself and before the capsule', () => {
    const drawn = renderToStaticMarkup(createElement(PracticeBand));
    expect(drawn).toMatch(/class="fr-band"/);
    expect(drawn).toMatch(/class="fr-band-drag"/);
    // Inside the band, and ahead of the capsule so the words are never under it.
    expect(drawn.indexOf('fr-band-drag')).toBeGreaterThan(drawn.indexOf('fr-band"'));
    expect(drawn.indexOf('fr-band-drag')).toBeLessThan(drawn.indexOf('fr-band-pill'));
    // It is furniture and it says so, so nothing reads it out.
    expect(drawn).toMatch(/class="fr-band-drag" aria-hidden="true"/);
  });

  it('the button keeps its own no-drag, because it is not the only strip up there', () => {
    // `:root[data-task-shape="edge"] .app.flat::before` is a second full-width
    // drag strip at the top of the window on an opened task. That one is
    // reported BEFORE this button (it is a pseudo-element of `.app`, which
    // contains everything), so the subtraction wins and this line is what does
    // the winning. Taking it off would reopen the same hole by another door.
    expect(rule('.fr-out')).toMatch(/-webkit-app-region: no-drag/);
  });
});

describe('2. Escape closes the card, because that is the key she pressed', () => {
  it('the card listens for it', () => {
    expect(wayOut).toMatch(/addEventListener\('keydown'/);
    expect(wayOut).toMatch(/e\.key !== 'Escape'/);
    expect(wayOut).toMatch(/setAsking\(false\)/);
  });

  it('listens in the capture phase and stops the press dead', () => {
    // App.tsx has its own window-level Escape handlers — closing an opened
    // task, closing the palette. Escape aimed at this card may not also close
    // something behind it on the way past.
    expect(wayOut).toMatch(/addEventListener\('keydown', on, true\)/);
    expect(wayOut).toMatch(/stopImmediatePropagation\(\)/);
    expect(wayOut).toMatch(/removeEventListener\('keydown', on, true\)/);
  });

  it('closes the card and does not also leave the walk', () => {
    // Escape dismisses a dialog everywhere on this machine. It is not a second
    // door out of the tutorial, or one stray press ends the walk silently.
    const listener = wayOut.slice(wayOut.indexOf("e.key !== 'Escape'"), wayOut.indexOf("addEventListener('keydown'"));
    expect(listener).not.toMatch(/onLeave/);
  });

  it('only listens while the card is up', () => {
    expect(wayOut).toMatch(/if \(!asking\) return undefined;/);
  });
});

describe('3. the card opens on the door out, and it is no louder for it', () => {
  it('draws the one that leaves first, and focuses it', () => {
    const row = code.slice(code.indexOf('fr-stay-row'), code.indexOf('</div>', code.indexOf('fr-stay-go')));
    expect(row.indexOf('fr-stay-go')).toBeLessThan(row.indexOf('fr-stay-keep'));
    expect(row).toMatch(/className="fr-stay-go" autoFocus onClick=\{onLeave\}/);
    expect(row).not.toMatch(/fr-stay-keep" autoFocus/);
    expect(row).toMatch(/className="fr-stay-keep" onClick=\{\(\) => setAsking\(false\)\}/);
  });

  it('is the drawn one, and the one that stays is the quiet one', () => {
    // The two shapes are the two shapes that were already here. They swapped.
    const go = rule('.fr-stay-go'), keep = rule('.fr-stay-keep');
    expect(go).toMatch(/border: 1px solid var\(--line-strong\)/);
    expect(go).toMatch(/background: none/);
    expect(keep).toMatch(/border: 0/);
    expect(keep).toMatch(/background: none/);
  });

  it('got no louder: no fill, no alarm colour, no bigger words', () => {
    // A card that shouts the way out is the same fault as one that shouts at
    // somebody for taking it.
    for (const sel of ['.fr-stay', '.fr-stay-head', '.fr-stay-line', '.fr-stay-go', '.fr-stay-keep']) {
      expect(rule(sel)).not.toMatch(/red|danger|--bad|--warn|#f[0-9a-f]{2}[0-9a-f]*/i);
    }
    expect(rule('.fr-stay-go')).not.toMatch(/font-weight/);
    expect(Number(rule('.fr-stay-go').match(/font-size: (\d+)px/)[1]))
      .toBe(Number(rule('.fr-stay-keep').match(/font-size: (\d+)px/)[1]));
  });

  it('still exists, and still says the same two things', () => {
    // Her decision of 2026-08-25 and it was not reopened: the card stays, so a
    // stray press cannot end the walk. Only what it recommends changed.
    expect(code).toMatch(/className="fr-stay-scrim" role="dialog" aria-modal="true"/);
    expect(COPY.leave).toBe('Skip');
    expect(COPY.leaveStay).toBe('Keep going');
    expect(COPY.leaveGo).toBe('Skip it');
    expect(COPY.leaveHead).toMatch(/\?$/);
    expect(COPY.leaveLine).toMatch(/⌘K/);
  });

  it('and leaving is still not a party', () => {
    expect(app).toMatch(/onLeave=\{\(\) => finishRun\(\[\], \{ celebrate: false \}\)\}/);
  });
});

describe('4. the walk stops eating the keys aimed at that card', () => {
  // A stand-in for a DOM node, because this repo has no jsdom and the thing
  // under test is the SELECTOR STRING rather than a browser's matching. It
  // walks up a chain and compares each simple selector verbatim, so dropping
  // `.fr-stay-scrim` out of `NOT_THE_WALK` fails these whatever else changes.
  const node = (is, parent = null) => ({
    parent,
    closest(sel) {
      const want = sel.split(',').map((s) => s.trim());
      for (let n = this; n; n = n.parent) if (want.includes(n.is)) return n;
      return null;
    },
    is,
  });
  const inTheCard = node('button', node('.fr-stay-scrim'));

  it('names the card among the things a press can be aimed at instead', () => {
    expect(NOT_THE_WALK).toContain('.fr-stay-scrim');
    // And the field rule it already had, which is beat ten's compose card.
    expect(NOT_THE_WALK).toContain('input');
    expect(NOT_THE_WALK).toContain('textarea');
    expect(NOT_THE_WALK).toContain('[contenteditable="true"]');
  });

  it('a press inside the card is not a press at the walk', () => {
    expect(pressCounts(inTheCard)).toBe(false);
    expect(pressCounts(node('button'))).toBe(true);
    expect(pressCounts(node('textarea'))).toBe(false);
    expect(pressCounts(null)).toBe(true);
  });

  it('so Return on the card reaches the button she is looking at', () => {
    // The exact press a tester made. Return IS a cap and it IS the wrong cap
    // for the `make` beat, which is why the walk used to swallow it — and
    // swallowing it cancelled the focused button's own activation, so the card
    // simply did not respond to the keyboard at all.
    const press = { key: 'Enter' };
    expect(keyToken(press)).toBe('↵');
    expect(swallowPress('C', press, node('button'))).toBe(true);
    expect(swallowPress('C', press, inTheCard)).toBe(false);
  });

  it('and the walk still swallows a wrong key aimed at the walk', () => {
    expect(swallowPress('C', { key: 'e' }, node('div'))).toBe(true);
    expect(swallowPress('C', { key: 'c' }, node('div'))).toBe(false);
  });
});

describe('5. the word is findable, which is not the same as loud', () => {
  it('is brighter than the 3:1 it was, and still under the low-key ceiling', () => {
    // MEASURED, not judged. The measurement reads the
    // contrast off the painted pixels of the built app over the dark
    // photograph the walk wears: 3.01:1 at the old 0.45, 5.28:1 now.
    // The ceiling is the built walk's own check — scripts/shot-the-built-walk.mjs
    // fails the run above 0.6 — which is what keeps "low-key" a number.
    const out = rule('.fr-out');
    const opacity = Number(out.match(/opacity: ([\d.]+)/)[1]);
    expect(opacity).toBeGreaterThan(0.45);
    expect(opacity).toBeLessThanOrEqual(0.6);
  });

  it('is still one small word with nothing drawn round it', () => {
    // Findable is the second half of that sentence and it is the half a
    // tester needed.
    const out = rule('.fr-out');
    expect(out).toMatch(/border: 0/);
    expect(out).toMatch(/background: none/);
    expect(Number(out.match(/font-size: (\d+)px/)[1])).toBeLessThanOrEqual(12);
    // And no cap on it, so it never competes with the key the beat is asking
    // for. There is still no keyboard route INTO the card; the listener added
    // above is a way back OUT of it, which is a different thing.
    expect(wayOut).not.toMatch(/<kbd/);
    // And exactly one thing opens the card: a press of the button itself. The
    // Escape listener added above only ever closes it.
    expect(wayOut.match(/setAsking\(true\)/g)).toHaveLength(1);
    expect(wayOut).toMatch(/className="fr-out" onClick=\{\(\) => setAsking\(true\)\}/);
  });
});
