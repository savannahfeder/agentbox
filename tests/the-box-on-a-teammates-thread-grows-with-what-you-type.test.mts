// THE BOX ON A TEAMMATE'S THREAD GROWS WITH WHAT YOU TYPE (w-f702d60afe, round six, 2026-11-20).
//
// The PM tester typed a three-line instruction to Priya's agent: "The first line
// is clipped at the top of the composer while the later lines remain visible."
// The box was two rows tall and scrolled. It now sizes to its words, up to a
// cap, so what you are about to send to someone else's agent is all in view.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');

describe('the comment box on a teammate\'s thread', () => {
  it('grows with its words up to a cap', () => {
    expect(css).toMatch(/\.th-comment textarea \{[^}]*field-sizing: content;[^}]*max-height: 240px;/);
  });
});
