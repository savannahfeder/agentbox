// A CARD OLDER THAN THE CHECKED TIME SAYS ITS OWN.
//
// The Claude Code page prints one checked time, the newest reading's, beside
// Refresh. A card only printed its own time once it was fifteen minutes old,
// so a card fourteen minutes old sat under "Checked just now". Asked for on
// 2026-10-31: late numbers are acceptable, numbers presented as newer than
// they are are not.
//
// The fix: a card whose time reads differently from the page's says its own.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { PlaceTiles } from '../renderer/src/components/Settings';

const now = 10_000_000_000;
const MIN = 60_000;
const limit = (span, percent) => ({ span, qualifier: span === 'week' ? 'all models' : null, name: span, percent, resetsText: null, resetsOn: null, resetsAt: null, zone: null });
const tile = (key, checkedAt) => ({ key, name: `${key}@example.test`, about: [], limits: [limit('session', 5), limit('week', 9)], checkedAt });
const draw = (accounts) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts, now }));
const times = (html) => [...html.matchAll(/<div class="acct-reading-time">([^<]*)<\/div>/g)].map((m) => m[1]);

describe('each card’s own checked time', () => {
  it('the reported case: a card fourteen minutes old under a fresh one says so', () => {
    expect(times(draw([tile('one', now), tile('two', now - 14 * MIN)]))).toEqual(['Checked 14 minutes ago']);
  });

  it('must NOT repeat the page’s own time on cards read with it', () => {
    expect(times(draw([tile('one', now), tile('two', now - 20_000)]))).toEqual([]);
  });

  it('a card fifteen minutes old says its time even when it is the only one', () => {
    expect(times(draw([tile('one', now - 15 * MIN)]))).toEqual(['Checked 15 minutes ago']);
  });
});
