// HER FOUR CHANGES OF 2026-08-24 EVENING, pinned.
//
// She walked the built onboarding in her own app and answered with four things.
// Three of them move something that already worked, which is exactly the shape
// of change that gets quietly undone by the next session, so each one is here
// with her sentence beside it.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR, COACHED, COPY, BEAT, INTRO, N_BEATS, START,
  advance, coach, finishCard, walkRows,
  wearsTheWalksLook,
} from '../renderer/src/onboarding.ts';
import { DEFAULT_SKIN, LOOKS, SKINS, SKIN_KEY, idleSkin, lookMeans, seedFirstRunLook, walkSkin } from '../renderer/src/skins.ts';
import { THEME_KEY } from '../renderer/src/theme.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = read('renderer/src/components/Onboarding.tsx');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');

/* ========================================================================== */
/* 1. GOUACHE VALLEY IS THE DEFAULT                                           */
/* ========================================================================== */

describe('the default picture is the one she walked onboarding in', () => {
  it('is Gouache Valley, and it is one constant', () => {
    expect(DEFAULT_SKIN).toBe('ember-grid');
    // Which is a real shipping theme with its own measured dim, not a name
    // typed into a constant.
    expect(SKINS.some((s) => s.id === DEFAULT_SKIN)).toBe(true);
  });

  // AND IT IS WHAT A MAC THAT HAS CHOSEN NOTHING STARTS ON. It stopped being
  // that for one day: seeded plain dark on 2026-09-01, reading her 08-30
  // sentence about a look being PUT ON her window as a ruling about the default
  // too.
  it('is written into a store that has chosen nothing', () => {
    const store = new Map();
    const s = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    expect(seedFirstRunLook(s, THEME_KEY)).toEqual(lookMeans(DEFAULT_SKIN));
    expect(store.get(SKIN_KEY)).toBe('ember-grid');
    // Both keys are still written or the next screen falls through to whatever
    // the Mac prefers, which is the bug this seed exists for. A picture is
    // dark, so the theme key goes with it.
    expect(store.get(THEME_KEY)).toBe('dark');
  });

  it('is what the walk pins when nothing has been picked', () => {
    // THE CONSTANT WAS THE FALLBACK INSIDE THE CALL, NOT THE CALL (2026-08-26),
    // and the fallback is back where the WALK is concerned and nowhere else.
    // Two pins, two functions, split on 2026-09-01: the walk opens on a picture
    // and the idle page opens on the one that was picked or on nothing.
    expect(app).toContain('const pinned: SkinChoice = walkSkin(skin);');
    // The landscape, not the default, since w-ec62ab6b38 (2026-09-28): Ember
    // became the default and the setup screens went near black.
    expect(walkSkin('none')).toBe('gouache-valley');
    expect(walkSkin(DEFAULT_SKIN)).toBe('gouache-valley');
    expect(app).toContain('const pinned: SkinChoice = idleSkin(skin);');
    expect(idleSkin('none')).toBe('none');
    expect(idleSkin('lake')).toBe('lake');
    expect(app).toMatch(/if \(firstRunPinned\) \{/);
    expect(app).toMatch(/if \(idlePinned\) \{/);
    expect(read('renderer/src/skins.ts')).not.toContain('IDLE_SKIN');
  });

  it('takes the lake with it rather than deleting it', () => {
    // She named a new default, not a removal. Lake is still pickable and still
    // carries the two dials she measured herself.
    expect(SKINS.some((s) => s.id === 'lake')).toBe(true);
  });
});

/* ========================================================================== */
/* 2. PICKING THE THEME IS A STEP                                             */
/* ========================================================================== */

describe('picking how it looks is a step of the walk', () => {
  it('stands between the introduction and the practice round', () => {
    // It was the fourth screen for a day, between the name and the
    // introduction.
    //
    // This is the first of her two, and it keeps what the fourth slot was for:
    // everything after this screen is the real app, so the pick is worn by the
    // whole practice round rather than by one card.
    const made = advance({ ...START, step: 'name' }, { t: 'made', product: 'p' });
    expect(made.step).toBe('inbox');
    expect(BEAT.look).toBe(7);
    expect(BEAT.look).toBeGreaterThan(BEAT[INTRO[0]]);
    expect(BEAT.look).toBeLessThan(BEAT.make);
    // Eighteen since w-ec62ab6b38 (2026-09-28) took the note beat out.
    expect(N_BEATS).toBe(18);
  });

  it('draws Settings own tiles off one list, not a second copy of them', () => {
    // Two screens draw this now. A second copy of a list kept in step with the
    // first by nothing is the fault that broke the introduction's Next button
    // and the tab tour in one day.
    // 2026-09-14: Haze defaults lead, plain themes finish, system tile retired.
    // September 21: the two new backgrounds lead in the requested order.
    // 2026-09-28, w-2ff620f13b: Ember Grid moves to the front.
    expect(LOOKS[0]).toEqual({ id: 'ember-grid', name: 'Ember Grid' });
    expect(LOOKS[1]).toEqual({ id: 'valley-haze', name: 'Valley Haze' });
    expect(LOOKS[2]).toEqual({ id: 'frost-haze', name: 'Frost Haze' });
    expect(LOOKS.slice(-2).map(l => l.id)).toEqual(['light', 'dark']);
    expect(LOOKS).toHaveLength(SKINS.length + 2);
    // THREE SCREENS DRAW THIS LIST NOW, not two: Settings, the ⌘K theme bar and
    // the walk. The bar built its own copy until 2026-08-24 and adding Match my
    // system is what found it.
    for (const src of [
      'renderer/src/components/Settings.tsx',
      'renderer/src/components/ThemePicker.tsx',
      'renderer/src/components/Onboarding.tsx',
    ]) {
      expect(read(src)).not.toMatch(/const LOOKS: Array</);
    }
    for (const src of ['renderer/src/components/Settings.tsx', 'renderer/src/components/ThemePicker.tsx']) {
      expect(read(src)).toMatch(/LOOKS\.map\(\(l\) => \(/);
      expect(read(src)).toContain('className={`look-swatch ${l.id}`}');
    }
    expect(walk).toContain('className={`look-swatch shot ${l.id}`}');
    // w-ec62ab6b38 (2026-09-28): the walk row names its tiles off SKINS, since plain Dark and Light left it.
    expect(walk).toMatch(/SKINS\.find\(\(s\) => s\.id === id\)/);
    expect(walk).not.toContain('FLAT_LOOKS');
  });

  it('really sets it, so the window repaints under the hand', () => {
    // The pin covers every screen before the picker and stops. `look` is
    // deliberately outside it: a screen that pins the default while she presses
    // tiles is a picker that does not work.
    //
    // THE THREE NAMES CAME OUT ON 2026-08-26. This read `welcome || folder ||
    // name`, true only while the picker was beat four; it moved to beat seven
    // and the introduction's slabs fell through the hole. Read off the order now.
    expect(app).toContain('const firstRunPinned = run !== null && wearsTheWalksLook(run.step);');
    expect(wearsTheWalksLook('look')).toBe(false);
    expect(app).toContain('onSetLook={setLook}');
    expect(walk).toContain('onPick={onSetLook}');
  });

  it('says where it lives afterwards, which is the command bar half of her ask', () => {
    expect(COPY.lookClause).toContain('⌘K');
    // AND IT NAMES THE WORD TO TYPE, 2026-08-31.Measured on the build she was
    // testing: ⌘K opens THIRTY-FIVE rows, NINE of them on the screen at once,
    // and "Themes…" is the TWENTY-SECOND. A sentence that names only the key
    // sends her to scan thirteen rows past the fold for a word it never gave
    // her. The word here has to be one `lookRows` actually answers to, which
    // the keyword assertion below is what holds it to.
    expect(COPY.lookClause).toContain('theme');
    // And that is not a promise the app cannot keep: the picker row is already
    // there, found by the word theme. It still answers to the picture words
    // too, deliberately, so a hand that types "wallpaper" out of habit lands on
    // the look picker rather than on nothing.
    expect(read('renderer/src/palette-rows.ts')).toMatch(/keywords: 'theme themes background picture/);
  });
});

/* ========================================================================== */
/* 3. THE SIDEBAR NOTE IS A BEAT, NOT A PAGE                                  */
/* ========================================================================== */

describe('the sidebar note is shown in the walk rather than described on a page', () => {
  it('is not one of the introduction slabs', () => {
    expect(COPY.intro).toHaveLength(3);
    for (const slab of COPY.intro) expect(slab.piece).not.toBe('notes');
    expect(INTRO).toEqual(['inbox', 'away', 'goal', 'hand']);
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
    expect(COPY.bringHead).toBe('Add the agents already on this Mac.');
    expect(COPY.finishHead).toBe('You are ready to get started.');
  });

  it('is a card on a Mac with nothing to import too, since 2026-08-28', () => {
    // The card that used to be skipped here now appears with its empty answer
    // on it, which is where somebody with no agents yet is told Agentbox takes
    // them and where the door is.
    expect(finishCard({ missing: false }, { read: true, some: false }))
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

describe('the three faults driving the built walk caught', () => {
  it('does not let the inbox-zero pin paint over the picker', () => {
    // Measured: pressing a tile gave {"lit":"Pixel
    // Ridge","skin":"gouache-valley", "stored":"pixel-ridge"}. The app behind
    // the walk is an empty inbox, so `idlePinned` was true and the effect
    // painted the default back over her choice on every render. AND THE GUARD
    // IS NOW THE WHOLE WALK, NOT THE PICKER SCREEN. Widened on 2026-08-25: the
    // pin was still on for every beat of the practice round where the inbox
    // happened to be empty, so a walk in Light went dark on five of its
    // screens.
    expect(app).toContain("const idlePinned = run === null && skin === 'none'");
    // `run === null` is the guard this test is about and it has not moved. The
    // walk's own pin took a branch of its own on 2026-09-01, and it stops at
    // the picker for the same reason: `wearsTheWalksLook` is false from the
    // look step onward, so nothing paints over a pressed tile.
    expect(app).toMatch(/if \(idlePinned\) \{/);
    expect(wearsTheWalksLook('look')).toBe(false);
  });

  it('makes the shot harness a real first run rather than a set-up Mac', () => {
    // The harness opened by writing zero.theme and zero.skin itself, which is
    // exactly what `seedFirstRunLook` does, so the app's own seed never ran and
    // every shot ever taken of the walk was of a Mac that was already set up.
    const shot = read('scripts/shot-the-built-walk.mjs');
    expect(shot).toContain("localStorage.clear(); return true;");
    // AND IT STILL DOES NOT, UNLESS IT IS ASKED TO (2026-08-26). `WAS=` writes
    // both keys on purpose, to reproduce the Mac she is actually on: set up
    // months ago, already chosen, reaching the walk from ⌘K. The app's own seed
    // must not fire there and does not, which is the state her bug lives in and
    // the one state this harness could never photograph. It is off by default,
    // so the ordinary run is the fresh install it has always been.
    expect(shot).toContain('const WAS = process.env.WAS ?? null;');
    const always = shot.slice(0, shot.indexOf('const WAS = process.env.WAS'));
    expect(always).not.toMatch(/localStorage\.setItem\('zero\.skin'/);
  });

  it('gives the picker question its own type, not the setup cards label', () => {
    // `.fr-q` is defined further down styles.css than `.fr-look-q`, so wearing
    // both put the 13px label of the folder card on the biggest question in the
    // walk. Source order, not a cascade anybody meant.
    expect(walk).toContain('<h1 className="fr-look-q">{COPY.lookQ}</h1>');
    expect(walk).not.toContain('className="fr-q fr-look-q"');
    const q = css.slice(css.indexOf('\n.fr-look-q {'), css.indexOf('}', css.indexOf('\n.fr-look-q {')));
    expect(q).toContain('font-size: 30px');
  });
});
