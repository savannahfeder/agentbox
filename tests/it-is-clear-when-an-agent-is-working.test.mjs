// 2026-09-18: the founder could not tell whether an agent was working. The
// previous mark measured 13px at the conversation foot and 12px in the
// header. Pin the replacement's nine-cell lattice and honest active/inactive
// boundaries: a queued, paused, stopped or finished run must never animate.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { LiveMark } from '../renderer/src/components/LiveMark';
import { Live } from '../renderer/src/components/Live';
globalThis.React = React;
const draw = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const item = { id: 'working-test', status: 'open', kind: 'directive', title: 'Task' };
const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
describe('it is clear when an agent is working', () => {
  it('shows the orbit lattice immediately, with nine cells and one quiet centre', () => {
    const html = draw(LiveMark, {});
    expect(html.match(/class="live-lattice-cell"/g)).toHaveLength(9);
    expect(html.match(/data-hole="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('animation-delay:-');
  });
  it('shows a lattice and shimmer for a real session, even before its first output', () => {
    const html = draw(Live, { item, facts: { session: { startedAt: Date.now(), helpers: 0 } } });
    expect(html).toContain('live-lattice-cell');
    expect(html).toContain('is-shimmering');
    expect(html).toContain('Thinking');
  });
  for (const [name, facts] of Object.entries({queued: { queued: [item.id], inProgress: true }, paused: { paused: true, inProgress: true }, idle: { inProgress: true }})) {
    it(`keeps ${name} still`, () => {
      const html = draw(Live, { item, facts });
      expect(html).toContain('is-still');
      expect(html).not.toContain('is-shimmering');
    });
  }
  it('does not show working on a finished or stopped task', () => {
    expect(draw(Live, { item: { ...item, status: 'done' }, facts: {} })).toBe('');
    expect(draw(Live, { item, facts: { stalled: true, inProgress: true } })).toBe('');
  });
  it('stops the cell animation for inactive states and reduced motion', () => {
    expect(css).toMatch(/\.live-mark\.is-still \.live-lattice-cell\s*\{[^}]*animation:\s*none/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.live-lattice-cell\s*\{[^}]*animation:\s*none/);
  });
});
