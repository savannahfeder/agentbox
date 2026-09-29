// ⌘K → Themes, the picker docked at the bottom of the window.
//
// EVERY BLOCK BELOW IS ONE REQUIREMENT OF THE DESIGN, and each one fails silently
// otherwise: a picker that lists ten of twelve themes looks complete, a picker
// with a scrim looks like every other modal, and a row nothing matches looks
// like a feature that was never built.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOKS, SKINS } from '../renderer/src/skins.ts';
import { lookRows, matchesQuery } from '../renderer/src/palette-rows.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const picker = read('renderer/src/components/ThemePicker.tsx');
// THE CODE WITHOUT ITS COMMENTS. Half the assertions below are "this is gone",
// and the file's header explains at length what was deleted and why, naming
// every one of those things. Matched against the whole file, a comment saying
// "the scrub is gone" fails the test that says the scrub is gone.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pickerCode = code(picker);
const palette = read('renderer/src/components/Palette.tsx');
// App.tsx is where the round-five switch was fed from, so it is where the fence
// against that switch coming back has to look.
const appCode = code(read('renderer/src/App.tsx'));
const css = read('renderer/src/styles.css');

// Enough of a parser for a rule with no nesting, which this file has none of.
const ruleBody = (sel) => {
  const at = css.indexOf(`${sel} {`);
  if (at < 0) return null;
  return css.slice(at, css.indexOf('\n}', at));
};
// The same thing, but only where the selector STARTS a line, so asking for
// `.theme-dial-val` cannot land inside `.theme-dial > .theme-dial-val`.
const own = (sel) => {
  const at = css.indexOf(`\n${sel} {`);
  if (at < 0) return null;
  return css.slice(at + 1, css.indexOf('\n}', at));
};

describe('the way in', () => {
  // The row moved out of Palette.tsx and into palette-rows.ts on 2026-08-28, so
  // this asks the function rather than grepping the component. That is the
  // better test anyway: it checks what ⌘K actually returns rather than what its
  // source happens to spell.
  const row = () => lookRows('dark').find((r) => r.id === 'theme-picker');

  it('is a ⌘K row, and the words she would type reach it', () => {
    expect(row(), 'no theme-picker row in the palette').toBeTruthy();
    // "themes" is the app's own word. The rest are the words somebody who has
    // forgotten our word for it would try.
    for (const word of ['theme', 'themes', 'background', 'appearance', 'wallpaper']) {
      expect(matchesQuery(word, row()), `"${word}" does not reach the picker`).toBe(true);
    }
  });

  it('is the ONLY way to a picture from ⌘K', () => {
    // This test said the opposite until 2026-08-28. The earlier fix was that
    // typing a theme's name lands on it, and the picker was added beside those
    // rows rather than instead of them.
    for (const look of LOOKS) {
      expect(lookRows(look).filter((r) => r.id.startsWith('skin-')), look).toEqual([]);
    }
    expect(palette).toContain('lookRows(look).map');
  });
});

describe('the picker itself', () => {
  it('offers light, dark and EVERY picture the app has', () => {
    // Read off SKINS, never listed here: a picker that silently stops showing
    // the theme added last week is a theme she can only reach from Settings,
    // which is the screen she opened this to stop visiting.
    // IT READS `LOOKS` NOW RATHER THAN BUILDING ITS OWN, since 2026-08-24. Those
    // three lines were a copy of `LOOKS` in skins.ts that happened to agree with
    // it, and adding Match my system found the cost: the bar was the one theme
    // control in the app that would not have grown the tile, because the list it
    // drew was not the list everything else drew. Same guarantee, one source.
    expect(picker).toMatch(/import \{[^}]*\bLOOKS\b[^}]*\} from '\.\.\/skins'/);
    expect(picker, 'the picker builds its own list again').not.toMatch(/const LOOKS: Array</);
    expect(LOOKS.map((l) => l.id)).toEqual([...SKINS.map((s) => s.id), 'light', 'dark']);
    expect(SKINS.length, 'there is only one picture, so this picker has no job').toBeGreaterThan(1);
  });

  it('draws the SETTINGS tile, so it cannot show a theme that is not the theme', () => {
    // `.look-swatch <id>` carries the real picture under the real veil at the
    // theme's own --skin-dim (styles.css). A hand-picked colour per tile is the
    // version of this that goes stale the first time a picture changes.
    expect(picker).toContain('look-swatch ${l.id}');
    for (const s of SKINS) {
      expect(css, `no tile background for ${s.id}`).toContain(`.look-swatch.${s.id} {`);
    }
  });

  it('applies the theme on the spot rather than on a confirm', () => {
    // That is said while looking. A picker that only commits on Enter is a
    // picker she cannot judge anything in.
    expect(picker).toContain('onClick={() => onSetLook(l.id)}');
    expect(picker).toMatch(/ArrowRight[\s\S]{0,60}step\(1\)/);
    expect(picker).toMatch(/ArrowLeft[\s\S]{0,60}step\(-1\)/);
  });

  it('reads the selection off the look instead of holding its own', () => {
    // Settings and ⌘K can both change the theme while this is open. A picker
    // holding its own answer draws the tick on the wrong tile and says nothing.
    expect(picker).toContain('LOOKS.findIndex((l) => l.id === look)');
    // THIS USED TO FORBID useState OUTRIGHT, and that was too wide once the
    // dials arrived: whether a dial is being dragged right now is this
    // component's own passing state and is not an answer about which theme is
    // on. What may never be held here is THE SELECTION, so that is what is
    // named now.
    expect(picker, 'the picker keeps its own selection state').not.toMatch(/useState[^\n]*\blook\b/);
    expect(picker, 'the picker keeps its own selection state').not.toMatch(/useState<Look/);
  });
});

describe('her blur and darkness dials, on the bar', () => {
  // Each line below is a way of doing that which looks done and is not: dials
  // that hold their own copy of the numbers, dials that show under Light, dials
  // in a row of their own that push the inbox card off the screen, and, the two
  // the last round added, dials you have to summon, and a dial that has quietly
  // grown back into the rejected slider.
  const app = read('renderer/src/App.tsx');

  it('has both dials, over the ranges skins.ts allows', () => {
    expect(picker).toContain('label="Foreground blur"');
    expect(picker).toContain('label="Background blur"');
    expect(picker).toContain('label="Darkness"');
    // The limits are read, never retyped: a second copy of the range is a
    // dial that lets her past a value the stylesheet was solved for.
    expect(picker).toContain('{...TUNE_LIMITS.blur}');
    expect(picker).toContain('{...TUNE_LIMITS.dim}');
  });

  it('shows them both by default, with nothing to press first', () => {
    // The ONLY condition allowed in front of them is `skin`, because Light and
    // Dark have no picture. Anything else — a chip, a drawer, a held key, a
    // hover — is the thing that was ruled out, and every one of those would still
    // pass the test above.
    const at = picker.indexOf('<div className="theme-dials">');
    expect(at, 'no theme-dials block').toBeGreaterThan(-1);
    const opener = picker.slice(picker.lastIndexOf('{', at), at);
    expect(opener.replace(/\s+/g, ' ').trim(), 'the dials are behind something other than "is there a picture"')
      .toBe('{skin && (');
    // And no state anywhere in the file may decide whether they are drawn.
    expect(pickerCode, 'the dials open and shut').not.toMatch(/useState[^\n]*\b(drawer|open|shown|show)\b/i);
  });

  it('is reached by pressing it, never by a key', () => {
    // Up, down and shift-arrow used to be the dials; they are gone, and the
    // only arrows left in the key handler are the two that walk the pictures,
    // which is what the hint has always said.
    expect(picker).toMatch(/ArrowRight[\s\S]{0,60}step\(1\)/);
    expect(picker).toMatch(/ArrowLeft[\s\S]{0,60}step\(-1\)/);
    expect(pickerCode, 'a key still moves a dial').not.toMatch(/e\.shiftKey/);
    expect(pickerCode, 'the hint still tells her to hold a key').not.toMatch(/hold shift/i);
    // The gesture is the pointer, and it sets the value on the press rather
    // than only after a drag: over a 168px line the whole range is one press
    // away, and a 2px target she has to hit twice is not a target.
    expect(picker).toMatch(/onPointerDown[\s\S]{0,300}setFrom\(e\.clientX\)/);
    expect(picker).toMatch(/onPointerMove=\{\(e\) => \{ if \(dragging\.current\) setFrom\(e\.clientX\); \}\}/);
  });

  it('moves the same numbers Settings moves, and holds none of its own', () => {
    // One state in App, two screens onto it. A copy here is the second answer,
    // and the picker already refuses its own state above for the same reason.
    expect(picker).toContain('onSetTune({ ...tune, blur })');
    expect(picker).toContain('onSetTune({ ...tune, dim })');
    expect(picker, 'a dial holds its own copy of the tune').not.toMatch(/useState<SkinTune/);
    expect(app).toMatch(/<ThemePicker[\s\S]{0,600}onSetTune=\{setTune\}/);
    // AND THE RESET LANDS ON THE SAME TABLE. A theme needs a way back to its
    // defaults, and out of six places drawn the one inside each dial was
    // picked, so a reset here puts THAT
    // dial's number back off TUNE_DEFAULT rather than off a copy.
    expect(pickerCode, 'the picker grew its own idea of home').toContain('TUNE_DEFAULT[look as SkinId]');
    expect(pickerCode, 'the phrase she deleted is back on the bar').not.toContain('Put it back');
    // Settings keeps the whole-bar reset: that pane has a row and a label for
    // it. The picker does not take it any more, because nothing on the bar
    // moves both numbers at once.
    expect(app).toMatch(/<Settings[\s\S]{0,600}onResetTune=\{resetTune\}/);
    expect(app, 'the picker took back a reset she did not pick')
      .not.toMatch(/<ThemePicker[\s\S]{0,900}onResetTune=/);
  });

  it('clamps the drag rather than trusting the gesture', () => {
    // A pointer press has no min and max of its own, so the clamp is the only
    // thing between a press past the end of the line and a --skin-dim of 4.
    expect(picker).toContain('const clamp = (v: number, lo: number, hi: number)');
    expect(picker).toMatch(/onChange\(clamp\(/);
  });

  it('only draws them under a picture', () => {
    // Light and Dark have no photograph to blur and no veil to turn down, so a
    // dial there is a control that does nothing.
    expect(picker).toContain('const isSkin = (l: Look): l is SkinId =>');
    expect(picker).toContain('const skin = isSkin(look);');
  });

  it('leaves the arrow keys to a dial that has focus', () => {
    // Otherwise tabbing to Blur and pressing Right walks to the next theme and
    // takes the dial she was aiming at off the screen. This is also the whole
    // of the keyboard story here: standard ARIA slider behaviour for a screen
    // reader, advertised nowhere, reached by nothing she does with a mouse.
    expect(picker).toMatch(/theme-dial-track[\s\S]{0,400}ArrowRight[\s\S]{0,200}return;/);
    expect(picker).toContain("role=\"slider\"");
    expect(picker).toContain('aria-valuenow={value}');
  });

  it('puts them on the header line, so the bar does not grow a row', () => {
    // Measured at 1710x944: 190px without them, 196px with them. A row of
    // their own is ~44px more, which is the inbox card the theme is being
    // judged against.
    const head = ruleBody('.theme-picker-head');
    expect(head, 'no .theme-picker-head rule').toBeTruthy();
    expect(picker).toMatch(/theme-picker-head[\s\S]{0,900}theme-dials/);
    expect(ruleBody('.theme-dials')).toContain('margin-left: auto');
  });

  it('is a hairline with no thumb, which is the design she picked', () => {
    // The approved readout is the one the keys design drew: a word, a value and
    // a 2px line. Round one was the app's .set-range slider on this same line
    // and it was rejected. A thumb, a track border or a filled groove added here is
    // that slider coming back in a narrower box.
    const line = ruleBody('.theme-dial-line');
    expect(line, 'no .theme-dial-line rule').toBeTruthy();
    expect(line).toMatch(/height:\s*2px/);
    expect(pickerCode, 'the dial went back to being a range input').not.toContain('type="range"');
    expect(pickerCode, 'the dial wears the Settings slider again').not.toContain('set-range');
    // 168px is the width the readout had when it was approved, and it is
    // now the LINE that carries it: round four put a minus and a plus outside
    // the dial, so .theme-dial is as wide as those plus the line while the line
    // itself did not move.
    expect(ruleBody('.theme-dial-track')).toMatch(/width:\s*168px/);
  });

  /* * ======================================================================
     ROUND FOUR, 2026-08-23. Four corrections, one test each.
  */

  it('flanks each dial with a minus and a plus, and nothing more', () => {
    // The affordance that was needed: a hairline says nothing about being
    // touchable, so the two glyphs are what say it.
    expect(picker).toContain('theme-dial-nudge ${d > 0 ?');
    expect(picker, 'the minus is not a minus').toContain("d > 0 ? '+' : '\u2212'");
    // One on each SIDE, which is a minus before the label and a plus after the
    // value. In DOM order that is arrow(-1), label, value, arrow(1).
    // The window is wide because round seven parks two of its six designs
    // between the label and the value; the ORDER is what this line is for.
    expect(picker).toMatch(/\{arrow\(-1\)\}[\s\S]{0,400}theme-dial-label[\s\S]{0,1600}theme-dial-val[\s\S]{0,400}\{arrow\(1\)\}/);
    // MINIMALIST, and that is measurable: no border, no background, no fill of
    // its own. Anything drawn around the glyph is the chrome that has been
    // rejected twice on this bar already.
    const nudge = ruleBody('.theme-dial-nudge');
    expect(nudge, 'no .theme-dial-nudge rule').toBeTruthy();
    expect(nudge).toMatch(/border:\s*none/);
    expect(nudge).toMatch(/background:\s*none/);
  });

  it('nudges from where she is, so minus then plus is where she started', () => {
    // There is no reset on this bar any more, so the way home is the two
    // glyphs. That only works if they add and subtract rather than snapping to
    // a grid: from 63% a snapping plus would land on 65 and never come back.
    expect(picker).toContain('const by = (d: number) => onChange(clamp(Number((now.current + d * nudge)');
    expect(picker, 'the nudge snapped to a grid').not.toMatch(/by[\s\S]{0,120}Math\.round\([^)]*\/\s*nudge/);
    // A press is one nudge and holding repeats. Darkness drags at 0.01 and
    // nudges at 0.05, because at one percent a press is invisible and the range
    // is 85 of them.
    expect(picker).toContain('const NUDGE = { blur: 1, dim: 0.05 }');
    expect(picker).toMatch(/setTimeout\([\s\S]{0,120}setInterval/);
    // And a dial can be unmounted mid-hold: pick Light while holding plus.
    expect(picker).toContain('useEffect(() => stopHold, []);');
  });

  it('closes by clicking away or by a little X, and says neither out loud', () => {
    // Both, which is the combination.
    expect(picker).toMatch(/themes-backdrop" onMouseDown=\{onClose\}/);
    expect(picker).toContain('className="theme-picker-x"');
    expect(picker).toMatch(/theme-picker-x[\s\S]{0,200}onClick=\{onClose\}/);
    // IN THE CORNER, and it stays there when a narrow window wraps the header.
    const x = ruleBody('.theme-picker-x');
    expect(x, 'no .theme-picker-x rule').toBeTruthy();
    expect(x).toMatch(/position:\s*absolute/);
    expect(x).toMatch(/top:\s*\d/);
    expect(x).toMatch(/right:\s*\d/);
    expect(ruleBody('.theme-picker')).toMatch(/position:\s*relative/);
  });

  it('keeps the X off the controls it paints over', () => {
    // THE X IS ABSOLUTE, so it paints over the header row whatever the DOM
    // order says, and the dials end at that row's right edge. Shot at 1710x944
    // before this was caught: the X's box was 1352-1374 and the Darkness plus
    // was 1350-1366, so a press on the plus closed the bar instead of turning
    // the veil up. The header's right padding is the clearance and it is not
    // decoration: 22 for the X, 10 for its offset, 8 of daylight.
    const head = ruleBody('.theme-picker-head');
    const pad = head.match(/padding:\s*([^;]+);/)?.[1] ?? '';
    const right = Number(pad.trim().split(/\s+/)[1]?.replace('px', ''));
    const x = ruleBody('.theme-picker-x');
    const xRight = Number(x.match(/right:\s*(\d+)px/)?.[1]);
    const xWide = Number(x.match(/width:\s*(\d+)px/)?.[1]);
    expect(Number.isFinite(right), 'the header lost its explicit padding').toBe(true);
    expect(right, 'the header runs under the X again').toBeGreaterThanOrEqual(xRight + xWide);
    // And every cell in a dial is placed by hand, because auto-placement and a
    // row-spanning glyph put the plus straight after the minus.
    expect(css).toMatch(/\.theme-dial > \.theme-dial-nudge\.less\s*\{[^}]*grid-column:\s*1/);
    expect(css).toMatch(/\.theme-dial > \.theme-dial-nudge\.more\s*\{[^}]*grid-column:\s*4/);
  });

  it('has no hint line, because she named the sentence it said', () => {
    // Deleted rather than reworded: minimalism trumps all, and the bar now
    // carries one word.
    expect(picker, 'the hint line came back').not.toContain('theme-picker-hint');
    expect(pickerCode, 'the bar tells her about arrow keys again').not.toMatch(/Arrow keys to try/);
    expect(pickerCode, 'the bar tells her to press escape again').not.toMatch(/Escape when you like/);
    // The header is the word Themes and the dials, and nothing else. Round
    // five briefly made the title conditional, because one of the six
    // arrangements took it off; quiet was picked, which keeps it, so the
    // head's first child is the title again with nothing in front of it.
    expect(picker).toMatch(/theme-picker-head">\s*<span className="theme-picker-title">Themes<\/span>/);
  });

  // ---- ROUND FIVE, SETTLED 2026-08-24: quiet was approved. Six arrangements
  // were reviewed behind a temporary switch; the switch and the five not picked
  // are deleted, and so are the two add-ons that rode inside the options passed
  // over. These tests are the fence around that.
  it('carries no switch and no arrangement she did not pick', () => {
    // The rule: an option still switchable is an option that has to be
    // decided twice. So nothing here may come back as a class, a prop or a global.
    // Their copy is in decisions.md, 2026-08-24, if it is ever wanted. The dot
    // matters: .topbar-quiet is an unrelated rule that happens to end in the
    // same eight characters, and a bare substring test flags it.
    for (const dead of ['.bar-shipped', '.bar-tight', '.bar-inline', '.bar-quiet',
                        '.bar-numbers', '.bar-left', '.bar-notitle']) {
      expect(css, `${dead} came back`).not.toContain(dead);
      expect(pickerCode, `${dead} came back`).not.toContain(dead.slice(1));
    }
    // x-low and tick-quiet were offered INSIDE options 1 and 2. Option 3 was
    // picked, which carried neither, so neither ships.
    expect(css, 'the low X came back and she did not pick it').not.toContain('.x-low');
    expect(css, 'the ringed tick came back and she did not pick it').not.toContain('.tick-quiet');
    // And the switch itself: no variant prop, no BarVariant, no window global.
    expect(pickerCode, 'the variant switch came back').not.toMatch(/BarVariant/);
    expect(pickerCode, 'the variant switch came back').not.toMatch(/HAS_LINE|HAS_TITLE/);
    expect(appCode, 'the dev-only global came back').not.toMatch(/__BAR_UI__/);
  });

  it('draws her X smaller and further into the corner than round four', () => {
    // Round four was a 22px box at top 8 right 10 with an 11px glyph, and its
    // top edge sat ABOVE the "Themes" text, which is why it was the first thing
    // the eye landed on.
    const x = ruleBody('.theme-picker-x');
    expect(x, 'no .theme-picker-x rule').toBeTruthy();
    expect(Number(x.match(/width:\s*(\d+)px/)?.[1]), 'the X is not smaller than round four').toBe(16);
    expect(Number(x.match(/right:\s*(\d+)px/)?.[1]), 'the X is not further into the corner').toBe(8);
    // LOWER: round four's top was 8, above the title's own text line.
    expect(Number(x.match(/top:\s*(\d+)px/)?.[1]), 'the X did not come down').toBeGreaterThan(8);
    // SHRINKING THE BOX IS ONLY HALF OF IT. An 18px box on round four's 1.5
    // stroke was built and shot in session and still read as loud as the 22,
    // because at this size the eye picks up weight and not size.
    expect(ruleBody('.theme-picker-x svg'), 'the glyph is not smaller').toMatch(/width:\s*8px/);
    expect(ruleBody('.theme-picker-x svg path'), 'the stroke went back to round four\'s weight')
      .toMatch(/stroke-width:\s*1\.2/);
  });

  it('takes the accent blue off the bar, which is the whole of quiet', () => {
    // Quiet was approved. The app's accent is a strong blue and two filled
    // bars of it ran across the top right of a card whose whole job is to be
    // looked past. The title and the number came down with them.
    expect(ruleBody('.theme-dial-line i'), 'the hairline is accent blue again')
      .toMatch(/background:\s*var\(--text-dim\)/);
    expect(ruleBody('.theme-picker-title'), 'the title got loud again')
      .toMatch(/color:\s*var\(--text-dim\)/);
    // Its own rule, not the grid-placement one: `.theme-dial > .theme-dial-val`
    // sits earlier in the file and ruleBody would find that instead.
    expect(own('.theme-dial-val'), 'the number got loud again')
      .toMatch(/color:\s*var\(--text-dim\)/);
    // AND THE GEOMETRY DID NOT MOVE, which is why quiet is the smallest
    // change: every dial still spans the full 168px hairline it did in round
    // four, with the word at one end and the number at the other.
    expect(ruleBody('.theme-dial-line'), 'the hairline changed width').toBeTruthy();
  });

  it('always draws the hairline, because only a rejected arrangement dropped it', () => {
    // 'numbers' was the one arrangement with no line, and it lost. The readout
    // approved in round three is a word, a number AND the line under it.
    expect(picker, 'the hairline went conditional again').not.toMatch(/hasLine/);
    expect(picker).toMatch(/theme-dial-track/);
    expect(picker).toMatch(/theme-dial-line/);
  });

  it('gives the hairline a target a hand can hit, at no cost in height', () => {
    // 2px is a line, not a control. The press area is a pseudo-element hanging
    // off the line rather than padding on the button, because padding would
    // make the header line taller and the height of this bar is the one thing
    // it may not spend.
    const track = ruleBody('.theme-dial-track');
    expect(track, 'no .theme-dial-track rule').toBeTruthy();
    expect(track).toContain('position: relative');
    const hit = css.match(/\.theme-dial-track::after \{[^}]*inset:\s*(-?\d+)px 0 (-?\d+)px/);
    expect(hit, 'the track has no press area, so the target is 2px tall').toBeTruthy();
    const tall = -Number(hit[1]) + 2 + -Number(hit[2]);
    expect(tall, 'the press target is under 14px').toBeGreaterThanOrEqual(14);
    // And never far enough down to sit over the top edge of a tile: the
    // header's own bottom padding is 10px.
    expect(-Number(hit[2]), 'the press area reaches into the tiles').toBeLessThanOrEqual(8);
    // A drag that wanders off the line keeps going.
    expect(picker).toContain('setPointerCapture');
  });
});

describe('the three designs she did not pick are gone, not hidden', () => {
  // Their copy is in decisions.md if anyone ever wants it back.
  const names = ['scrub', 'steps', 'drawer', 'tune-chip', 'readout'];

  it('has no switch between designs left in the component', () => {
    expect(pickerCode).not.toMatch(/DialUi/);
    expect(pickerCode).not.toMatch(/__DIAL_UI__/);
    expect(pickerCode).not.toMatch(/localStorage/);
    expect(pickerCode, 'the ui prop survived the round').not.toMatch(/\bui\?:/);
    expect(pickerCode, 'BLUR_STOPS survived the round').not.toContain('BLUR_STOPS');
  });

  it('has no stylesheet left for them either', () => {
    for (const n of names) {
      expect(code(css), `.theme-${n} is still in the stylesheet`).not.toContain(`.theme-${n}`);
    }
  });

  it('is unreachable from anywhere in the app, because there is nothing to reach', () => {
    expect(read('renderer/src/components/Palette.tsx')).not.toContain('dialui');
    expect(read('renderer/src/components/Settings.tsx')).not.toContain('dialui');
  });
});

describe('most of the screen stays visible, which is the whole shape of it', () => {
  it('has NO scrim, unlike every other modal in the app', () => {
    // --scrim over the window is the window wearing a theme she cannot see.
    const backdrop = ruleBody('.themes-backdrop');
    expect(backdrop, 'no .themes-backdrop rule').toBeTruthy();
    expect(backdrop).toMatch(/background:\s*none/);
    expect(backdrop, 'the theme picker dims the window it is for').not.toContain('var(--scrim)');
    // And the ordinary backdrop must still have one.
    expect(ruleBody('.modal-backdrop')).toContain('var(--scrim)');
  });

  it('is docked at the bottom rather than centred on the card', () => {
    expect(ruleBody('.themes-backdrop')).toMatch(/align-items:\s*flex-end/);
  });

  it('wears the theme’s own opaque writing surface, not a new colour', () => {
    const card = ruleBody('.theme-picker');
    expect(card).toContain('background: var(--skin-solid)');
    // Sharp, like every card in this app since.
    expect(card).toContain('border-radius: 0');
  });

  it('keeps the tile big enough to be a picture', () => {
    // Round two of this item measured that at 116x74 a photograph reads as a
    // grey stamp and two flat themes are the same rectangle. 140x92 is the
    // floor, so a later round cannot quietly shrink these into swatches.
    const tile = ruleBody('.theme-picker .look-swatch');
    const w = +tile.match(/width:\s*(\d+)px/)[1];
    const h = +tile.match(/height:\s*(\d+)px/)[1];
    expect(w).toBeGreaterThanOrEqual(140);
    expect(h).toBeGreaterThanOrEqual(92);
  });
});

/* * ===========================================================================
   THE WAY BACK, AND ONLY UNDER THE POINTER. w-a863b48784, 2026-08-25.

   THE FIVE NOT PICKED ARE DELETED, not switchable, per the rule on
   w-4b18412c42: an option still there is an option that has to be decided
   twice. The tests below are the fence that keeps them deleted, and the fence
   that keeps this one as quiet as it was approved.
   ===========================================================================
*/
describe('the reset on the theme bar: only under her pointer', () => {
  it('has no switch on it any more, and none of the five she sent back', () => {
    // The switch that held six half-designs is gone from the source entirely
    // rather than defaulted to off.
    for (const f of ['renderer/src/components/ThemePicker.tsx', 'renderer/src/App.tsx',
      'renderer/src/components/Settings.tsx', 'renderer/src/components/Palette.tsx',
      'renderer/src/main.tsx', 'renderer/src/styles.css']) {
      expect(read(f), `${f} still carries the round seven switch`).not.toContain('__RESET_UI__');
    }
    // And the five losers, by the one selector each of them had, in the
    // stylesheet and in the component both.
    for (const [name, sel] of [['a mark on the line', '.theme-dial-home'],
      ['the number puts it back', '.theme-dial-val.as-reset'],
      ['it appears when you move something', '.theme-tune-reset'],
      ['down in the corner', '.theme-picker-undo'],
      ["on the theme's own tile", '.look-undo']]) {
      expect(ruleBody(sel), `${name} is still in the stylesheet`).toBeFalsy();
      expect(picker, `${name} is still drawn`).not.toContain(sel.slice(1).replace('.', ' '));
    }
  });

  it('reserves the cell so the glyph arriving moves nothing', () => {
    // The whole of why this one was picked over the other five that appear on
    // demand: the column is in the grid whether or not anything is in it, so
    // hovering a dial cannot shove the bar sideways. VISIBILITY, not display,
    // and the dial is five columns wide at rest.
    expect(ruleBody('.theme-dial')).toMatch(/grid-template-columns:\s*auto auto auto auto auto/);
    expect(ruleBody('.theme-dial > .theme-dial-late')).toMatch(/grid-column:\s*5/);
    const late = ruleBody('.theme-dial-late');
    expect(late).toMatch(/visibility:\s*hidden/);
    expect(late, 'the reset was hidden by not being laid out').not.toMatch(/display:\s*none/);
  });

  it('shows it only under the pointer and only when there is something to undo', () => {
    // Two conditions, and both are in the selector rather than in JS: the dial
    // must be `moved` and the pointer must be on it. At rest the bar carries no
    // reset anywhere, which is the bar approved as quiet on 08-24.
    expect(css).toContain('.theme-dial.moved:hover .theme-dial-late');
    // Keyboard reaches it too, or it is a control a tab-only user cannot press.
    expect(css).toContain('.theme-dial.moved:focus-within .theme-dial-late');
    expect(pickerCode).toMatch(/const moved = Math\.abs\(value - preset\) > step \/ 2/);
    expect(pickerCode, 'a button that undoes nothing is still a tab stop').toContain('tabIndex={moved ? 0 : -1}');
    expect(pickerCode).toContain('aria-hidden={!moved}');
  });

  it('is never louder than the minus and the plus she approved', () => {
    const late = ruleBody('.theme-dial-late');
    const nudge = ruleBody('.theme-dial-nudge');
    for (const [k, re] of [['size', /width:\s*16px/], ['border', /border:\s*none/],
      ['fill', /background:\s*none/], ['colour', /color:\s*var\(--text-faint\)/]]) {
      expect(late, `the reset is not the minus's ${k}`).toMatch(re);
      expect(nudge, `the minus changed its ${k} underneath this test`).toMatch(re);
    }
  });

  it('puts each dial back on its own picture\'s number, and says which', () => {
    // Sixteen pictures carry sixteen measured pairs. A reset holding its own
    // idea of home is the kind of wrong that looks right until the second
    // picture, so it reads TUNE_DEFAULT.
    expect(pickerCode).toContain('TUNE_DEFAULT[look as SkinId]');
    expect(pickerCode).not.toMatch(/blur:\s*2,\s*dim:/);
    // Per dial, not one button for both: that is the design that was picked.
    expect(pickerCode).toContain('onReset={() => onSetTune({ ...tune, blur: preset.blur })}');
    expect(pickerCode).toContain('onReset={() => onSetTune({ ...tune, dim: preset.dim })}');
    expect(pickerCode).toContain('title={`Back to ${format(preset)}`}');
  });

  it('has no reset at all on a theme with no picture', () => {
    // Light, Dark and Match have nothing to blur and no veil to turn down, so
    // the dials do not draw there and the reset lives inside the dial.
    expect(pickerCode).toMatch(/\{skin && \(\s*<div className="theme-dials">/);
  });
});
