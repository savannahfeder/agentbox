// THE BOX ON A TEAMMATE'S THREAD GROWS WITH WHAT YOU TYPE (w-f702d60afe, round six, 2026-11-20).
//
// The PM tester typed a three-line instruction to Priya's agent: "The first line
// is clipped at the top of the composer while the later lines remain visible."
// The box was two rows tall and scrolled. It now sizes to its words, up to a
// cap, so what you are about to send to someone else's agent is all in view.
// Since w-8a8eac7620 it is the reply box's own field, grown by the reply box's
// rule: up to 40% of the page (dock-height.ts).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/threads/TeammateThread.tsx', import.meta.url), 'utf8');

describe('the comment box on a teammate\'s thread', () => {
  it('grows with its words up to a cap', () => {
    expect(page).toMatch(/<textarea ref=\{field\} className="dock-input"/);
    expect(page).toMatch(/useLayoutEffect\(\(\) => \{ applyDockHeight\(field\.current\); \}\);/);
  });
});
