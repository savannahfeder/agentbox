// A CLOUD ACCOUNT TILE SAYS ITS PLAN, AS THIS COMPUTER'S TILES DO.
//
// What she asked (2026-10-20): "The cloud ones don't tell me as much
// information as this computer. For instance it doesn't tell me the Max 20x
// plan. These cards should be very similar to each other, almost one-to-one."
// A cloud login only says its organization, and it was already named by the
// folder here signed into that organization; its plan now comes from the same
// folder, and the tile draws it where this computer's tiles do.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordCloudLogin } from '../main/cloud/logins.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { PlaceTiles, accountTile } from '../renderer/src/components/Settings';
import { accountsOnce } from '../renderer/src/accounts-once.ts';

let home;
beforeEach(() => { home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-plan-'))); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const signIn = (file, email, org, tier) => fs.writeFileSync(file, JSON.stringify({ oauthAccount: {
  emailAddress: email, accountUuid: `a-${org}`, organizationUuid: org, organizationRateLimitTier: tier, billingType: 'stripe_subscription',
} }));
const supervisor = (profiles) => new Supervisor({ home, storeRoot: home, maxConcurrentSessions: 1, authProfiles: profiles }, { listItems: () => [], listProducts: () => [] }, '/nonexistent-app');

describe('a Claude login in the cloud', () => {
  it('her case: a login in the organization of a Max 20x folder here says Max 20x', () => {
    signIn(path.join(home, '.claude.json'), 'work@example.test', 'org-w', 'default_claude_max_20x');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-w', limits: [{ span: 'session', percent: 49, resetsAt: null }] }, { home });
    const [one] = supervisor(['default'])._cloudAccounts();
    expect(one).toMatchObject({ name: 'work@example.test', plan: 'Max 20x' });
    // Drawn as an account signed in only there, so the plan can only have come from the cloud's login.
    const tiles = accountsOnce({ here: [], cloud: [one] }).map((a) => accountTile(a, { picked: false, many: false, now: Date.now(), onUse: () => {}, cloud: true }));
    expect(renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: tiles }))).toContain('<div class="acct-tile-about"><span>Max 20x</span><span class="acct-place">');
  });

  it('each login takes its own folder’s plan', () => {
    signIn(path.join(home, '.claude.json'), 'work@example.test', 'org-w', 'default_claude_max_20x');
    fs.mkdirSync(path.join(home, '.claude-2'));
    signIn(path.join(home, '.claude-2', '.claude.json'), 'me@example.test', 'org-p', 'default_claude_max_5x');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-w' }, { home, now: 1 });
    recordCloudLogin('claude', 'acct-2', { id: 'id-2', org: 'org-p' }, { home, now: 2 });
    const plans = supervisor(['default', path.join(home, '.claude-2')])._cloudAccounts().map((a) => [a.name, a.plan]);
    expect(plans).toEqual([['work@example.test', 'Max 20x'], ['me@example.test', 'Max 5x']]);
  });

  it('must NOT guess a plan for a login whose organization has no folder here', () => {
    signIn(path.join(home, '.claude.json'), 'work@example.test', 'org-w', 'default_claude_max_20x');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-elsewhere' }, { home });
    const [one] = supervisor(['default'])._cloudAccounts();
    expect(one.plan).toBeNull();
    const tiles = accountsOnce({ here: [], cloud: [one] }).map((a) => accountTile(a, { picked: false, many: false, now: Date.now(), onUse: () => {}, cloud: true }));
    expect(renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: tiles }))).toContain('<div class="acct-tile-about"><span class="acct-place">');
  });
});
