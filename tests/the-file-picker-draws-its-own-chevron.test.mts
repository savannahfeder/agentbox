// THE CHEVRON ON THE FILE PICKER IS OURS —, 2026-09-19.
//
// It was, and the reason is that the app was not drawing it. The picker is the
// `<select>` that stands in for the file tree when the pane is too narrow to
// hold one, and it was left at `appearance: auto`, so Chromium drew the arrow
// wherever its own metrics said. Measured on her 2,562-row change at 772px of
// pane: a filled glyph about 9px from the border, a couple of points below the
// middle, in a weight this app uses nowhere else.
//
// Now the box is ours, the mark is the same path and the same 1.5 stroke the
// file tree's `.code-caret` uses, and it sits 12px in from the control's right
// edge, which is the same 12px the control is inset from the code column.
// Re-measured after: insetFromRight 12, off centre by 0.5px, which is the
// half-pixel of an odd mark centred in an even box.
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../renderer/src/' + p, import.meta.url), 'utf8');
const css = read('workspace-navigation.css');
const tsx = read('components/CodeArtifact.tsx');

it('stops the browser drawing the arrow', () => {
  expect(css).toMatch(/\.code-file-picker \{[^}]*appearance:none/);
  expect(css).toMatch(/\.code-file-picker \{[^}]*-webkit-appearance:none/);
});

it('draws the tree\'s own chevron and leaves room for it', () => {
  // The same path and weight as `.code-caret` in the file tree, rotated down.
  expect(tsx).toContain('className="code-pick-caret"');
  expect(tsx).toContain('d="M4 6l4 4 4-4"');
  expect(tsx).toContain('strokeWidth="1.5"');
  // Reserved room on the right, or the filename runs under the mark.
  expect(css).toMatch(/\.code-file-picker \{[^}]*padding:8px 34px 8px 8px/);
});

it('places it 12px in and centred, and lets the select keep every click', () => {
  const rule = css.match(/\.code-pick-caret \{[^}]*\}/s)?.[0] ?? '';
  expect(rule).toContain('right:12px');
  expect(rule).toContain('top:50%');
  expect(rule).toContain('margin-top:-6.5px');
  expect(rule).toContain('width:13px');
  expect(rule).toContain('pointer-events:none');
  // It is decoration over a real control, so it must not be read out as one.
  expect(tsx).toMatch(/code-pick-caret[^>]*aria-hidden="true"/s);
});

it('shows and hides with the tree it stands in for', () => {
  // The wrapper carries the display switch now, not the select, or the select
  // would be hidden inside a wrapper that is still on the screen.
  expect(css).toContain('.code-file-pick { display:none; }');
  expect(css).toMatch(/\.code-file-pick \{ display:block;/);
});
