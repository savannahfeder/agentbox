// 2026-09-14: the approved workspace retains its card header in tasks; legacy
// layouts still use the quiet strip. AN OPENED TASK DOES NOT DRAW THE TOP BAR
// —.
//
// What replaces the bar is not nothing, and both reasons are invisible:
//
//   1. macOS paints its own close, minimise and zoom over our top-left corner,
//      at y 10..23 in window points, measured off her own screenshot on this
//      row. A task drawn from y=0 puts the way out under them.
//   2. `.topbar` carried the only `-webkit-app-region: drag` on this screen.
//      Without a strip, an opened task is a window she cannot move.
//
// So 34 points stay, empty and draggable, and everything else goes. The heights
// themselves are not testable here because vitest has no layout; they are
// measured in the running app, which writes
// `designs//measured.json`: the bar is 99.5 and the strip is 34.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');
const repeat = fs.readFileSync(path.join(root, 'renderer/src/components/RepeatFocus.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

const rule = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at) + 1);
};

describe('an opened task has no top bar', () => {
  it('draws the bar only when a task is not open', () => {
    // `inFullScreen` is the opened-task state; it is the same flag that puts
    // `flat` on the app. The strip took children while the six shapes of round
    // three are open (`renderer/src/task-shape.ts`): two of them put words in
    // it. So this asks for the branch and the class rather than for the exact
    // self- closing tag it was written against, which is the part that carries
    // the rule. When she picks a shape and the option set is deleted, the
    // strip goes back to being empty for four of the six and this still holds.
    expect(app).toMatch(/\{inFullScreen && !workspaceNavigation \? \(?\s*(?:\/\*[\s\S]*?\*\/\s*)?<div className="topbar-quiet"/);
    // A bar at all, only when no task is open.
    expect(app).toContain('<header className="topbar">');
  });

  it('leaves a strip that can still be grabbed, because the bar was the only one', () => {
    const quiet = rule('.topbar-quiet');
    expect(quiet).toBeTruthy();
    expect(quiet).toMatch(/-webkit-app-region:\s*drag/);
  });

  it('keeps the strip tall enough to clear the three buttons macOS paints on us', () => {
    // They end at y=23. Anything under that and the window controls sit on the
    // title. 34 is the number, and it is not a taste call. The height is
    // `--quiet-strip` now rather than a literal, because the way out is
    // positioned inside the pane the strip pushes down and the two numbers
    // were drifting apart in two files. Same 34, read through the variable so
    // this test still fails if anyone moves it.
    const decl = /height:\s*var\(--quiet-strip\)/.exec(rule('.topbar-quiet'));
    expect(decl).toBeTruthy();
    const h = /--quiet-strip:\s*(\d+)px/.exec(css);
    expect(h).toBeTruthy();
    expect(Number(h[1])).toBeGreaterThanOrEqual(24);
    expect(Number(h[1])).toBe(34);
  });

  it('draws the way out she asked back for, up where the strip left the title', () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, AND HER NEWER WORD REVERSED IT.
    // Her later sentence wins.
    expect(focus).toMatch(/<button className="back-esc"/);

    // AND 5 IS NOT THE NUMBER ANY MORE.5 was arithmetic off the worst case and
    // it shipped as a flat rule for every window. The gutter is 22, which is
    // where the search glass and the word Inbox begin, and hard left is the
    // floor under it rather than the placement. See ".back-esc" in styles.css.
    expect(rule('.back-esc')).toContain('left: 22px');
    expect(rule('.app.doc-open .focus-pane > .back-esc'))
      .toContain('left: clamp(5px, calc(50% - var(--read-w) / 2 + 5px), 22px)');

    // AND THE NUMBER IS NOT THE ONE THIS BRANCH CARRIED EITHER. 130 is measured
    // off the 100px topbar, which an opened task does not have; against the
    // strip the same chain gives 64, and the built app measures 66. Both rules
    // read it off one variable now, and the rules that position inside the pane
    // pay it less the strip, so the two cannot drift.
    expect(rule('.app.flat .back-esc')).toContain('top: var(--wayout-top-flat)');
    const top = /--wayout-top-flat:\s*(\d+)px/.exec(css);
    expect(top).toBeTruthy();
    expect(Number(top[1])).toBe(66);
    expect(rule('.app.doc-open .focus-pane > .back-esc'))
      .toContain('top: calc(var(--wayout-top-flat) - var(--quiet-strip))');

    // The narrow-window exceptions stay gone: hard left and wordless it fits at
    // every width, so nothing jumps it up into the strip any more.
    expect(css).not.toMatch(/^\.app\.doc-up/m);
    expect(app).not.toContain('doc-up');
  });

  it('still leaves her a way out, which is the key and the hint that names it', () => {
    // Removing the drawing is not removing the exit. The esc key still closes
    // the task, and a control on the screen still names the key.
    //
    // WHERE THE HINT MOVED. It used to be the "esc back" button in the row
    // under the message.
    expect(focus).toMatch(/e\.key === 'Escape'/);
    const at = focus.indexOf('className="back-esc"');
    expect(at).toBeGreaterThan(-1);
    const back = focus.slice(at, focus.indexOf('</button>', at));
    expect(back).toContain('onClick={onClose}');
    expect(back).toMatch(/aria-label="Back \(esc\)"/);
    expect(back).toMatch(/title="Back \(esc\)"/);
  });

  it('keeps the Scheduled rule pane\'s own way out, which never collided', () => {
    // It sits in that header's own margin, not in the window corner, so
    // none of the problems with the one on a task apply to it.
    expect(repeat).toMatch(/className="back-esc in-head"/);
    expect(rule('.back-esc.in-head')).toBeTruthy();
  });

  it('reads the message and her title slightly bigger, the other half of her answer', () => {
    // 21 to 23 and 15 to 16. The size rule for the body must come AFTER
    // `.markdown` or the message keeps the 15 every other surface gets, since
    // it carries both classes at once.
    expect(rule('.focus-title')).toMatch(/font-size:\s*23px/);
    const body = css.indexOf('.focus-body, .focus-body .markdown, .focus-body .msg-body');
    expect(body).toBeGreaterThan(css.indexOf('\n.markdown {'));
    expect(css.slice(body, css.indexOf('}', body))).toMatch(/font-size:\s*16px/);
  });

  it('does not pay for the bigger type out of the line she reads', () => {
    // is the centring rule's own law. --read-w is the width of the sheet and
    // nothing here may touch it.
    expect(rule('.app')).toMatch(/--read-w:\s*780px/);
  });
});
