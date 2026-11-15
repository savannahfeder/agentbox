// THE FACES IN THE CORNER SIT EVENLY (w-b5f23cff71).
//
// "The spacing of these components looks pretty wacky. It's weirdly wide and
// uneven." The screenshot of the faces on Needs you's row, measured off it at
// 2x: four people 88 apart, then 136 to the first AI teammate, 88 to the
// next, and 136 again to Search. The CSS said why: a 16px gap, a 6px spacer
// between people and AI teammates (so 38 there), and a margin before Search.
// Now one gap runs between every face and on to Search, and the AI teammates
// are told apart by their dashed squares alone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CornerFaces } from '../renderer/src/team/everything/TeamStrip.tsx';

const css = fs.readFileSync(new URL('../renderer/src/team/everything/everything.css', import.meta.url), 'utf8');
const members = [
  { key: 'me', kind: 'me', name: 'You', agents: 6, now: null },
  { key: 'person:p-m', kind: 'person', name: 'Sam Ortiz', agents: null, now: null },
  { key: 'mate:t-g', kind: 'mate', name: 'Growth marketer', letter: 'G', agents: 0, now: null },
  { key: 'mate:t-v', kind: 'mate', name: 'Video producer', letter: 'V', agents: 1, now: null },
];

describe('the faces on Needs you', () => {
  it('have nothing between the people and the AI teammates but the same gap', () => {
    const html = renderToStaticMarkup(h(CornerFaces, { members, onPick() {} }));
    expect(html).not.toContain('ev-cgap');
    expect(html.match(/class="ev-cf"/g)).toHaveLength(4);
  });

  // Measured on the built app: 10px between every two faces, and 10px from
  // the last face to the magnifier, once the row's own 24px gap is taken back.
  it('use one gap, and the same gap again before Search', () => {
    const gap = /\.ev-corner \{[^}]*gap: (\d+)px/.exec(css)?.[1];
    expect(Number(gap)).toBeGreaterThan(0);
    expect(Number(gap)).toBeLessThanOrEqual(12);
    expect(css).toMatch(/\.ev-corner \{[^}]*margin-right: 0;/);
    expect(css).toMatch(/\.th-bar \.ev-corner \+ \.th-search \{ margin-left: -22px; width: 24px; \}/);
    expect(css).not.toMatch(/\.ev-cgap/);
  });
});
