// THE THEME LAB IS GONE AND STAYS GONE., 2026-08-21.
//
// The middle component was the strip docked at the bottom centre of the inbox
// that stepped through candidate pictures.
//
// This replaces tests/the-theme-lab-stays-home.test.mjs, which built the
// renderer twice to prove a build flag deleted the lab from anything shipping.
// There is no flag and no lab now, so the thing worth guarding changed: not
// "the lab is excluded from one build" but "the lab is not in the tree at all,
// and neither are the seventeen candidate pictures it carried". Those pictures
// were the reason the old test was slow and the reason this one is cheap: a
// stray import of one of them is the only way they come back, and reading the
// source finds that without building anything.
//
// The candidates are recoverable, they are just not in the app: their briefs
// and measurements are in decisions.md under 2026-08-21, and their raw PNGs
// are in designs//raw4 and raw5.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Every source file the renderer builds from, so a re-added import is caught
// wherever somebody puts it rather than only in the three files it used to
// live in.
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|css)$/.test(e.name)) out.push([path.relative(root, p), fs.readFileSync(p, 'utf8')]);
    }
  };
  walk(path.join(root, 'renderer/src'));
  return out;
}

describe('the theme lab is gone', () => {
  it('has no theme-lab module and no test that expects one', () => {
    expect(fs.existsSync(path.join(root, 'renderer/src/theme-lab.ts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'tests/the-theme-lab-stays-home.test.mjs'))).toBe(false);
  });

  it('has no build flag left to get wrong', () => {
    // The flag was the whole safety mechanism and it is now dead weight that
    // would read as protection if it were still declared.
    expect(read('renderer/vite.config.ts')).not.toContain('define:');
    expect(read('renderer/src/assets.d.ts')).not.toContain('declare const __THEME_LAB__');
    for (const [file, src] of sources()) {
      expect(src.includes('if (__THEME_LAB__)'), `${file} still branches on the flag`).toBe(false);
    }
  });

  it('does not carry the seventeen candidate pictures', () => {
    expect(fs.existsSync(path.join(root, 'renderer/src/assets/themes'))).toBe(false);
    const candidates = [
      'orbit-dawn', 'orbit-moonrise', 'orbit-shadow', 'moon-reeds', 'moon-river',
      'moon-terraces', 'pixel-mesa', 'cyano-ridge', 'iso-valley', 'screen-night',
      'orbit-limb', 'moon-plain', 'pixel-shore', 'deco-bay', 'oil-harbour',
      'papercut-canyon', 'glass-vale',
    ];
    for (const [file, src] of sources()) {
      for (const c of candidates) {
        expect(src.includes(`${c}.webp`), `${file} still names ${c}.webp`).toBe(false);
      }
    }
  });

  it('leaves nothing appending to SKINS at runtime', () => {
    // registerLabSkins was how candidates got into Settings and ⌘K without
    // those surfaces knowing. With it gone, SKINS is the whole truth, and a
    // test that reads the list is reading what she sees.
    const skins = read('renderer/src/skins.ts');
    expect(skins).not.toContain('export function registerLabSkins');
    for (const [file, src] of sources()) {
      expect(src.includes('registerLabSkins('), `${file} still calls it`).toBe(false);
    }
  });

  it('leaves the eighteen shipping themes alone', () => {
    // The point of removing the strip was removing the strip. If this count
    // moves, something took her themes with it. It has moved exactly four times
    // and all four are hers: all sixteen were deleted on 2026-08-30 and all but
    // one came back on 2026-09-01, because deleting them was a misreading of
    // one sentence about one wallpaper. The one that did not come back is Orbit
    // Rings, which is the wallpaper that sentence was about. Then Valley Haze
    // was added on 2026-09-03, which is a theme she asked for by attaching a
    // picture of it.
    //
    // Those three are the first pictures in this app that are not dark;
    // renderer/src/skins.ts carries the flag and tests/skin-choice.test.mjs
    // holds the rule.
    //
    // Then she picked, on 2026-09-04, and kept picking. Four rounds of options
    // went past her and she took three of them: Valley Haze, then Frost Haze
    // and Slate Haze.
    //
    // THIRTY-FIVE CANDIDATE THEMES WERE BUILT AND THIRTY-TWO WERE DELETED, each
    // set in the session she answered it in, because an approval closes an
    // option set and anything still switchable is something she has to decide
    // twice. None of it is unrecoverable: every deleted token block is verbatim
    // in decisions.md under 2026-09-04, and every one of them rebuilds from its
    // line in FAMILY, which is kept complete on purpose
    // as the archive.
    //
    // SO THE THREE HAZES HERE ARE SETTLED, NOT PROPOSED. This count going up
    // again means somebody is re-offering a theme she has already passed over.
    // READ OUT OF `SKINS` ITSELF, not off every `{ id: … }` in the file. `LOOKS`
    // moved in here on 2026-08-24 so the walk's new theme step and Settings
    // could read one list, and it carries Light and Dark, which are not
    // pictures and were being counted as two more of them.
    const skins = read('renderer/src/skins.ts');
    const list = skins.slice(skins.indexOf('export const SKINS: Skin[] = ['), skins.indexOf('\n];', skins.indexOf('export const SKINS: Skin[] = [')));
    const ids = [...list.matchAll(/^ {2}\{ id: '([a-z0-9-]+)'/gm)].map((m) => m[1]);
    // September 21: the user supplied a new background for Peach Haze.
    // September 25: Ember Grid, the launch film's look (w-b3e123a0af).
    // w-9e434e8671: the choices became Light, Dark and Match system, and Dark
    // is Ember Grid, so Ember Grid is the one picture theme that ships.
    expect(ids).toEqual(['ember-grid']);
  });
});
