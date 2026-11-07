// DONE SITS IN THE CORNER, BESIDE THE DOTS AND APART FROM THEM.
//
// Her words (w-bca8a6466f, 2026-10-26): "We need a button in the top right to
// be able to easily mark threads as done; currently it's very non-discoverable
// for such a key feature." Since 2026-10-01 the only mouse route to Done in an
// opened thread was the last row of the three-dot menu, two clicks behind a
// button with no word on it. Six corners were drawn in the real renderer and
// she picked the fifth, "Joined with the dots": one control, the left half
// marks the thread done, the right half opens the menu.
//
// It shipped (4fe0c719) and she turned it down the same night: "I actually
// don't like the fact that it's connected to the three dots. Can you update it
// so it's the one that was separate instead?" So Done is its own box again,
// the second drawing ("Ticks and word"), with the bar's own gap before the dots.
//
// What this holds:
//   - Done is drawn as its own button, before the dots, with the double tick
//     and the word, and hovering it names E (`data-hint="done"`).
//   - The menu no longer offers Mark done as a row, so it is never two places.
//   - A conversation with a person, whose menu was Mark done alone, gets Done
//     alone and no dots. A finished thread gets the dots and no Done.
//   - Done is never joined to the dots: it keeps all four edges and a gap.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadMenuRows, splitDone, ThreadMenu } from '../renderer/src/threads/ThreadMenu.tsx';
import { HINTS } from '../renderer/src/hint-plate.ts';
globalThis.React = React;

const draw = (el) => renderToStaticMarkup(el);
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('Done in the corner, beside the dots', () => {
  it('draws Done before the dots on a thread with other verbs, as a box of its own', () => {
    const html = draw(React.createElement(ThreadMenu, { terminal: 'closed', onToggleTerminal: () => {}, onFinish: () => {} }));
    expect(html).toContain('class="ts-done"');
    expect(html).not.toContain('joined');
    expect(html).toContain('class="ts-more"');
    expect(html.indexOf('ts-done')).toBeLessThan(html.indexOf('class="ts-more"'));
    expect(html).toContain('>Done<');
    expect(html).toContain('data-hint="done"');
    // The double tick that was the Done mark.
    expect(html).toContain('m10.6 13 3.6 3.6L21 9');
  });

  it('takes Mark done out of the menu and keeps the rest in order', () => {
    const rows = threadMenuRows({ change: true, terminal: 'closed', finish: true, pin: 'unpinned' });
    const { done, menu } = splitDone(rows);
    expect(done?.label).toBe('Mark done');
    expect(done?.key).toBe('E');
    expect(menu.map((r) => r.id)).toEqual(['code', 'terminal', 'pin']);
  });

  it('gives a conversation with a person Done alone, with no dots', () => {
    const html = draw(React.createElement(ThreadMenu, { terminal: null, onFinish: () => {} }));
    expect(html).toContain('class="ts-done"');
    expect(html).not.toContain('class="ts-more"');
  });

  // The case that must not match: nothing to finish on a finished thread.
  it('draws no Done on a finished thread, only the dots', () => {
    const html = draw(React.createElement(ThreadMenu, { terminal: 'closed', onToggleTerminal: () => {}, onFinish: null }));
    expect(html).not.toContain('ts-done');
    expect(html).toContain('class="ts-more"');
    expect(splitDone(threadMenuRows({ change: false, terminal: 'closed', finish: false })).done).toBeNull();
  });

  it('says E on hover, in the words the row plate uses', () => {
    expect(HINTS.done).toEqual([{ key: 'E', what: 'Mark done' }]);
  });

  it('keeps Done apart from the dots by the bar’s own 10 point gap, every edge drawn', () => {
    const css = read('renderer/src/threads/summary.css');
    expect(css).not.toMatch(/ts-done-joined/);
    expect(css).toMatch(/\.ts-more-wrap \{[^}]*gap: 10px;/);
    expect(css).toMatch(/\.ts-done \{[^}]*border: 1px solid var\(--line\);/);
  });
});
