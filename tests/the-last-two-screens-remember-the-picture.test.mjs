// THE LAST TWO SCREENS REMEMBER THE PICTURE.
//
// She approved the six onboarding fixes with one thing attached, and a shot of
// the tail of the walk: beats 18 and 19 wearing Cel Dusk, and then her own
// project and the finished walk wearing Gouache Valley.
//
// Those two screens are her own empty inbox, which is the inbox-zero surface,
// and what switched the picture there was her own decision of 2026-08-19:
//
// HER OWN SENTENCE LEFT THE THEMES CASE OPEN AND THIS IS HER CLOSING IT. So the
// pin splits in two along the line her reason draws. A PICTURE she picked is
// carried to inbox zero, because the picture IS the nice theme and swapping it
// for a different one is the app forgetting. PLAIN LIGHT OR DARK, with no
// picture on at all, is still pinned, because that is the case her 08-19 reason
// is about and she has not taken it back.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { wearsTheWalksLook } from '../renderer/src/onboarding.ts';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

const app = read('renderer/src/App.tsx');
const skins = read('renderer/src/skins.ts');
const harness = read('scripts/shot-the-built-walk.mjs');

describe('the picture she picked survives the end of the walk', () => {
  it('only pins inbox zero when no picture is on', () => {
    // `skin === 'none'` is the whole of the change. Everything else in the
    // condition is untouched, so the games, the modals and the search all keep
    // deciding this page exactly as they did.
    expect(app).toContain(
      "const idlePinned = run === null && skin === 'none'",
    );
    // ONE BRANCH EACH SINCE 2026-09-01. The walk opens on a picture now and the
    // idle page still does not, so a shared branch could no longer say both.
    // What this test is about is `run === null` above, which takes the idle pin
    // off for the whole walk, and it has not moved.
    expect(app).toMatch(/if \(idlePinned\) \{/);
  });

  it('paints the picture that is on, and no picture when none is', () => {
    const effect = app.slice(app.indexOf('if (idlePinned) {'), app.indexOf('const inboxEmpty'));
    // The theme is still pinned dark on this branch. Inbox zero and the walk are
    // dark screens whether or not there is a photograph behind them.
    expect(effect).toContain("applyTheme('dark')");
    // THE CALL TOOK A VARIABLE ON 2026-08-26 AND THE FALLBACK USED TO BE INSIDE
    // IT. It was `applySkin(DEFAULT_SKIN)` flat, then `idleSkin(skin)` falling
    // back to that same constant, so a Mac that had chosen no picture met
    // Gouache Valley here anyway.
    //
    // THAT FALLBACK IS GONE.A picture appears where somebody picked one and
    // nowhere else. What she picks still survives the end of the walk, which is
    // what the rest of this file is about and is untouched.
    expect(effect).toContain('const pinned: SkinChoice = idleSkin(skin);');
    expect(skins).toMatch(/export function idleSkin\(skin: SkinChoice\): SkinChoice \{\s*return skin;/);
    expect(effect).toContain('applySkin(pinned)');
  });

  it('re-runs the effect when the picture changes', () => {
    // Without `skin` in the list the window would keep the old answer until
    // something else moved, which is a pin that comes off one render late.
    expect(app).toMatch(/\}, \[idlePinned, firstRunPinned, theme, skin, machine\]\);/);
  });

  it('leaves the setup screens pinned, because nothing is picked yet there', () => {
    // THE STEPS ARE NO LONGER NAMED HERE AND THAT IS THE 08-26 FIX. This line
    // used to carry the literal `welcome || folder || name`, which was every
    // screen before the picker only while the picker was beat four. It moved to
    // beat seven and these three stopped being the whole list, silently. The
    // rule is read off the step order now (`wearsTheWalksLook`).
    expect(app).toContain('const firstRunPinned = run !== null && wearsTheWalksLook(run.step);');
    for (const step of ['welcome', 'folder', 'name']) expect(wearsTheWalksLook(step)).toBe(true);
  });

  it('says in skins.ts that the pin is now the fallback and not the rule', () => {
    // The constant is still the fallback, so the comment that used to call it
    // the rule had to move with the code. A stale comment here is how the next
    // session puts her 08-19 decision back over the top of this one.
    expect(skins).toContain('THE PIN IS THE FALLBACK, NOT THE RULE');
    expect(skins).toContain('remembers the theme you chose');
  });

  it('holds the last two beats of the picture walk instead of releasing them', () => {
    // The hold is what makes her sentence measured. It used to come off before
    // beat 20 unconditionally, which is precisely why the switch back was never
    // caught by a run.
    expect(harness).toContain('AND THE LAST TWO BEATS ARE HELD TOO, WHEN A PICTURE WAS PICKED');
    const tail = harness.slice(harness.indexOf('AND THE LAST TWO BEATS ARE HELD TOO'));
    expect(tail).toMatch(/if \(KEEP === 'light'\) \{\s*\n\s*PICKED\.theme = null;\s*\n\s*PICKED\.skin = null;\s*\n\}/);
    // And the release is only ever reached by the Light run.
    expect(tail.slice(0, tail.indexOf('=== 20'))).not.toMatch(/^PICKED\.theme = null;$/m);
  });
});
