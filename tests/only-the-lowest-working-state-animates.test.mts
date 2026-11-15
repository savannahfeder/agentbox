// 2026-09-19: the lattice proposal drew TWO animated working states per task.
// the founder approved lattice + shimmer with ONE instance, at the
// conversation foot. The header must remain plain text before, during and
// after a run.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Byline } from '../renderer/src/components/Byline';
import { Live } from '../renderer/src/components/Live';
globalThis.React = React;
const item = { id: 'w-single', status: 'open', kind: 'directive', title: 'Task', createdAt: Date.now(), updatedAt: Date.now(), wrote: {} };
const draw = (Component, facts) => renderToStaticMarkup(React.createElement(Component, { item, facts }));
describe('only the lowest working state animates', () => {
  for (const helpers of [0, 1, 4]) {
    it(`shows one lattice and one shimmer at the foot with ${helpers} subagents`, () => {
      const facts = { inProgress: true, session: { itemId: item.id, startedAt: Date.now(), helpers } };
      const header = draw(Byline, facts), foot = draw(Live, facts);
      expect(header).toContain('Working');
      expect(header).not.toContain('live-mark');
      expect(header).not.toContain('is-shimmering');
      expect(foot.match(/class="live-mark /g)).toHaveLength(1);
      expect((header + foot).match(/is-shimmering/g)).toHaveLength(1);
    });
  }
  for (const [state, facts] of Object.entries({ queued: { inProgress: true, queued: [item.id] }, paused: { inProgress: true, paused: true }, idle: { inProgress: true }, finished: {}, stopped: { inProgress: true, stalled: true } })) {
    it(`never animates the header or foot when ${state}`, () => {
      const header = draw(Byline, facts), foot = draw(Live, facts);
      expect(header).not.toContain('live-mark');
      expect(header + foot).not.toContain('is-shimmering');
      expect(foot).not.toContain('class="live-mark "');
    });
  }
});
