// AN ACCOUNT TILE SAYS WHERE IT IS AVAILABLE, AS TAGS, AND OFFERS THE CLOUD WHEN IT IS MISSING THERE.
//
// What was asked (2026-10-21, after the one-tile-per-account design): "there
// is a possibility that we didn't set something up initially ... don't we
// need to reauthenticate for it to work with the cloud? ... I have a
// different set of accounts available locally than in the cloud ... The best
// case would be to show an account and tell you where it's available."
//
// The cloud cannot borrow this computer's login; each account is signed in
// there on its own. The tile named a place only when one was missing, and
// said nothing at all about an account signed in here but not in the cloud.
//
// The first answer put the places in the plan's line as words ("Max 20x ·
// This computer and cloud"), and the reply was: "the cloud and local should
// be more visible as tags rather than just text that people skim over. Maybe
// with little icons". So each place became a small tag with its mark.
//
// Those tags were bordered boxes, and the reply was: "they actually look like
// buttons ... Local and Cloud aren't activated. I have to click those to
// activate them." A place is now said in the label voice IN USE wears, small
// mono capitals with its mark and no box, and the sign-in a place is missing
// is a dotted link after them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceTiles, accountTile } from '../renderer/src/components/Settings';
import { SETUP } from '../renderer/src/cloud-setup.ts';
import { whatTakesEscape } from '../renderer/src/settings-escape.ts';
import { recordCloudLogin } from '../main/cloud/logins.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const here = (extra = {}) => ({ profile: 'default', email: 'work@example.test', plan: 'Max 20x', chosen: true, signedIn: true, trouble: null, dir: null, ...extra });
const cloud = (extra = {}) => ({ engine: 'claude', key: 'acct-1', name: 'work@example.test', ready: true, state: 'ready', ...extra });
const account = (extra = {}) => ({ key: 'default', name: 'work@example.test', plan: 'Max 20x', here: here(), cloud: cloud(), limits: null, checkedAt: null, usageError: null, ...extra });
const acts = (extra = {}) => ({ picked: true, many: true, now: Date.now(), onUse: vi.fn(), cloud: true, onCloudSignIn: vi.fn(), ...extra });
const tags = (t) => [...t.places, ...(t.cloudAct ? [`+${t.cloudAct.word}`] : [])];
const about = (t) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: [t] })).match(/<div class="acct-tile-about">(.*?)<\/div>/)?.[1] ?? '';

describe('where an account is available', () => {
  it('the reported case: signed in here and in the cloud, a tag for each on its one tile', () => {
    const t = accountTile(account(), acts());
    expect(t.about).toEqual([]);
    expect(tags(t)).toEqual(['here', 'cloud']);
  });

  it('here but not in the cloud: one tag, and Add to cloud, which signs in that account there', () => {
    const onCloudSignIn = vi.fn();
    const t = accountTile(account({ cloud: null }), acts({ onCloudSignIn }));
    expect(tags(t)).toEqual(['here', '+Add to cloud']);
    t.cloudAct.onUse();
    expect(onCloudSignIn).toHaveBeenCalledWith(null, 'work@example.test');
  });

  it('in the cloud and nowhere here: the cloud tag alone, with no claim it is nowhere else', () => {
    expect(tags(accountTile(account({ here: null }), acts()))).toEqual(['cloud']);
  });

  it('a cloud sign-in that stopped loses its cloud tag and offers to sign that login in again', () => {
    const onCloudSignIn = vi.fn();
    const t = accountTile(account({ cloud: cloud({ state: 'broken', ready: false }) }), acts({ onCloudSignIn }));
    expect(tags(t)).toEqual(['here', '+Sign in to cloud again']);
    t.cloudAct.onUse();
    expect(onCloudSignIn).toHaveBeenCalledWith('acct-1', 'work@example.test');
  });

  it('must NOT tag a place, or offer the cloud, where no cloud is set up', () => {
    const t = accountTile(account({ cloud: null }), acts({ cloud: false }));
    expect(tags(t)).toEqual([]);
    expect(about(t)).toBe('<span>Max 20x</span>');
  });

  it('must NOT offer the cloud to an account not signed in here yet: that comes first', () => {
    const t = accountTile(account({ cloud: null, here: here({ signedIn: false, email: null }) }), acts());
    expect(t.about).toEqual(['Finish signing in to use it']);
    expect(tags(t)).toEqual([]);
  });
});

describe('the tags, drawn', () => {
  const html = (t) => about(t).replace(/<svg[^>]*>.*?<\/svg>/g, '<svg/>');

  it('a tag is a mark and a word after the plan, Local for this computer and Cloud for the cloud', () => {
    expect(html(accountTile(account(), acts()))).toBe(
      '<span>Max 20x</span><span class="acct-place"><svg/>Local</span><span class="acct-place"><svg/>Cloud</span>',
    );
  });

  it('the sign-in a place is missing is a dotted link after the tags, the cloud screen’s own link', () => {
    expect(html(accountTile(account({ cloud: null }), acts()))).toBe(
      '<span>Max 20x</span><span class="acct-place"><svg/>Local</span><button type="button" class="ps-link acct-cloud-act">Add to cloud</button>',
    );
  });

  it('must NOT draw a place with a border or a fill, the two things that made it read as a button to press', () => {
    const css = fs.readFileSync(new URL('../renderer/src/components/settings.css', import.meta.url), 'utf8');
    const rule = css.match(/\n\.acct-place \{([^}]*)\}/)?.[1];
    expect(rule).toBeTruthy();
    expect(rule).not.toMatch(/border|background/);
    expect(rule).toMatch(/font-family: var\(--mono\)/);
  });

  it('the marks are the ones the thread menu draws for this computer and the cloud', () => {
    const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/import \{[^}]*\bCloudMark\b[^}]*\bMacMark\b[^}]*\} from '\.\.\/threads\/ThreadMenu'/);
  });
});

describe('the cloud’s sign-in, opened from the tile', () => {
  it('names the account to sign in as', () => {
    expect(SETUP.signInHead('claude', 'work@example.test')).toBe('Sign in to work@example.test');
    expect(SETUP.signInHead('claude')).toBe('Sign in to Claude');
    expect(SETUP.signInHead('codex', null)).toBe('Sign in to Codex');
  });

  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

  it('starts the sign-in and opens the cloud screen over Settings', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/onCloudSignIn=\{\(key, email\) => \{[\s\S]{0,200}api\.cloudSignIn\(\{ action: 'start', engine: 'claude', key \}\)[\s\S]{0,200}setCloudSetupOpen\(true\)/);
    expect(app).toMatch(/<CloudSetup[\s\S]{0,200}signInAs=\{cloudSignInAs\}/);
  });

  // The rule moved into ../renderer/src/settings-escape.ts when an open menu
  // joined it there (QA batch 005, F-124); the cloud screen still outranks both.
  it('Escape belongs to the cloud screen while it is over Settings, and must NOT close Settings under it', () => {
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/const takes = whatTakesEscape\(document\);\s*\n\s*if \(takes === 'over'\) return;/);
    expect(whatTakesEscape({ querySelector: (s) => (s === '.ps-over' ? {} : null) })).toBe('over');
  });
});

// A team plan: two people's logins here share one organization, and a cloud
// token says only the organization, so it cannot be pinned on either.
describe('main pairs a cloud login with the login here it is', () => {
  let home;
  beforeEach(() => { home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-pair-'))); });
  afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

  const signIn = (dir, email, org) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: `a-${email}`, organizationUuid: org } }));
  };
  const paired = (profiles) => new Supervisor({ home, storeRoot: home, maxConcurrentSessions: 1, authProfiles: profiles }, { listItems: () => [], listProducts: () => [] }, '/nonexistent-app')
    ._cloudAccounts().map((a) => [a.key, a.profile]);

  it('pairs a login that says its email with that person, even in an organization two people here share', () => {
    const second = path.join(home, '.claude-2');
    signIn(home, 'a@example.test', 'org-team');
    signIn(second, 'b@example.test', 'org-team');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-team', email: 'b@example.test' }, { home, now: 1 });
    expect(paired(['default', second])).toEqual([['acct-1', second]]);
  });

  it('must NOT pair a login that says only an organization two people here share', () => {
    const second = path.join(home, '.claude-2');
    signIn(home, 'a@example.test', 'org-team');
    signIn(second, 'b@example.test', 'org-team');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-team' }, { home, now: 1 });
    expect(paired(['default', second])).toEqual([['acct-1', null]]);
  });

  it('pairs by the one email here in its organization, and not with someone it names who is not signed in here', () => {
    signIn(home, 'a@example.test', 'org-team');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-elsewhere' }, { home, now: 1 });
    recordCloudLogin('claude', 'acct-2', { id: 'id-2', org: 'org-team', email: 'c@example.test' }, { home, now: 2 });
    recordCloudLogin('claude', 'acct-3', { id: 'id-3', org: 'org-team' }, { home, now: 3 });
    recordCloudLogin('claude', 'acct-4', { id: 'id-4' }, { home, now: 4 });
    expect(paired(['default'])).toEqual([['acct-1', null], ['acct-2', null], ['acct-3', 'default'], ['acct-4', null]]);
  });
});
