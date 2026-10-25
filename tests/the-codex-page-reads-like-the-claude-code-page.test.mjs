// THE CODEX PAGE IS LAID OUT LIKE THE CLAUDE CODE PAGE.
//
// What broke (2026-10-25, a screenshot of Settings › Codex): the Claude Code
// page shows one "Signed in" card, a tile per account with its own meters, and
// the cloud as one switch. The Codex page drew the same facts as four separate
// cards: a Cloud card with its own tile, a Usage card whose meter belonged to
// no named account, a "This computer" list that repeated the cloud's account,
// and above them a status that said "Codex is connected" over a sentence
// saying its sessions die on arrival. Measured by reading the page's source and
// drawing the tiles below.
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { codexAccountsOnce } from '../renderer/src/accounts-once.ts';
import { meterPair } from '../renderer/src/account-words.ts';
import { MiniMeters, connectionState } from '../renderer/src/components/Settings';

const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
const enginePage = settings.slice(settings.indexOf('const enginePage = (engine'), settings.indexOf('<div className="set-nav">'));

const here = (profile, email, extra = {}) => ({ profile, email, plan: 'Plus', chosen: false, signedIn: true, trouble: null, dir: null, ...extra });
const cloudLogin = (key, name, extra = {}) => ({ engine: 'codex', key, name, ready: true, state: 'ready', ...extra });
const month = { span: 'month', qualifier: null, name: 'This month', percent: 27, resetsText: null, resetsOn: null, resetsAt: null, zone: null };

describe('Codex accounts, once each', () => {
  it('her case: the account signed in here and in the cloud is one tile', () => {
    const tiles = codexAccountsOnce({
      here: [here('default', 'work@example.test', { chosen: true, plan: 'Free' }), here('/h/.codex-2', 'home@example.test')],
      cloud: [cloudLogin('c1', 'home@example.test')],
      current: null,
    });
    expect(tiles.map((t) => t.name)).toEqual(['work@example.test', 'home@example.test']);
    expect(tiles[1].cloud?.key).toBe('c1');
  });

  it('must NOT fold a cloud login of a different account into one here', () => {
    const tiles = codexAccountsOnce({
      here: [here('default', 'work@example.test', { chosen: true })],
      cloud: [cloudLogin('c1', 'other@example.test')],
      current: null,
    });
    expect(tiles.map((t) => t.name)).toEqual(['work@example.test', 'other@example.test']);
    expect(tiles[0].cloud).toBe(null);
  });

  it('a cloud login with no email stays its own tile', () => {
    const tiles = codexAccountsOnce({ here: [here('default', null, { signedIn: false })], cloud: [cloudLogin('c1', null)], current: null });
    expect(tiles).toHaveLength(2);
  });

  // Codex reports only under the home it runs in, which is the account in use.
  it('puts the reading on the account in use and on no other', () => {
    const tiles = codexAccountsOnce({
      here: [here('default', 'work@example.test'), here('/h/.codex-2', 'home@example.test', { chosen: true })],
      cloud: [],
      current: { engine: 'codex', limits: [month], at: 5 },
    });
    const byName = Object.fromEntries(tiles.map((t) => [t.name, t]));
    expect(byName['home@example.test'].limits).toEqual([month]);
    expect(byName['home@example.test'].checkedAt).toBe(5);
    expect(byName['work@example.test'].limits).toBe(null);
  });

  it('with nothing picked, the reading is the default login\'s', () => {
    const tiles = codexAccountsOnce({ here: [here('default', 'work@example.test')], cloud: [], current: { engine: 'codex', limits: [month], at: 5 } });
    expect(tiles[0].limits).toEqual([month]);
  });
});

describe('a Codex window that is not a session or a week', () => {
  it('draws a monthly window as a meter rather than "No usage reading yet"', () => {
    expect(meterPair([month])).toEqual([{ key: 'month', word: 'Month', percent: 27, resets: null }]);
    const html = renderToStaticMarkup(React.createElement(MiniMeters, { limits: [month] }));
    expect(html).toContain('27%');
    expect(html).not.toContain('No usage reading yet');
  });

  it('names an odd-length window by its own name', () => {
    expect(meterPair([{ ...month, span: 'window', name: 'These 3 days' }])[0].word).toBe('These 3 days');
  });

  it('must NOT add a meter to a Claude reading', () => {
    const week = (percent, qualifier) => ({ ...month, span: 'week', qualifier, name: 'This week', percent });
    expect(meterPair([week(9, 'all models'), week(40, 'Fable')]).map((m) => m.word)).toEqual(['Week', 'Fable']);
  });
});

describe('the status line', () => {
  it('does not say connected while main says it is not working', () => {
    expect(connectionState({ found: true, certain: true, trouble: 'Codex sessions are dying on arrival.' })).toBe('trouble');
    expect(settings).toContain("trouble: 'Codex is here but not working'");
  });

  it('still says connected when found with nothing wrong', () => {
    expect(connectionState({ found: true, certain: true, trouble: null })).toBe('connected');
  });

  it('a trouble about an engine that is not here changes nothing', () => {
    expect(connectionState({ found: false, certain: true, trouble: 'x' })).toBe('missing');
    expect(connectionState({ found: false, certain: false, trouble: 'x' })).toBe('unsure');
  });
});

describe('the page', () => {
  it('draws both agents\' accounts in the one Signed in card', () => {
    expect(enginePage).toContain('name="Signed in"');
    expect(enginePage).not.toMatch(/engine === 'claude' \? \(\s*<>\s*<Place/);
  });

  it('has no Codex-only usage card, account list or cloud card', () => {
    expect(enginePage).not.toContain('<UsageRows');
    expect(enginePage).not.toContain('<AccountRows');
    expect(enginePage).not.toContain('cloudCard');
    expect(enginePage).not.toContain("'This computer'");
  });
});
