// THE WELCOME SCREEN COMES UP WITH THE PHOTOGRAPH ON IT, on a machine that has
// never chosen one.
//
// Her answer on, 2026-08-21, to a walk of a fresh copy, with a screenshot of
// the welcome attached: "no background".
//
// She was right and the cause was a gate, not a missing rule. 5e2c6ee had
// already given `.fr-screen` the three layers, under `:root[data-skin]` — which
// matches only while a picture is switched on. `resolveSkin(null)` is 'none',
// so on a first run nothing has switched one on.
//
// It passed review anyway because of a coincidence that is easy to rebuild:
// a brand new store has an empty inbox, `idlePinned` pins the lake to inbox
// zero, and the welcome inherited it. Every shot harness also set `zero.skin`
// by hand before shooting. So nothing anybody looked at was in the state that
// actually ships.
//
// HER window was not in that state. Claude Code agents land in the inbox and in
// no other list, and the walk runs on there being no PROJECTS, so an empty
// store and a full inbox are the same moment. The pin was off. Measured off her
// screenshot: rgb(56, 58, 64), which is `--bg-raised` #373a41, the charcoal
// slab and no photograph at all.
//
// What is pinned here is the thing that broke: the walk must not WAIT to
// inherit a picture, and the two full-surface screens after the welcome are on
// the same footing as the welcome.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSkin, DEFAULT_SKIN, idleSkin, walkSkin } from '../renderer/src/skins.ts';
import { wearsTheWalksLook } from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');

describe('a machine that has never chosen a picture', () => {
  it('has no skin, which is what made the welcome fall back to a slab', () => {
    expect(resolveSkin(null)).toBe('none');
    expect(resolveSkin(undefined)).toBe('none');
  });

  it('still has a charcoal slab waiting behind .fr-screen', () => {
    // The fallback is not removed and must not be: it is what a picture-less
    // theme falls to if the pin below is ever lifted. This asserts the trap is
    // still there, so the pin is doing real work rather than being decoration.
    const rule = css.slice(css.indexOf('.fr-screen {'));
    expect(rule.slice(0, 200)).toMatch(/background: var\(--skin-solid\)/);
  });
});

describe('the walk pins the picture itself', () => {
  it('pins on every screen from the welcome to the one before the picker', () => {
    // IT NAMED THREE STEPS UNTIL 2026-08-26 AND THAT WENT STALE. On 08-24 the
    // picker was beat four, so the welcome, the folder and the name really were
    // every screen before it. It moved to beat seven on 08-25, the three
    // introduction slabs slid in front of it, and nothing here or in App.tsx
    // noticed.
    expect(app).toMatch(/const firstRunPinned = run !== null/);
    expect(app).toContain('wearsTheWalksLook(run.step)');
    for (const step of ['welcome', 'folder', 'name', 'inbox', 'away', 'goal']) {
      expect(wearsTheWalksLook(step)).toBe(true);
    }
  });

  it('does not pin the tethered steps, which sit over her own app', () => {
    const line = app.slice(app.indexOf('const firstRunPinned'), app.indexOf('const idlePinned'));
    for (const step of ['command', 'task', 'working', 'answer', 'landed']) {
      expect(line).not.toMatch(new RegExp(`'${step}'`));
    }
  });

  it('paints a picture, on the Mac that has never chosen one', () => {
    // THIS IS THE TITLE OF THIS FILE AND IT WENT AWAY FOR A DAY. On 2026-09-01
    // changed the pin to paint the stored picture and nothing otherwise, which
    // is right for inbox zero and puts the welcome back to the charcoal slab
    // she photographed on 08-21 ("no background").
    //
    // So the walk has its OWN branch and its own rule (`walkSkin`), split from
    // the idle page's on 09-01. Two pins that paint different pictures cannot
    // share one line, and sharing it is how the walk lost its background.
    expect(app).toMatch(/if \(firstRunPinned\) \{/);
    expect(app).toContain('const pinned: SkinChoice = walkSkin(skin);');
    // A landscape, whatever the default is (w-ec62ab6b38, 2026-09-28).
    expect(walkSkin('none')).toBe('gouache-valley');
    // AND IT DOES NOT PAINT OVER A PICTURE SOMEBODY PICKED, which is the fault
    // that made this a variable in the first place on 2026-08-26.
    expect(walkSkin('lake')).toBe('lake');
    expect(app).toMatch(/applySkin\(pinned\);/);
    // Dark comes with it or the ink is wrong: --text in light is dark ink, and
    // dark ink on the photograph is a headline nobody can read.
    const branch = app.slice(app.indexOf('if (firstRunPinned) {'), app.indexOf('if (idlePinned) {'));
    expect(branch).toContain("applyTheme('dark')");
    // THE IDLE PAGE KEEPS THE OTHER RULE. Her 08-30 answer is not being taken
    // back: a picture appears at inbox zero only where somebody picked one.
    expect(idleSkin('none')).toBe('none');
    expect(idleSkin('lake')).toBe('lake');
    expect(DEFAULT_SKIN).toBe('ember-grid');
  });

  it('repaints and never writes her look away', () => {
    // Same rule the idle pin lives under. A first run must not silently set a
    // picture as the preference of somebody who has not opened Settings yet.
    const effect = app.slice(app.indexOf('const firstRunPinned'), app.indexOf('if (!snap) return <div'));
    expect(effect).not.toMatch(/setItem/);
    // `resolveTheme(theme)` RATHER THAN `theme` SINCE 2026-08-24, and the wrap is
    // the point: `theme` holds what she PICKED, which can now be `match`, and the
    // window has to be told light or dark. See theme.ts.
    expect(effect).toMatch(/applyTheme\(resolveTheme\(theme\)\);/);
    expect(effect).toMatch(/applySkin\(skin\);/);
  });

  it('repaints when the step changes, not only when the look does', () => {
    // Without firstRunPinned in the deps the pin lands on whatever step the
    // walk happened to be on when the look last changed, and lifting it at the
    // end of the walk never happens at all. `machine` joined the list with
    // Match my system: on that look it is half the answer, and without it the
    // effect never re-runs when macOS flips at sunset.
    expect(app).toMatch(/\}, \[idlePinned, firstRunPinned, theme, skin, machine\]\);/);
  });
});
