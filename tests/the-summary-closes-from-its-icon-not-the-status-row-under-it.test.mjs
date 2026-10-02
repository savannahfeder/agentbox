// THE SUMMARY CLOSES FROM ITS ICON, NOT THE STATUS ROW UNDER IT (w-febaf7b3d8).
//
// What broke: the summary could not be closed. Its close icon is pinned to the
// panel's top right (absolute, 22px down, 20px in), which was beside the
// thread's name until the name moved down under the hairline (w-b38e975e2c).
// From then on the first thing at the top was the Status row, and its button
// runs the full width of the panel, so the icon sat inside the Status wash.
// The Status cell is `position: relative` and comes later in the page, so it
// painted over the icon and took the pointer: hovering the icon lit the Status
// dropdown and a click opened it instead of closing the summary.
//
// Measured from summary.css before the change: the icon spans 48px to 20px
// from the panel's right edge, the Status wash ran to 20px from it (content
// edge at 28px plus the button's 8px bleed), so the two overlapped by 28px,
// the icon's whole width; and the icon had no z-index against a later
// positioned sibling.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryPanel } from '../renderer/src/threads/Summary.tsx';
globalThis.React = React;

const css = fs.readFileSync(new URL('../renderer/src/threads/summary.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};
const px = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|;|\\s)${prop}:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
};
const num = (s) => parseFloat(s);

const NOW = Date.now();
const item = (o = {}) => ({
  id: 'w-acme', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Acme renewal terms', kind: 'review',
  labels: [], priority: 5, epoch: 0, claim: null, createdAt: NOW - 3_600_000, updatedAt: NOW - 60_000, createdBy: 'p-sam',
  result: 'Send these terms?', ...o,
});
const sam = { id: 'p-sam', name: 'Sam Rivera', email: 'sam@example.test', avatarUrl: null };
const team = { me: 'p-sam', byId: new Map([['p-sam', sam]]), state: { since: null, people: [sam] }, products: new Map() };
const panel = (props = {}) => renderToStaticMarkup(React.createElement(SummaryPanel, {
  item: item(), team, onClose: () => {}, onFinish: () => {}, ...props,
}));

// Where the Status reserve is written: the value cell straight after the label
// in the props grid that follows the close icon.
const RESERVE = '.ts-close + .ts-props > .ts-value:nth-child(2)';

describe('the close icon over the Status row', () => {
  it('still sits straight before the properties, with Status as their first value', () => {
    const html = panel();
    expect(html).toMatch(/<button[^>]*class="ts-close"[\s\S]*?<\/button><div class="ts-props"><span class="ts-label">Status<\/span><span class="ts-value[^"]*"/);
  });

  it('is painted above the Status row, so the pointer lands on it', () => {
    const z = px(rule('.ts-close'), 'z-index');
    expect(z).not.toBeNull();
    expect(Number(z)).toBeGreaterThanOrEqual(1);
  });

  it('leaves a gap between the Status wash and the icon', () => {
    const close = rule('.ts-close');
    const iconLeft = num(px(close, 'right')) + num(px(close, 'width'));       // from the panel's right edge
    const pad = num(px(rule('.ts-panel'), 'padding').split(/\s+/)[1]);         // the panel's right padding
    const bleed = -num(px(rule('.ts-prop-btn'), 'margin').split(/\s+/)[1]);   // how far the wash runs past its cell
    const reserve = num(px(rule(RESERVE), 'margin-right'));
    const washEnd = pad + reserve - bleed;                                     // the wash's right end, from the panel's edge
    expect(washEnd).toBeGreaterThan(iconLeft);
  });

  it('does not take the room from the rows below it, which the icon does not reach', () => {
    // Priority, Owner and Project keep the full width: only the second child of
    // the grid, the Status value, is narrowed.
    expect(css).not.toMatch(/\.ts-props\s*>\s*\.ts-value\s*\{[^}]*margin-right/);
    expect(css).not.toMatch(/\.ts-prop-btn\s*\{[^}]*margin-right/);
  });

  it('reserves nothing when the panel has no close icon', () => {
    // The reserve hangs off `.ts-close +`, so a panel drawn without onClose
    // has no icon there and its Status row runs the full width.
    expect(RESERVE.startsWith('.ts-close + ')).toBe(true);
    expect(panel({ onClose: undefined })).not.toContain('ts-close');
  });
});
