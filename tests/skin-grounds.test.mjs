// EVERY SCREEN ANSWERS THE PICTURE THEME, and the invariant that keeps it that
// way when somebody adds the next screen.
//
// Two screens were flat `var(--bg)`, so the photograph stopped at their edge
// and left a black slab where the window should have been.
//
// WHY THIS IS A TEST AND NOT A FIX. Neither bug was introduced by anyone
// touching the theme. They were there from the moment the theme shipped,
// because a picture theme is written as a LIST of surfaces to change and a new
// screen is not on a list nobody re-reads. Nothing fails, nothing errors, no
// diff looks wrong: the screen just comes up a slab, and it stays that way
// until somebody opens it and notices. That is the whole failure mode, and a
// list checked by hand is what produced it.
//
// So the suite finds the grounds itself, out of the stylesheet, by the shape
// they are written in rather than by name — an opaque background on something
// that fills the window — and demands that each one be ANSWERED. Add a screen
// with a ground of its own and this fails until you have said what it does
// under a photograph. The answer may perfectly well be "stays opaque"; it may
// not be silence.
//
// The five answers, and each is a real screen in this app: GLASS --skin-pane
// over --skin-blur. A card standing on the window. PHOTOGRAPH the same three
// layers `body` wears. For a ground that is fixed OVER the app, where
// transparent would show the app through it. NOTHING `transparent`. For a
// ground in the flow with `body` behind it. SOLID --skin-solid, the theme's own
// window averaged and wearing the theme's own card wash. For a surface she
// WRITES on, where anything showing through is in the way. OPAQUE left alone,
// on purpose, and named below with the reason. Note that this is NOT the same
// as SOLID: opaque means the app's own grey, untouched by the theme; solid
// means the theme's colour with no transparency in it.
//
// The harness is the other half of this: it opens every
// screen in a real headless build with the skin on and reports what actually
// painted. This file cannot see a slab that comes from a token; that one can.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

// Enough of a parser for a stylesheet with no @media and no nesting, which this
// one is. The rule count is asserted below, because a parser that quietly saw
// half the file would make every expectation here pass for the wrong reason.
//
// COMMENTS COME OUT FIRST, and this file is why: half the declarations in the
// skin block have a paragraph above them explaining the number, so a property
// is very often separated from the `;` before it by a comment rather than by
// whitespace. Reading `background-blend-mode` off the body without stripping
// them finds nothing and the check passes by being unable to look.
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  sel: m[1].trim(),
  body: m[2],
}));

// THE TOKEN BLOCK IS NOT A SURFACE RULE. `:root[data-theme="dark"],
// :root[data-skin]` declares the dark colours for a window wearing a picture
// (: a skin implies dark, in the stylesheet and not only in skins.ts). It
// names `[data-skin]` but it paints nothing, so the checks below about WHICH
// SURFACES a picture changes must not see it.
const selList = (sel) => sel.split(',').map((x) => x.trim());

const skinRules = rules.filter((r) => (r.sel.includes('[data-skin]') || r.sel.includes('[data-skin='))
  && !selList(r.sel).includes(':root[data-theme="dark"]'));

// A token read out of one of the three blocks that declare them. `light` is the
// bare `:root`, which is this file's default theme; the other two say so in
// their selector. Used by the new-task card's checks below, which are about
// VALUES rather than about which surfaces changed.
// A PICTURE'S KEY IS ITS OWN ID, which is what the four that arrived on
// 2026-08-21 need: there are five picture blocks now, not one.
const TOKEN_BLOCK = { light: ':root', dark: ':root[data-theme="dark"]' };
const blockSel = (theme) => TOKEN_BLOCK[theme] ?? `:root[data-skin="${theme}"]`;
const tokenOf = (theme, name) => {
  const sel = blockSel(theme);
  // The dark block answers for two selectors at once now, so this looks in the
  // comma-separated list rather than for an exact match on the whole string.
  const rule = rules.find((r) => selList(r.sel).includes(sel));
  if (!rule) throw new Error(`no ${sel} block in the stylesheet`);
  const m = rule.body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:([^;]*)`));
  return m ? m[1].trim() : null;
};
const paints = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:([^;]*)`));
  return m ? m[1].trim() : null;
};

// An opaque fill: one of the app's flat surface tokens, or a literal colour.
// Everything the skin uses is an rgba or a var(--skin-*), so none of those
// match and a rule that has already been answered does not look like a ground.
const OPAQUE = /background(?:-color)?\s*:\s*(var\(--bg\)|var\(--bg-raised\)|var\(--surface\)|var\(--bg-selected\)|#[0-9a-fA-F]{3,8})\s*(;|$)/;

// FILLS THE WINDOW, written the two ways this stylesheet writes it: pinned to
// every edge, or a flex child told to take the rest of the room. `min-width: 0`
// is what separates the second from an ordinary `flex: 1` control like the
// browser's URL field or a status button, which are not grounds and must not
// drag this suite into policing every input in the app.
const isGround = (body) => /inset:\s*0/.test(body) || (/flex:\s*1/.test(body) && /min-width:\s*0/.test(body));

// AND THE CARDS THAT FLOAT OVER THE WHOLE WINDOW, which is the hole this file
// had and which cost a second design round. A modal is not a ground by size,
// it is a ground by POSITION: `.modal-backdrop` is `position: fixed; inset: 0`
// and the card is the only thing painting inside it, so on a picture theme it
// is exactly as much of a decision as the shelf is. Matched by shape, not by
// name, so the next `.modal.something` is caught too.
const isOverlayCard = (sel) => /^\.modal(\.[\w-]+)*$/.test(sel.trim());

const grounds = rules.filter((r) => !r.sel.includes('[data-skin')
  && OPAQUE.test(r.body)
  && (isGround(r.body) || isOverlayCard(r.sel)));

// THE ANSWERS, one line each. Adding a ground means adding a line here, which
// is the point: the line is where you have to say what it does under a picture.
const ANSWERS = {
  // A line here for a rule the stylesheet does not have is what the last test
  // in this file catches.
  '.list-pane': 'glass',
  // SETTINGS TOOK THE PICTURE ON 2026-08-20, and this line used to say the
  // opposite, so here is why it turned over. The page was redrawn, and the
  // quiet page has no cards and no sheet in it at all, only text on a ground.
  // So the ground is the photograph, taken the same way `body` takes it, and
  // the screen is continuously the same window it was opened from.
  //
  // The screen is still `position: absolute; inset: 0` over a mounted inbox, so
  // it cannot answer "nothing": transparent here shows the inbox through the
  // settings. Photograph, not nothing, and the difference is the app
  // behind it.
  '.settings-screen': 'photograph',
  // The pane inside it, which now has the screen behind it rather than `body`,
  // so it takes the ordinary in-the-flow answer. Left opaque it would paint the
  // photograph out of everything right of the nav column.
  '.set-pane': 'nothing',
  // The modal family's own fill, and it stays. Snooze, standing instructions
  // and connect all lie ON TOP of the app and a sheet you can see a photograph
  // through stops being a sheet; none of them has been asked to change.
  //
  // TWO EXCEPTIONS, BOTH CHOSEN ON PURPOSE, and both are surfaces the user
  // TYPES INTO rather than reads: the new-task card and ⌘K. Each overrides this on a MORE specific
  // selector — `.modal.compose` and `.modal.palette` — rather than changing
  // this line, so `skinRuleFor('.modal')` does not match either of them and
  // this answer stays honest. They take the SAME token; a third answer for a
  // third card is what this table exists to stop. Their own checks are at the
  // foot of this file.
  '.modal': 'opaque',
  // THE APP DRAWN BEHIND THE WALK'S THEME STEP. Shot that way once, on the
  // day it was built: the tab strip printed twice on one line.
  '.fr-look-app': 'photograph',
  // THE PERMISSION PAGE USED TO BE ANSWERED HERE AND IS NOT A GROUND ANY MORE.
  // While the pictures were deleted it was redrawn as a row rather than a `position: fixed; inset: 0` sheet with a ground of its
  // own, so it no longer paints the window and there is nothing here to decide,
  // and the detector above agrees: it does not find it. Deleted from this map
  // with the pictures restored, 2026-09-01. If that screen ever fills the
  // window again the check above fails until somebody decides what it does
  // under a photograph.
};

describe('the stylesheet is readable enough for this to mean anything', () => {
  it('parses a stylesheet, not a handful of rules', () => {
    expect(rules.length).toBeGreaterThan(400);
  });

  it('finds the grounds by shape, and finds all of them', () => {
    // Fewer than this and the detector has stopped matching how the file is
    // written, which would make every check below vacuously true. The floor
    // moves with the app, the check does not.
    expect(grounds.length).toBeGreaterThanOrEqual(5);
  });
});

describe('every ground answers the picture theme', () => {
  // THE INVARIANT. A ground the stylesheet knows about and this file does not
  // is a screen nobody has decided about, and the way that reaches her is as a
  // black rectangle where the window should be.
  it('has an answer on file for every full-window ground', () => {
    const unanswered = grounds.map((g) => g.sel).filter((sel) => !(sel in ANSWERS));
    expect(
      unanswered,
      `these grounds have no answer for the picture theme: ${unanswered.join(', ')}. `
      + 'Decide what each does under a photograph (glass, photograph, nothing, or opaque '
      + 'with a reason), write the rule in the skin block at the end of styles.css, and add '
      + 'a line to ANSWERS in this file.',
    ).toEqual([]);
  });

  it('answers no ground that is not there any more', () => {
    const stale = Object.keys(ANSWERS).filter((sel) => !grounds.some((g) => g.sel === sel));
    expect(stale, `ANSWERS names grounds the stylesheet no longer has: ${stale.join(', ')}`).toEqual([]);
  });
});

describe('each answer is actually written in the stylesheet', () => {
  const skinRuleFor = (sel) => skinRules.find((r) => new RegExp(`:root\\[data-skin\\](?:\\s|,).*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(r.sel)
    || r.sel.split(',').some((s) => s.trim() === `:root[data-skin] ${sel}`));

  for (const [sel, answer] of Object.entries(ANSWERS)) {
    if (answer === 'opaque') {
      it(`${sel} is left opaque and nothing in the skin block touches it`, () => {
        expect(skinRuleFor(sel), `${sel} is answered "opaque" but the skin block changes it`).toBeFalsy();
      });
      continue;
    }

    it(`${sel} is answered "${answer}" in the skin block`, () => {
      const rule = skinRuleFor(sel);
      expect(rule, `${sel} has no :root[data-skin] rule`).toBeTruthy();
      const bg = paints(rule.body, 'background') ?? paints(rule.body, 'background-color');
      if (answer === 'glass') {
        expect(bg).toBe('var(--skin-pane)');
        expect(paints(rule.body, 'backdrop-filter')).toBe('blur(var(--skin-blur))');
      }
      if (answer === 'nothing') {
        expect(bg).toBe('transparent');
        // Nothing means nothing: a blur here would be a wash by another name.
        expect(paints(rule.body, 'backdrop-filter')).toBeFalsy();
      }
      if (answer === 'photograph') {
        // The same three layers in the same order as `body`, or it is a
        // different picture from the one in the window next to it.
        expect(paints(rule.body, 'background-image')).toBe('var(--skin-veil), var(--skin-tint), var(--skin-image)');
        expect(paints(rule.body, 'background-blend-mode')).toBe('normal, multiply, normal');
        expect(paints(rule.body, 'background-size')).toBe('cover, cover, cover');
      }
    });
  }
});

describe('the plain themes are untouched', () => {
  // A skin is a second axis over dark, so every rule added for it must be
  // unreachable without a picture on. One unscoped rule here would change the
  // app for someone who never chose a photograph.
  it('scopes every ground answer to a root carrying a skin', () => {
    for (const sel of Object.keys(ANSWERS)) {
      const rule = skinRules.find((r) => r.sel.includes(sel));
      if (rule) expect(rule.sel.startsWith(':root[data-skin]')).toBe(true);
    }
  });
});

describe('the new-task card, which is the one she came back about twice', () => {
  // That round gave it the photograph.
  //
  // So the card is a FLAT OPAQUE FILL whose colour comes from the theme. The
  // three requirements are three separate checks below, because each has a
  // different way of being quietly undone.
  const compose = () => skinRules.find((r) => r.sel === ':root[data-skin] .modal.compose');

  it('is painted with the theme’s own solid, not a colour somebody chose', () => {
    const rule = compose();
    expect(rule, 'the new-task card has no skin rule: it is the app’s grey on a picture theme').toBeTruthy();
    expect(paints(rule.body, 'background')).toBe('var(--skin-solid)');
  });

  // COMPLETELY OPAQUE, and there are three separate ways to lose it: a
  // translucent fill, a blur, or the photograph coming back. Glass here is the
  // measured failure, not a hypothetical: shot with the inbox behind it and then
  // with the rows hidden, 21% of the card's pixels moved, worst pixel 38. The
  // inbox rows were legible through the field being typed in. The shipped fill moves
  // 0.0% of the card with a worst pixel of 0.
  it('shows nothing at all through itself', () => {
    const rule = compose();
    expect(paints(rule.body, 'backdrop-filter'), 'a blur on a surface she writes on').toBeFalsy();
    expect(paints(rule.body, '-webkit-backdrop-filter')).toBeFalsy();
    expect(paints(rule.body, 'background-image'), 'the picture is back on the card she asked to be opaque').toBeFalsy();
    expect(paints(rule.body, 'background-attachment')).toBeFalsy();
    // The fill itself must be a plain colour. An rgba with an alpha under 1 is
    // the same defect wearing the right variable name.
    const solid = tokenOf('lake', '--skin-solid');
    expect(solid, 'the lake theme defines no --skin-solid').toBeTruthy();
    expect(solid, `--skin-solid is ${solid}, which is not fully opaque`).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  // NOT PURE CHARCOAL. --bg is what the card wore before this item and it read
  // as pure black. This is the required distance from it, in the only units it
  // can be checked in.
  it('is not the charcoal she asked it not to be', () => {
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const solid = rgb(tokenOf('lake', '--skin-solid'));
    const bg = rgb(tokenOf('lake', '--bg'));
    const away = Math.hypot(...solid.map((v, i) => v - bg[i]));
    expect(away, `--skin-solid is ${Math.round(away)} from --bg; that is the charcoal she rejected`).toBeGreaterThan(25);
    // And it carries the lake rather than being a neutral grey: the picture's
    // blue leads its red, which is the whole reason the window is slate.
    expect(solid[2] - solid[0], '--skin-solid has no blue in it, so it is a grey and not this theme').toBeGreaterThan(8);
  });

  // MATCHES THE THEME, which was settled to mean one exact thing: it IS the
  // colour of the reply box. The harness
  // opens that box in this theme, hides its contents, and records the mean
  // colour of the surface. If the photograph is ever replaced, or the reply
  // box's own wash changes, this fails until the script is run again, which is
  // the point — the colour is a measurement of that surface.
  it('still matches the reply box it was measured off', () => {
    const rec = JSON.parse(fs.readFileSync(path.join(root, 'tests/measurements/skin-solid/derive-skin-solid.json'), 'utf8'));
    expect(tokenOf('lake', '--skin-solid').toLowerCase()).toBe(rec.solidHex.toLowerCase());
    // And the recording has to be of the right surface. A run that measured the
    // collapsed "Reply…" pill, or an unfocused box, would be measuring the bare
    // photograph, because the skin leaves the box transparent in both states.
    expect(rec.source, 'the reading is not of .dock-card:focus-within').toMatch(/dock-card:focus-within/);
    expect(rec.computedFill, 'the box was not wearing the wash when it was read').toMatch(/^rgba\(/);
  });

  // AND THE CARD ACTUALLY LANDS ON IT. The token being right is not the same as
  // the card wearing it: something could paint over the card, or the build
  // could be stale. The same script opens the new-task card in the same frame,
  // hides its contents the same way, and reads its surface.
  it('puts the card on exactly that colour, measured', () => {
    const rec = JSON.parse(fs.readFileSync(path.join(root, 'tests/measurements/skin-solid/derive-skin-solid.json'), 'utf8'));
    expect(rec.card, 'the run recorded no reading of the card itself').toBeTruthy();
    const away = Math.hypot(rec.card.r - rec.surface.r, rec.card.g - rec.surface.g, rec.card.b - rec.surface.b);
    expect(away, `the card reads ${Math.round(away)} away from her reply box`).toBeLessThan(1);
  });

  // THE OTHER PICTURES ARE HELD TO THE SAME MEASUREMENT. Each one's writing
  // surface is ITS OWN photograph's reply box, not the Lake's, so each has its
  // own run of the harness filed under its own name. The Lake's own thresholds
  // above are NOT
  // repeated here on purpose: they say the fill must be far from charcoal and
  // must lead blue, which is true of that photograph and is not a law about
  // pictures. Ice is a grey-blue cave and its box honestly measures rgb(36, 38,
  // 40); asserting the Lake's numbers on it would be asserting a taste, and
  // this file only asserts readings. READ OFF skins.ts, NOT LISTED. This was
  // the literal ['ice', 'ice-river', 'ice-vault', 'lake-harbour'] and it broke
  // on the next design round, when Ice Vault was deleted and eight more
  // pictures became themes. Every picture except the Lake, whose own stricter
  // block is above, is held to its own measured reading, and a picture added
  // without a run of the script fails here on a missing file rather than
  // passing on nobody's list.
  const skinSrc = fs.readFileSync(path.join(root, 'renderer/src/skins.ts'), 'utf8');
  const shippedSkins = [...skinSrc.split('export const SKINS')[1].split('\n];')[0]
    .matchAll(/\{ id: '([^']+)'/g)].map((m) => m[1]).filter((i) => i !== 'lake');
  it('has more than one picture theme, so the loop below is not empty', () => {
    expect(shippedSkins.length).toBeGreaterThan(1);
  });
  // A DRAWN GROUND HAS NO PHOTOGRAPH TO READ A REPLY BOX OFF. Ember
  // Grid (w-b3e123a0af) puts the box on a solid panel over a flat near-black, so
  // there is nothing behind it to average and its solid is the panel itself.
  // It is held to exactly that instead of to a recording that cannot exist:
  // the script that made the recordings was deleted with the harnesses.
  const isDrawn = (skin) => /^url\(["']?data:/.test(tokenOf(skin, '--skin-image').trim());
  for (const skin of shippedSkins.filter(isDrawn)) {
    it(`${skin} is drawn, so its solid is its own panel`, () => {
      expect(tokenOf(skin, '--skin-solid').toLowerCase()).toBe(tokenOf(skin, '--surface').toLowerCase());
    });
  }
  for (const skin of shippedSkins.filter((s) => !isDrawn(s))) {
    it(`${skin} wears the colour of its own reply box, measured`, () => {
      const rec = JSON.parse(fs.readFileSync(path.join(root, `tests/measurements/skin-solid/derive-skin-solid-${skin}.json`), 'utf8'));
      expect(rec.skin, 'the recording is of a different theme').toBe(skin);
      expect(tokenOf(skin, '--skin-solid').toLowerCase()).toBe(rec.solidHex.toLowerCase());
      expect(rec.source, 'the reading is not of .dock-card:focus-within').toMatch(/dock-card:focus-within/);
      expect(rec.computedFill, 'the box was not wearing the wash when it was read').toMatch(/^rgba\(/);
      const away = Math.hypot(rec.card.r - rec.surface.r, rec.card.g - rec.surface.g, rec.card.b - rec.surface.b);
      expect(away, `the card reads ${Math.round(away)} away from the reply box in ${skin}`).toBeLessThan(1);
    });
  }

  // NOTHING BECOMES THE WINDOW.The round that made the compose screen wear
  // the photograph is reverted, and this fails if anyone puts it back.
  it('leaves the compose screen’s backdrop exactly as it was', () => {
    expect(
      skinRules.some((r) => r.sel.includes('.modal-backdrop')),
      'the compose backdrop has a skin rule again; she said no screen becomes the window',
    ).toBe(false);
  });

  // A window with no picture on it must be byte-for-byte the app that was here
  // before, which is the standing rule for this whole section. --skin-solid is
  // named inside the skin block, so it has to resolve to the old card there.
  it('falls back to the app’s own card when no picture is on', () => {
    for (const theme of ['dark', 'light']) {
      expect(tokenOf(theme, '--skin-solid'), `${theme} has no --skin-solid fallback`).toBe('var(--bg-raised)');
    }
  });

  // ONE RULE, TWO CARDS, the same invariant GameShell carries for the games.
  // NewProject renders `modal compose np-card`, so the new-project card is this
  // card, which is what was approved. If it ever stops sharing the
  // class, one of the two silently goes back to being the app's grey.
  it('keeps the new-project card on the same rule', () => {
    const np = fs.readFileSync(path.join(root, 'renderer/src/components/NewProject.tsx'), 'utf8');
    expect(np, 'NewProject no longer renders .modal.compose, so it has its own ground now')
      .toMatch(/className="modal compose np-card"/);
  });

  // THE SAME TOKEN, NOT A SECOND IDEA, which is the whole point of the line it
  // used to be on. It is a surface she types into, like the new-task card, so it
  // gets that card's answer.
  it('puts ⌘K on the new-task card’s own token, not a colour of its own', () => {
    const rule = skinRules.find((r) => r.sel.split(',').some((s) => s.trim() === ':root[data-skin] .modal.palette'));
    expect(rule, '.modal.palette has no skin rule, so ⌘K is the app’s grey again').toBeTruthy();
    expect(paints(rule.body, 'background')).toBe('var(--skin-solid)');
    // No blur and no wash: the rule is completely opaque, and a blur on an
    // opaque fill costs a compositing layer for something that cannot be seen.
    expect(paints(rule.body, 'backdrop-filter') ?? 'none').toBe('none');
  });

  // ONE RULE, THREE CARDS. The rules box stopped being its own look, and the
  // note above this section already said what that
  // costs: the same token, not a second idea. So Standing renders the card
  // too.
  it('keeps the rules card on the same rule', () => {
    const standing = fs.readFileSync(path.join(root, 'renderer/src/components/Standing.tsx'), 'utf8');
    expect(standing, 'the rules box no longer renders .modal.compose, so it has its own ground again')
      .toMatch(/className="modal compose rules-card"/);
  });

  // Snooze was not asked about and has not moved. The palette took the token
  // above, standing took the rules card, and connect went out with the app
  // cut. This is here so that changing snooze is a decision somebody takes on
  // purpose. If it is ever asked for, it takes --skin-solid too.
  it('leaves snooze alone', () => {
    for (const sel of ['.modal.snooze']) {
      expect(
        skinRules.some((r) => r.sel.includes(sel)),
        `${sel} now has a skin rule; that was never asked for, so say why here`,
      ).toBe(false);
    }
  });
});
