// THE BROWSER IS ALLOWED TO SKIP A HUNK SHE IS NOWHERE NEAR —.
//
// Every row of every hunk is in the document and stays there; the pane just
// shows the lines, and nothing here takes that back.
// What was added is one CSS rule that lets the browser skip the style, layout
// and paint of a hunk a thousand lines above the window, plus a height for it
// to stand at while it is skipped.
//
// THESE ARE THE TWO THINGS THAT WOULD BREAK IT SILENTLY. The rule can be
// deleted by anyone tidying the stylesheet, and the height can drift away from
// the row height it is derived from, which is the number that stops the
// scrollbar lurching as each hunk comes into view. Both are cheap to check and
// neither is visible in a screenshot.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { ROW_PX, HUNK_PAD_PX, hunkGuessPx } from '../renderer/src/code-artifact.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer', 'src', 'styles.css'), 'utf8');
const tsx = fs.readFileSync(path.join(root, 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');

/** The declarations inside the first `.code-hunk { … }` rule in the stylesheet. */
function hunkRule() {
  const m = css.match(/^\.code-hunk \{([^}]*)\}/m);
  return m ? m[1] : '';
}

/** The declarations inside the `.code-row { … }` rule. */
function rowRule() {
  const m = css.match(/^\.code-row \{([^}]*)\}/m);
  return m ? m[1] : '';
}

describe('a hunk off the screen costs nothing to have', () => {
  it('lets the browser skip a hunk that is nowhere near the window', () => {
    expect(hunkRule()).toMatch(/content-visibility:\s*auto/);
  });

  it('gives a skipped hunk a height, or the scrollbar would lie', () => {
    // The height is per hunk and comes from the component, because it depends
    // on how many rows that hunk has. `auto` in the value is what makes the
    // browser keep the real height once it has drawn the hunk properly.
    expect(tsx).toMatch(/containIntrinsicSize: `auto \$\{hunkGuessPx\(rows\.length\)\}px`/);
  });

  it('keeps every row in the document rather than hiding code again', () => {
    // The fold is gone and this must not quietly bring it back. Skipping is a
    // drawing decision the browser makes; the rows are all still there.
    expect(hunkRule()).not.toMatch(/display:\s*none/);
    // The stylesheet still MENTIONS `.code-more` in the comment that records
    // why the button went, which is worth keeping. What must not come back is
    // a rule that draws one, or a component that renders one.
    expect(css).not.toMatch(/^\.code-more[\s{,:]/m);
    expect(tsx).not.toMatch(/code-more/);
  });
});

describe('the guessed height matches the row it is guessing about', () => {
  it('is the row height the stylesheet actually sets', () => {
    // `.code-row` is 12px of mono at line-height 1.55. If either moves, the
    // guess moves with it or every skipped hunk stands at the wrong height.
    const rule = rowRule();
    const size = Number(rule.match(/font-size:\s*([\d.]+)px/)[1]);
    const height = Number(rule.match(/line-height:\s*([\d.]+)/)[1]);
    expect(Math.round(size * height * 100) / 100).toBe(ROW_PX);
  });

  it('adds the padding the hunk itself has', () => {
    const pad = Number(hunkRule().match(/padding:\s*([\d.]+)px/)[1]);
    expect(pad * 2).toBe(HUNK_PAD_PX);
  });

  it('grows with the rows and is never zero', () => {
    expect(hunkGuessPx(1)).toBe(23);
    expect(hunkGuessPx(34)).toBe(636);
    expect(hunkGuessPx(0)).toBe(HUNK_PAD_PX);
    expect(hunkGuessPx(400)).toBeGreaterThan(hunkGuessPx(399));
  });
});
