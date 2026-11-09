// SWITCHING ACCOUNTS IS A BUTTON ON THE TILE.
//
// What she said (2026-10-20): "I don't see how to switch accounts on Claude."
// The switch was grey text in the line under the email, the same size and
// colour as a status, so it read as one. The pick was a bordered button
// (designs/w-1e5b38c905/10-switch-c.png), full width under the meters.
//
// 2026-10-21 (w-e74212ce7a): each account became one tile wherever it is
// signed in, and the full-width button left the tile in use with an empty
// band where the other had its button. The button is still a bordered
// button, now in the tile's top right corner; IN USE stays beside the
// address. The line under the name is the plan, and "Ready" is gone from it:
// the meters already say how much room is left.
//
// Later that day: "the switch button looks so wacky. Especially now, it looks
// even weirder with these other tags". The bordered button was taller than
// the address's row and hung off the corner. It is now a small filled button,
// level with the address. It stays a button and not grey text, for the reason
// at the top of this file.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlaceTiles, accountTile, cloudPlaceAccounts } from '../renderer/src/components/Settings';

const limit = (span, percent) => ({ span, qualifier: span === 'week' ? 'all models' : null, name: span, percent, resetsText: null, resetsOn: null, resetsAt: null, zone: null });
const draw = (accounts) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts }));
const here = (extra = {}) => ({ profile: 'default', email: 'one@example.test', plan: 'Max 20x', chosen: false, signedIn: true, trouble: null, dir: null, ...extra });
const account = (extra = {}) => ({ key: 'default', name: 'one@example.test', plan: 'Max 20x', here: here(), cloud: null, limits: [limit('session', 5), limit('week', 9)], checkedAt: null, usageError: null, ...extra });
const acts = (extra = {}) => ({ many: true, now: Date.now(), onUse: vi.fn(), ...extra });

describe('a tile on this computer', () => {
  it('the reported case: the account not in use has a Switch button, the one in use says IN USE by its address', () => {
    const onUse = vi.fn();
    const html = draw([
      accountTile(account({ here: here({ chosen: true }) }), acts()),
      accountTile(account({ key: 'b', name: 'two@example.test', here: here({ profile: 'b', email: 'two@example.test' }) }), acts({ onUse })),
    ]);
    expect(html.match(/acct-switch/g)).toHaveLength(1);
    expect(html).toMatch(/one@example\.test<\/span><span class="set-badge">In use<\/span>/);
    expect(html).toMatch(/two@example\.test<\/span><button type="button" class="acct-switch">Switch<\/button>/);
  });

  it('switching writes the account it is on', () => {
    const onUse = vi.fn();
    accountTile(account({ here: here({ profile: '/h/.claude-2' }) }), acts({ onUse })).use.onUse();
    expect(onUse).toHaveBeenCalledWith('/h/.claude-2');
  });

  it('the one in use has its plan on the next line and no switch', () => {
    const html = draw([accountTile(account({ here: here({ chosen: true }) }), acts())]);
    expect(html).toContain('<div class="acct-tile-about"><span>Max 20x</span></div>');
    expect(html).not.toContain('acct-switch');
  });

  // ONE ACCOUNT IS ALWAYS THE ONE IN USE (w-dac993a554). This read "with none
  // picked, every account runs, so nothing says IN USE and each offers to be
  // the only one", which was the rotation: until somebody picked, the work was
  // shared over every login. The supervisor answers which account runs now, so
  // a tile is either in use or offers the switch, and none of them offers to
  // be the only one.
  it('offers the switch on the account not in use, and never to be the only one', () => {
    const html = draw([accountTile(account(), acts())]);
    expect(html).not.toContain('In use');
    expect(html).not.toContain('Use only this one');
    expect(html).toContain('>Switch</button>');
  });

  it('must NOT offer a switch when there is nothing to switch to', () => {
    expect(accountTile(account({ here: here({ chosen: true }) }), acts({ many: false })).use).toBeNull();
    expect(accountTile(account(), acts({ many: false })).use).toBeNull();
  });
});

describe('the line under the name', () => {
  it('is the plan, and must NOT say Ready', () => {
    expect(accountTile(account(), acts()).about).toEqual([]);
    expect(draw([accountTile(account(), acts())])).not.toContain('Ready');
  });

  // Where it is available, once a cloud is set up: an-account-tile-says-where-it-is-available.
  it('says when the sign-in here is not finished', () => {
    expect(accountTile(account({ here: here({ signedIn: false }) }), acts()).about).toEqual(['Finish signing in to use it']);
  });

  it('trouble here replaces the meters and carries the command that signs it back in', () => {
    const t = accountTile(account({ here: here({ trouble: 'Signed out. Sign in again.', dir: '/h/.claude-2' }) }), acts());
    expect([t.trouble, t.cmd]).toEqual(['Signed out. Sign in again.', 'CLAUDE_CONFIG_DIR=/h/.claude-2 claude']);
    expect(draw([t])).not.toContain('acct-meters');
  });
});

describe('a Codex login in the cloud, still drawn as its own place', () => {
  it('has the plan and state on one line, and no switch: the cloud account is not changed from a tile', () => {
    const [a] = cloudPlaceAccounts({ mode: 'all', accounts: [{ engine: 'codex', key: 'c', name: 'one@example.test', plan: 'Plus', ready: true, state: 'ready', limits: [limit('session', 5)], inUse: true }] }, 'codex', Date.now());
    const html = draw([a]);
    expect(html).toContain('<div class="acct-tile-about"><span>Plus · Ready</span></div>');
    expect(html).not.toContain('acct-switch');
  });
});
