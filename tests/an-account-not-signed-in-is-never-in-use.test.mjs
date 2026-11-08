// AN ACCOUNT NOT SIGNED IN IS NEVER IN USE.
//
// QA batch 013 (F-201): on a fresh home signed in to Claude Code only,
// Settings › Codex drew one tile reading "Not signed in · Finish signing in to
// use it" with an IN USE badge beside it. The supervisor always names one
// Codex login as the one that runs, signed in or not, and the tile drew that
// as In use. Measured by rendering the tile for a login with chosen: true and
// signedIn: false: the markup carried the In use badge.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlaceTiles, accountTile } from '../renderer/src/components/Settings';

const draw = (accounts) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts }));
const here = (extra = {}) => ({ profile: 'default', email: null, plan: null, chosen: true, signedIn: false, trouble: null, dir: null, ...extra });
const account = (extra = {}) => ({ key: 'default', name: 'Not signed in', plan: null, here: here(), cloud: null, limits: null, checkedAt: null, usageError: null, ...extra });
const acts = (extra = {}) => ({ many: false, now: Date.now(), onUse: vi.fn(), ...extra });

describe('a login that is not signed in', () => {
  it('the reported case: the chosen login, not signed in, asks to finish signing in and is not In use', () => {
    const tile = accountTile(account(), acts());
    expect(tile.inUse).toBe(false);
    const html = draw([tile]);
    expect(html).toContain('Finish signing in to use it');
    expect(html).not.toContain('In use');
  });

  it('draws no empty usage meters, since nothing can run on it', () => {
    expect(accountTile(account(), acts()).meters).toBe(false);
  });

  it('a signed-in chosen login is still In use', () => {
    const tile = accountTile(account({ name: 'one@example.test', here: here({ signedIn: true, email: 'one@example.test' }) }), acts());
    expect(tile.inUse).toBe(true);
    expect(draw([tile])).toContain('In use');
  });

  it('beside a signed-in login, the unsigned chosen one is not In use and the signed-in one offers the switch', () => {
    const tiles = [
      accountTile(account(), acts({ many: true })),
      accountTile(account({ key: 'b', name: 'two@example.test', here: here({ profile: 'b', email: 'two@example.test', signedIn: true, chosen: false }) }), acts({ many: true })),
    ];
    const html = draw(tiles);
    expect(html).not.toContain('In use');
    expect(html.match(/acct-switch/g)).toHaveLength(1);
  });
});
