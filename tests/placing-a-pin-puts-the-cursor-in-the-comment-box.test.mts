// PLACING A PIN PUTS THE CURSOR IN THE COMMENT BOX AT ONCE.
//
// Sofia clicked a spot and typed straight away, twice, and both comments went
// nowhere. The box was focused a frame later, in requestAnimationFrame, and a
// frame never comes in a tab the browser counts as hidden, which hers was
// (measured: document.visibilityState 'hidden' after the app opened a sign-in
// tab). It is focused in the same press now, and the pin just written stays
// picked, so the next zoom holds it in view.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');

it('focuses the box in the press that places the pin, not a frame later', () => {
  const onPlace = view.match(/onPlace=\{editable[^?]*\? \(p\) => \{[^\n]*\}/)?.[0] ?? '';
  expect(onPlace).toContain('box.current?.focus()');
  expect(onPlace).not.toContain('requestAnimationFrame');
});

it('keeps the comment just written picked', () => {
  const send = view.slice(view.indexOf('const send = async'), view.indexOf('const settle = async'));
  expect(send).toMatch(/setActiveId\(id\)/);
});
