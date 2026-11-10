// Clicking Send once did nothing while Cmd+Enter worked. Measured in a live copy
// with a real press: `.dock-send:active` moved the button down 1px, so a press on
// its top row ended on the footer beside it. The click landed on
// `compose-sentence`, the words stayed in the box and the keyboard lost its place.
// A press in the middle of the same button sent, which is why it looked random.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'renderer', 'src');
const sheets = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const at = path.join(dir, e.name);
  return e.isDirectory() ? sheets(at) : e.name.endsWith('.css') ? [at] : [];
});
const movesWhenPressed = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*:active[^{}]*)\{([^}]*)\}/g)]
  .filter(([, , rules]) => /transform\s*:(?!\s*none)/.test(rules))
  .map(([, selector]) => selector.trim());

describe('a button stays under the pointer while it is pressed', () => {
  it('Send and Stop in the reply box do not move', () => {
    const moved = movesWhenPressed(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'));
    expect(moved.filter((s) => /dock-send|dock-stop/.test(s))).toEqual([]);
  });

  it('nothing in any stylesheet moves a button out from under a press', () => {
    const moved = sheets(root).flatMap((file) => movesWhenPressed(fs.readFileSync(file, 'utf8'))
      .filter((s) => !/thumb|slider|drag|grab/.test(s))
      .map((s) => `${path.basename(file)}: ${s}`));
    expect(moved).toEqual([]);
  });

  it('the check itself catches a press that moves, and leaves one that only darkens', () => {
    expect(movesWhenPressed('.a:active { transform: translateY(1px); }')).toEqual(['.a:active']);
    expect(movesWhenPressed('.a:active { filter: brightness(.9); }')).toEqual([]);
    expect(movesWhenPressed('.a:active { transform: none; }')).toEqual([]);
  });
});
