// A TALL PICTURE IN FULL SCREEN RAN OFF THE BOTTOM OF THE WINDOW, 2026-10-02.
//
// Reported with a design board open in full screen: "it overflows and I can't
// scroll down. I also can't see the reply area." Two faults, one cause.
//
// The document pane is not a child of `.body`. ArtifactSurface portals it
// into a `.artifact-host` (display:contents) so one mounted document can move
// between layouts, which makes the DOM `.body > .artifact-host > .doc-pane`.
// The full screen rules were written as `.body > .doc-pane`, matched nothing,
// and so the pane never got its `min-height:0`. A flex item without it cannot
// be shorter than its content, and a picture's content is its whole height:
// measured in headless Chrome on the real stylesheets, a 1810 by 2600 picture
// in a window 813 points tall ran the pane from 40 to 1682 and put the reply
// line at 1682 to 1722, wholly below the window, with nothing inside able to
// scroll. Html pages hid it because a frame has no tall content. After: pane
// 40 to 739, reply line 739 to 779, the card scrolls; a 1600 by 900 picture
// fits with no scroll and a 300 by 200 one stays 300 wide.
//
// And once the pane fits, a tall picture must still be readable: full screen
// shows it at the width of the window and lets the card scroll, rather than
// shrinking a long board to a strip down the middle.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../renderer/src/' + p, import.meta.url), 'utf8');
const FOCUS = '.workspace-layout[data-artifact-layout="focus"]:not(.workspace-settings)';
const css = () => read('workspace-navigation.css') + read('styles.css');

it('portals the document pane through a host, which is the path the rules must take', () => {
  expect(read('components/ArtifactSurface.tsx')).toContain("node.className = 'artifact-host';");
});

it('lets the full screen pane shrink to the room above the reply line', () => {
  expect(css()).toContain(`${FOCUS} > .body > .artifact-host > .doc-pane { order:1; flex:1 1 auto !important; width:100%; min-height:0; }`);
});

// The case that must NOT be there: a rule that skips the host matches nothing,
// on any layout, and looks right in a diff. That is exactly how this shipped.
it('has no rule that reaches the document pane straight from the body', () => {
  const rules = css().replace(/\/\*[\s\S]*?\*\//g, '');
  expect(rules).not.toMatch(/\.body\s*>\s*\.doc-pane/);
});

it('scrolls a tall picture at the width of the window in full screen', () => {
  const c = css();
  expect(c).toContain(`${FOCUS} .doc-pane.doc-image .doc-card { overflow-y:auto; }`);
  const rule = c.match(new RegExp(`${FOCUS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.doc-picture \\{([^}]*)\\}`))?.[1] ?? '';
  expect(rule).toContain('flex:none;');
  expect(rule).toContain('max-height:none;');
  // `.doc-view` is width:100%, which stretched a 300 point picture to 1146.
  // At its own width it never grows past its own size.
  expect(rule).toContain('width:auto;');
});

// Beside the conversation it still fits whole: the pane is narrow there, and
// a picture you have to scroll in a half-width pane is one you cannot see.
it('still fits the whole picture when it sits beside the conversation', () => {
  expect(read('styles.css')).toMatch(/\n\.doc-picture \{[^}]*object-fit: contain;[^}]*max-height: 100%;/);
});
