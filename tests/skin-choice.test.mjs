// The picture themes: which one you get, and the two ways one can exist
// halfway and say nothing about it.
//
// A skin is a name in `SKINS`, a token block in the stylesheet, and a file on
// disk, and NONE of the three fails loudly on its own. A name with no block is
// an attribute nothing in the CSS matches, so picking it turns the whole
// control off and the window simply does not change. A block with no file is a
// `background-image` that resolves nowhere, which paints the fallback colour
// and looks like a theme that is merely dark. Both read as "the theme does not
// work" and neither logs anything, which is why they are asserted here rather
// than reviewed.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySkin, applyTune, DEFAULT_SKIN, lookMeans, lookOf, resolveSkin, resolveTune, seedFirstRunLook, skinName, SKINS, SKIN_KEY, storeTune, TUNE_DEFAULT, TUNE_LIMITS } from '../renderer/src/skins.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cssPath = path.join(root, 'renderer/src/styles.css');
const css = fs.readFileSync(cssPath, 'utf8');

// A DRAWN GROUND IS NOT A PHOTOGRAPH, and the file checks below are about
// photographs: on disk, under a byte budget, wide enough for her screen, with
// a small copy for the laptop panel. Ember Grid (w-b3e123a0af) draws its dot grid
// as an inline SVG with no size of its own, so it cannot be missing, has no
// pixels to stretch and no grain to soften. It is held instead to being an
// inline SVG, which is the one way a drawn ground could still be broken.
const imageOf = (id) => {
  const at = css.indexOf(`:root[data-skin="${id}"] {`);
  return css.slice(at, css.indexOf('\n}', at)).match(/--skin-image:\s*url\(['"]?([^'")]+)/)?.[1];
};
const drawn = (id) => (imageOf(id) ?? '').startsWith('data:');
const photographs = SKINS.filter((s) => !drawn(s.id));

// A REAL PICTURE, taken off the list rather than named. Everything below that
// is about the STORE (junk in localStorage, clamping, one picture's dials not
// wiping another's) needs a skin id to work with and does not care which one.
// It used to say 'mountain', and when she removed Mountain on 2026-08-18 those
// tests would all have failed for the wrong reason. Off the list they cannot.
// The original two-dial contract uses a theme without optional opacity.
// Peach opacity has its own persistence and boundary tests.
const SOME = SKINS.find(s => TUNE_DEFAULT[s.id].panelOpacity === undefined).id;

describe('resolveSkin', () => {
  it('gives back a skin this build actually has', () => {
    for (const s of SKINS) expect(resolveSkin(s.id)).toBe(s.id);
  });

  it('treats anything it does not recognise as no picture', () => {
    // Including a skin a later build removed, which is the realistic case: her
    // localStorage outlives the stylesheet. A `data-skin` with no block behind
    // it is worse than no skin, because the surfaces would already be waiting
    // to go translucent over a picture that is not coming.
    for (const junk of ['', 'MOUNTAIN', 'ocean', 'true', '1', null, undefined]) {
      expect(resolveSkin(junk)).toBe('none');
    }
  });

  it('drops a window that is still wearing Mountain back to no picture', () => {
    // NOT A HYPOTHETICAL, and this is the migration. Her localStorage still
    // says `mountain`, and it is never rewritten, so this line is the whole of
    // what happens on her next launch: no picture, plain dark, nothing to
    // clean up. It must NOT land on Lake instead. Removing a theme is not
    // switching her to another.
    expect(SKINS.some((s) => s.id === 'mountain'), 'Mountain came back').toBe(false);
    expect(resolveSkin('mountain')).toBe('none');
  });
});

describe('one control, two axes', () => {
  it('reads back whatever was set, for every skin and both themes', () => {
    for (const look of ['light', 'dark', ...SKINS.map((s) => s.id)]) {
      const { theme, skin } = lookMeans(look);
      expect(lookOf(theme, skin)).toBe(look);
    }
  });

  it('makes every picture the theme its own entry asks for, and dark unless it asks', () => {
    // Landing on a PHOTOGRAPH from light mode with the light tokens still on
    // would be near-black ink on a landscape, which is unreadable rather than
    // merely wrong. That is still true and is still the default.
    //
    // IT STOPPED BEING TRUE OF EVERY PICTURE ON 2026-09-04.A haze is a wash you
    // cannot see rather than a landscape, and on a pale one the danger runs the
    // other way, because pale ink on paper is the unreadable one. So three
    // carry `light: true` and the reasoning above applies to them in reverse.
    //
    // THE ASSERTION IS THE FLAG, NOT A LIST OF IDS. A literal list here is the
    // shape that goes stale the moment one is added or, more likely, the moment
    // she picks among them and the rest are deleted.
    for (const s of SKINS) expect(lookMeans(s.id).theme).toBe(s.light ? 'light' : 'dark');
  });

  it('leaves every photograph dark, whatever else is added', () => {
    // The half of the rule above that must never drift. `light` is for the
    // washes this app draws for itself; a photograph carrying it would be the
    // exact unreadable screen was about.
    for (const s of SKINS) {
      if (!/-haze(?:-\d+)?$/.test(s.id)) {
        expect(lookMeans(s.id).theme, `${s.id} is a photograph and must be dark`).toBe('dark');
      }
    }
  });

  it('turns the picture off for both plain themes', () => {
    expect(lookMeans('light')).toEqual({ theme: 'light', skin: 'none' });
    expect(lookMeans('dark')).toEqual({ theme: 'dark', skin: 'none' });
  });
});

describe('applySkin', () => {
  const fake = () => {
    const attrs = new Map();
    return {
      attrs,
      setAttribute: (k, v) => attrs.set(k, v),
      removeAttribute: (k) => attrs.delete(k),
    };
  };

  it('REMOVES the attribute for no skin rather than setting it to none', () => {
    // `:root[data-skin]` is the whole of "a picture is on" in the stylesheet.
    // A root left carrying data-skin="none" matches that selector, so the
    // surfaces go translucent over --skin-image: none and the app is a set of
    // ghost panes on a flat colour.
    const root = fake();
    const some = SKINS[0].id;
    applySkin(some, root);
    expect(root.attrs.get('data-skin')).toBe(some);
    applySkin('none', root);
    expect(root.attrs.has('data-skin')).toBe(false);
  });
});

describe('every skin is real all the way down', () => {
  it('has a token block the stylesheet can match', () => {
    for (const s of SKINS) {
      expect(css, `no :root[data-skin="${s.id}"] block for ${s.id}`)
        .toContain(`:root[data-skin="${s.id}"] {`);
    }
  });

  it('names a picture in that block, and the file is on disk', () => {
    for (const s of SKINS) {
      const at = css.indexOf(`:root[data-skin="${s.id}"] {`);
      const block = css.slice(at, css.indexOf('\n}', at));
      const url = block.match(/--skin-image:\s*url\(['"]?([^'")]+)/);
      expect(url, `${s.id} defines no --skin-image`).not.toBeNull();
      if (drawn(s.id)) {
        expect(url[1], `${s.id} is drawn but not as an SVG`).toMatch(/^data:image\/svg\+xml;utf8,<svg /);
        continue;
      }
      const file = path.resolve(path.dirname(cssPath), url[1]);
      expect(fs.existsSync(file), `${s.id}: ${url[1]} is not on disk`).toBe(true);
    }
  });

  it('keeps the picture small enough to be a background', () => {
    // THE BUDGET MOVED FROM 400 KB TO 3.5 MB ON 2026-08-21 AND HERE IS WHAT IT
    // COST, MEASURED, because "just raise the limit" is how a guard stops
    // meaning anything.
    //
    // What this number is really about is the comment it replaces: "paid for on
    // every cold start". So the thing worth bounding is DECODE TIME, and 400 KB
    // was a stand-in for it fitted to pictures 1536px wide.
    //
    // Decode measured in headless Chrome, best of three per picture, whole set
    // old against new: mean 8.4ms -> 74.0ms, worst 19.8ms -> 153.1ms
    // (riso-hills, the heaviest at 3.1 MB because a risograph is halftone dots
    // and dots do not compress). A cold start pays for ONE background, not
    // fifteen, and it pays while the rest of the app is still mounting, behind
    // --skin-solid rather than behind nothing. 3.5 MB is the heaviest picture
    // in the set plus a little, so the next one to cross it gets looked at.
    //
    // IF YOU ARE HERE BECAUSE A NEW PICTURE FAILED THIS: the answer is probably
    // a lower webp quality on that one picture, not a
    // bigger number here.
    for (const s of photographs) {
      const at = css.indexOf(`:root[data-skin="${s.id}"] {`);
      const block = css.slice(at, css.indexOf('\n}', at));
      const url = block.match(/--skin-image:\s*url\(['"]?([^'")]+)/)[1];
      const bytes = fs.statSync(path.resolve(path.dirname(cssPath), url)).size;
      expect(bytes, `${s.id} is ${Math.round(bytes / 1024)} KB`).toBeLessThan(3.5 * 1024 * 1024);
    }
  });

  it('draws every picture big enough for her screen', () => {
    // THE OTHER HALF OF THE SAME COMPLAINT, and the one no test was watching.
    // A picture can be under the size budget and still be too few pixels, which
    // is exactly how fifteen 1536px pictures shipped. Her window is 3440x1440
    // and background-size is cover, so a picture narrower than 3440 is being
    // stretched. Lake is 3072 and was never complained about; anything below
    // that is the failure she filed. WebP dimensions are read out of the file
    // header rather than decoded, so this stays cheap.
    const HER_SCREEN = 3440;
    for (const s of photographs) {
      const at = css.indexOf(`:root[data-skin="${s.id}"] {`);
      const block = css.slice(at, css.indexOf('\n}', at));
      const url = block.match(/--skin-image:\s*url\(['"]?([^'")]+)/)[1];
      const buf = fs.readFileSync(path.resolve(path.dirname(cssPath), url));
      expect(buf.toString('ascii', 0, 4), `${s.id} is not a RIFF file`).toBe('RIFF');
      // VP8L (lossless), VP8 (lossy) and VP8X (extended) each put the size in a
      // different place. These are all VP8 lossy, but read the tag so a future
      // re-encode in another mode fails loudly instead of reading garbage.
      const tag = buf.toString('ascii', 12, 16);
      let w;
      if (tag === 'VP8 ') w = buf.readUInt16LE(26) & 0x3fff;
      else if (tag === 'VP8X') w = (buf.readUIntLE(24, 3) & 0xffffff) + 1;
      else throw new Error(`${s.id}: unhandled webp chunk ${tag}`);
      expect(w, `${s.id} is ${w}px wide, narrower than her ${HER_SCREEN}px screen`)
        .toBeGreaterThanOrEqual(3072);
    }
  });

  it('ships a smaller copy of every picture for the laptop panel', () => {
    // THIS IS AN EXEMPTION, NOT A LOWERING. The test above still holds every
    // full-size picture to 3072, because that is the one that stops a repeat of
    // the 1536 mistake. The small set is deliberately small, so it gets its own
    // rule, and the rule is exact: 1536 is measured (skins.ts carries the
    // table), so a copy that quietly drifted to some other width is a bug and
    // not a preference.
    const SMALL = 1536;
    for (const s of photographs) {
      const at = css.indexOf(`:root[data-skin-detail="soft"][data-skin="${s.id}"]`);
      expect(at, `${s.id} has no soft override`).toBeGreaterThan(-1);
      const rule = css.slice(at, css.indexOf('}', at));
      const url = rule.match(/--skin-image:\s*url\(['"]?([^'")]+)/)[1];
      const buf = fs.readFileSync(path.resolve(path.dirname(cssPath), url));
      expect(buf.toString('ascii', 0, 4), `${s.id} small copy is not a RIFF file`).toBe('RIFF');
      const tag = buf.toString('ascii', 12, 16);
      let w;
      if (tag === 'VP8 ') w = buf.readUInt16LE(26) & 0x3fff;
      else if (tag === 'VP8X') w = (buf.readUIntLE(24, 3) & 0xffffff) + 1;
      else throw new Error(`${s.id}: unhandled webp chunk ${tag}`);
      expect(w, `${s.id} small copy is ${w}px wide, not ${SMALL}`).toBe(SMALL);
    }
  });

  it('paints the small copy of the picture the window is already wearing', () => {
    // A SOFT OVERRIDE THAT NAMED ANOTHER THEME'S FILE would swap the picture
    // when she moved the window between screens, which is the one thing this
    // whole change must not do. Her rule is same picture, less grain.
    for (const s of photographs) {
      const big = css.slice(css.indexOf(`:root[data-skin="${s.id}"] {`));
      const bigUrl = big.match(/--skin-image:\s*url\(['"]?([^'")]+)/)[1];
      const at = css.indexOf(`:root[data-skin-detail="soft"][data-skin="${s.id}"]`);
      const smallUrl = css.slice(at, css.indexOf('}', at)).match(/--skin-image:\s*url\(['"]?([^'")]+)/)[1];
      expect(smallUrl, `${s.id} soft copy is a different picture`).toBe(bigUrl.replace(/\.webp$/, '-sm.webp'));
    }
  });

  it('overrides only tokens both themes already define', () => {
    // A skin is an override layer, never a source of new colour. A token
    // invented in a skin block is undefined everywhere else, so every rule
    // naming it is dropped by the browser the moment the picture is off — the
    // same silent failure --line-strong was, one theme further along.
    const inBlock = (selector) => {
      const at = css.indexOf(selector);
      return new Set([...css.slice(at, css.indexOf('\n}', at)).matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
    };
    const base = inBlock(':root {');
    for (const s of SKINS) {
      const only = [...inBlock(`:root[data-skin="${s.id}"] {`)].filter((t) => !base.has(t));
      expect(only, `${s.id} invents tokens no theme defines`).toEqual([]);
    }
  });

  it('names each picture in words, without a metaphor to decode', () => {
    // JARGON OR METAPHOR IN UI COPY is rejected. A theme's name is what she
    // reads in Settings and types into ⌘K, and it is the thing the picture is
    // OF: Ice, Ice River, Lake Harbour.
    //
    // TWO CAPITALISED WORDS, which the first version of this line did not allow
    // because there was one theme and its name was one word. Her four arrived
    // on 2026-08-21 named the way she names them and the rule was never about
    // the number of words; it is about a name being a plain noun rather than a
    // mood to decode.
    for (const s of SKINS) {
      expect(s.name).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)?( [0-9]+)?$/);
      expect(skinName(s.id)).toBe(s.name);
    }
    expect(skinName('none')).toBe('None');
  });
});


/* ------------------------------ her dials --------------------------------- */
// Blur and darkness are hers to set, which means they arrive from localStorage,
// and localStorage is the one input in this app that no version of this code
// has ever written. Everything below is a way a bad value reaches a CSS custom
// property, where it does not throw and does not log: it simply makes the
// declaration invalid, and the window paints without a veil or without a blur
// while looking exactly like a theme that does not work.

describe('resolveTune', () => {
  it('gives back the shipped numbers when nothing has been stored', () => {
    for (const s of SKINS) {
      expect(resolveTune(null, s.id)).toEqual(TUNE_DEFAULT[s.id]);
      expect(resolveTune(undefined, s.id)).toEqual(TUNE_DEFAULT[s.id]);
      expect(resolveTune('', s.id)).toEqual(TUNE_DEFAULT[s.id]);
    }
  });

  it('survives a store that is not JSON, or is JSON of the wrong shape', () => {
    for (const junk of ['{oops', 'null', '"a string"', '[1,2,3]', `{"${SOME}":7}`, `{"${SOME}":null}`]) {
      expect(resolveTune(junk, SOME)).toEqual(TUNE_DEFAULT[SOME]);
    }
  });

  it('NEVER returns a value a CSS custom property cannot take', () => {
    // The failure this exists for: `--skin-blur: NaNpx` is an invalid
    // declaration, so the card keeps whatever blur the stylesheet last gave it
    // and the slider appears to do nothing at all.
    for (const bad of [NaN, Infinity, -Infinity, 'six', null, {}, []]) {
      const got = resolveTune(JSON.stringify({ [SOME]: { blur: bad, dim: bad } }), SOME);
      expect(Number.isFinite(got.blur)).toBe(true);
      expect(Number.isFinite(got.dim)).toBe(true);
    }
  });

  it('clamps a number from a build whose sliders went further', () => {
    const wide = JSON.stringify({ [SOME]: { blur: 400, dim: 9 } });
    expect(resolveTune(wide, SOME)).toEqual({ blur: TUNE_LIMITS.blur.max, dim: TUNE_LIMITS.dim.max });
    const low = JSON.stringify({ [SOME]: { blur: -50, dim: -1 } });
    expect(resolveTune(low, SOME)).toEqual({ blur: TUNE_LIMITS.blur.min, dim: TUNE_LIMITS.dim.min });
  });

  it('keeps one dial when only the other was stored', () => {
    const half = JSON.stringify({ [SOME]: { blur: 7 } });
    expect(resolveTune(half, SOME)).toEqual({ blur: 7, dim: TUNE_DEFAULT[SOME].dim });
  });
});

describe('storeTune', () => {
  it('does not wipe another picture\'s dials', () => {
    // Two pictures, one key. Setting the blur on the second used to be the way
    // the first one silently went back to its defaults.
    const before = JSON.stringify({ someOtherSkin: { blur: 9, dim: 0.5 } });
    const after = JSON.parse(storeTune(before, SOME, { blur: 1, dim: 0.3 }));
    expect(after.someOtherSkin).toEqual({ blur: 9, dim: 0.5 });
    expect(after[SOME]).toEqual({ blur: 1, dim: 0.3 });
  });

  it('starts over rather than throwing on a corrupt store', () => {
    const after = JSON.parse(storeTune('{not json', SOME, { blur: 4, dim: 0.4 }));
    expect(after[SOME]).toEqual({ blur: 4, dim: 0.4 });
  });
});

describe('applyTune', () => {
  it('writes the blur WITH a unit and the alpha WITHOUT one', () => {
    // Both halves are silent when wrong. `blur(2)` is invalid and drops the
    // whole backdrop-filter; `rgba(.., 0.62px)` is invalid and drops the veil,
    // which is the window with the photograph at full strength under the words.
    const seen = {};
    applyTune({ blur: 3, dim: 0.5 }, { style: { setProperty: (k, v) => { seen[k] = v; } } });
    expect(seen['--skin-blur']).toBe('3px');
    expect(seen['--skin-dim']).toBe('0.5');
  });
});

describe('every dial actually reaches the window', () => {
  it('has a default inside its own limits, for every skin', () => {
    for (const s of SKINS) {
      const t = TUNE_DEFAULT[s.id];
      expect(t, `${s.id} has no shipped dials`).toBeTruthy();
      expect(t.blur).toBeGreaterThanOrEqual(TUNE_LIMITS.blur.min);
      expect(t.blur).toBeLessThanOrEqual(TUNE_LIMITS.blur.max);
      expect(t.dim).toBeGreaterThanOrEqual(TUNE_LIMITS.dim.min);
      expect(t.dim).toBeLessThanOrEqual(TUNE_LIMITS.dim.max);
    }
  });

  it('is SPENT by the stylesheet, not just written to the root', () => {
    // THE ONE THAT HAS NO SYMPTOM. A custom property set on an element that no
    // rule reads is legal CSS and does nothing, so a slider that writes
    // --skin-dim into a stylesheet whose veil hardcodes 0.62 drags smoothly,
    // stores its value, survives a reload, and never changes a pixel.
    // FOLLOWED THROUGH THE NAME RATHER THAN ASSUMED FROM IT. A skin's block
    // says --skin-veil: var(--veil-something); the veils are SHARED on purpose,
    // because the alpha was fitted once against her own drawing and every
    // picture spends it through its own --skin-dim instead. So this reads which
    // veil the block actually names and checks THAT one spends the dial.
    for (const sk of SKINS) {
      const at = css.indexOf(`:root[data-skin="${sk.id}"] {`);
      expect(at, `no block for ${sk.id}`).toBeGreaterThan(-1);
      const block = css.slice(at, css.indexOf('\n}', at));
      const named = block.match(/--skin-veil:\s*var\((--veil-[a-z-]+)\)/);
      expect(named, `the ${sk.id} block names no veil`).toBeTruthy();
      expect(css, `${named[1]}, which ${sk.id} wears, ignores --skin-dim`)
        .toMatch(new RegExp(`${named[1]}:[^;]*var\\(--skin-dim`));
    }
    expect(css, 'nothing blurs by --skin-blur').toMatch(/backdrop-filter:\s*blur\(var\(--skin-blur/);
  });

  it('gives the stylesheet a fallback for both, so a fresh window is never bare', () => {
    // main.tsx writes these before the first paint, but only when a picture is
    // already on. Every other path through the app reaches the veil with
    // nothing on the root, and var with no fallback there is an invalid
    // declaration rather than a default.
    expect(css).toMatch(/var\(--skin-dim,\s*0?\.\d+\)/);
    for (const sk of SKINS) {
      const at = css.indexOf(`:root[data-skin="${sk.id}"] {`);
      const block = css.slice(at, css.indexOf('\n}', at));
      expect(block, `the ${sk.id} block sets no --skin-blur`).toMatch(/--skin-blur:\s*\d/);
      // A PLAIN `0` IS A REAL ANSWER AND THE PATTERN USED TO REFUSE IT. It was
      // written when every picture was a photograph that needed turning down,
      // so a fractional alpha was the only shape a dim ever took. Round five
      // drew the pictures dark instead, and Orbit Rings and Pixel Harbour solve
      // to no veil at all: at the floor of the range they still land below the
      // Lake's luminance behind the card. The assertion is that the block
      // DECLARES a dim, not that the dim is non-zero, and `0?\.\d+` was
      // quietly testing the second thing.
      expect(block, `the ${sk.id} block sets no --skin-dim`).toMatch(/--skin-dim:\s*(?:0|0?\.\d+)\s*;/);
    }
  });
});


// --------------------------- what a new Mac starts on -----------------------.
// A pin paints and stores nothing; a default is written down. A tester's Mac was
// in light mode, so inbox zero was the lake, In progress was light, and the
// walk turned white the moment it left the third setup screen. Her answer,
// 2026-08-23: "Lake is the default theme during onboarding."
//
// AND WHAT IT SEEDS IS GOUACHE VALLEY. That sentence was about a look being PUT
// ON her running window, which is the PIN, and the pin is still held to it:
// `idleSkin` paints nothing where nothing was picked.
//
// The write itself has never moved, because leaving both keys empty is the whole
// of that tester's bug.
describe('seedFirstRunLook', () => {
  const THEME_KEY = 'zero.theme';
  const store = (seed = {}) => {
    const m = new Map(Object.entries(seed));
    return {
      map: m,
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, v); },
    };
  };

  it('writes the default picture into an empty store, both keys', () => {
    const s = store();
    expect(seedFirstRunLook(s, THEME_KEY)).toEqual({ theme: 'dark', skin: DEFAULT_SKIN });
    expect(s.getItem(SKIN_KEY)).toBe('ember-grid');
    // The theme is written even though `resolveTheme` already answers dark for
    // an empty store, because the empty store is the state that tester's Mac fell
    // through in and an explicit answer is what cannot fall through. A picture
    // is dark, so this is also the only answer that agrees with the skin.
    expect(s.getItem(THEME_KEY)).toBe('dark');
  });

  it('is the same answer resolveSkin and resolveTheme then give back', () => {
    const s = store();
    seedFirstRunLook(s, THEME_KEY);
    expect(resolveSkin(s.getItem(SKIN_KEY))).toBe(DEFAULT_SKIN);
    expect(lookOf('dark', resolveSkin(s.getItem(SKIN_KEY)))).toBe(DEFAULT_SKIN);
  });

  // AND WHAT IT SEEDS IS A PICTURE THIS BUILD ACTUALLY HAS. The seed names an id
  // and the id has to be on the list, or a brand new Mac boots wearing a
  // `data-skin` nothing in the stylesheet matches, which reads as plain dark and
  // logs nothing at all.
  it('seeds a picture that is in SKINS', () => {
    const s = store();
    seedFirstRunLook(s, THEME_KEY);
    expect(SKINS.some((sk) => sk.id === s.getItem(SKIN_KEY))).toBe(true);
  });

  it('never touches a store that has already chosen anything', () => {
    // Including someone who chose plain dark, or plain light, releases ago.
    // This is a fresh-install default, not a migration and not a reset, and
    // this guard is also what makes ?firstrun=1 safe on a Mac already set up.
    for (const seed of [{ 'zero.theme': 'light' }, { 'zero.theme': 'dark' }, { [SKIN_KEY]: 'none' }, { [SKIN_KEY]: DEFAULT_SKIN }]) {
      const s = store(seed);
      const before = JSON.stringify([...s.map]);
      expect(seedFirstRunLook(s, THEME_KEY)).toBe(null);
      expect(JSON.stringify([...s.map])).toBe(before);
    }
  });

  it('leaves a window with no picture alone, which is a choice too', () => {
    // 'none' is a real answer someone gave, not an empty store, and the
    // difference is exactly the one this function exists to keep.
    const s = store({ [SKIN_KEY]: 'none' });
    seedFirstRunLook(s, THEME_KEY);
    expect(resolveSkin(s.getItem(SKIN_KEY))).toBe('none');
  });
});
