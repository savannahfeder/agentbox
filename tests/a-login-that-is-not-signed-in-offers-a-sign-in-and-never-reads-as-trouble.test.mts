// A LOGIN THAT IS NOT SIGNED IN OFFERS A SIGN-IN AND NEVER READS AS TROUBLE.
//
// What broke (onboarding call, 2026-11-23): a new person on his own Mac read
// "Finish signing in to use it" in Settings and thought his account had been
// flagged. Measured on a throwaway copy with Codex on the disk and nobody
// signed in to it: Settings › Codex drew a tile "Not signed in · Finish signing
// in to use it" under the heading "Signed in", with nothing to press, about a
// sign-in nobody had started. A Codex login that uses an API key drew the same
// two lines, though it is signed in.
//
// The tile now says only what is true and carries the button that signs in.
// "Signed out" is kept for an account that was signed in before.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { readSettings } from '../main/settings.mts';
import { forgetDiscovery } from '../main/account-discovery.mts';
import { codexLoginMode } from '../main/codex-account.mts';
import { accountsOnce, codexAccountsOnce } from '../renderer/src/accounts-once';
import { PlaceTiles, WebAccounts, accountTile, accountsHeading } from '../renderer/src/components/Settings';

const OLD = 'Finish signing in to use it';
const here = (extra: object = {}) => ({ profile: 'default', email: null, plan: null, chosen: true, signedIn: false, trouble: null, dir: null, ...extra });
const signIn = (extra: object = {}) => ({ phase: null, error: null, onStart: vi.fn(), onAgain: vi.fn(), ...extra });
const tileOf = (login: object, { engine = 'codex' as 'claude' | 'codex', ...opts }: { engine?: 'claude' | 'codex'; signIn?: ReturnType<typeof signIn> | null } = {}) => {
  const [one] = engine === 'codex' ? codexAccountsOnce({ here: [here(login)] as never }) : accountsOnce({ here: [here(login)] as never });
  return accountTile(one, { many: false, now: Date.now(), onUse: vi.fn(), engine, signIn: signIn(), ...opts });
};
const draw = (tile: ReturnType<typeof tileOf>) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: [tile] }));

describe('a login nobody has signed in to', () => {
  it('the reported case: says Not signed in, offers Sign in, and says nothing about finishing', () => {
    const tile = tileOf({});
    const html = draw(tile);
    expect(html).toContain('Not signed in');
    expect(html).not.toContain(OLD);
    expect(tile.about).toEqual([]);
    expect(tile.signIn?.word).toBe('Sign in');
    expect(html).toMatch(/<button[^>]*acct-switch[^>]*>Sign in<\/button>/);
    expect(tile.trouble).toBeNull();
    expect(html).not.toContain('trouble');
  });

  it('the press starts the sign-in', () => {
    const acts = signIn();
    tileOf({}, { signIn: acts }).signIn!.onUse();
    expect(acts.onStart).toHaveBeenCalledOnce();
  });

  it('is the same on the Claude Code page', () => {
    const tile = tileOf({}, { engine: 'claude' });
    expect(tile.signIn?.word).toBe('Sign in');
    expect(draw(tile)).not.toContain(OLD);
  });

  it('a login in another folder gets no button, since the app signs in the first login only', () => {
    const tile = tileOf({ profile: '/home/someone/.codex-2', chosen: false });
    expect(tile.signIn).toBeNull();
    expect(draw(tile)).not.toContain(OLD);
  });

  it('a page with no way to start a sign-in draws no button', () => {
    expect(tileOf({}, { signIn: null }).signIn).toBeNull();
  });
});

describe('while the sign-in waits on the browser', () => {
  it('says so and offers the page again', () => {
    const acts = signIn({ phase: 'signing-in' });
    const tile = tileOf({}, { signIn: acts });
    expect(tile.about).toEqual(['Finish in your browser']);
    expect(tile.signIn?.word).toBe('Open the page again');
    tile.signIn!.onUse();
    expect(acts.onAgain).toHaveBeenCalledOnce();
    expect(acts.onStart).not.toHaveBeenCalled();
  });

  it('offers nothing to press during the moment before the page opens', () => {
    const tile = tileOf({}, { signIn: signIn({ phase: 'checking' }) });
    expect(tile.signIn).toBeNull();
    expect(tile.about).toEqual(['Signing in…']);
  });

  it('a sign-in that stopped says why and offers Sign in again', () => {
    const tile = tileOf({}, { signIn: signIn({ phase: 'failed', error: 'The sign-in was closed before it finished.' }) });
    expect(tile.signIn?.word).toBe('Sign in');
    expect(draw(tile)).toContain('The sign-in was closed before it finished.');
  });
});

describe('an account that was signed in before', () => {
  it('names the account, says Signed out, and offers Sign in again', () => {
    const tile = tileOf({ email: 'one@example.test' }, { engine: 'claude' });
    const html = draw(tile);
    expect(html).toContain('one@example.test');
    expect(tile.about).toEqual(['Signed out']);
    expect(tile.signIn?.word).toBe('Sign in again');
    expect(html).not.toContain(OLD);
  });

  it('with a run\'s own sentence about it, keeps that sentence and adds neither a second line nor a button', () => {
    const note = 'Signed out. Open Claude in a terminal and type /login.';
    const tile = tileOf({ email: 'one@example.test', trouble: note }, { engine: 'claude' });
    expect(tile.about).toEqual([]);
    expect(tile.signIn).toBeNull();
    expect(draw(tile)).toContain(note);
  });
});

describe('a login that is signed in', () => {
  it('is never offered a sign-in or called signed out', () => {
    const tile = tileOf({ email: 'one@example.test', signedIn: true }, { engine: 'claude' });
    expect(tile.signIn).toBeNull();
    const html = draw(tile);
    expect(html).not.toContain('Signed out');
    expect(html).not.toContain('>Sign in');
    expect(html).toContain('In use');
  });
});

describe('a Codex login that uses an API key', () => {
  const homes: string[] = [];
  afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });

  /** The Codex row Settings reads off a home whose Codex folder holds this login file, or none. */
  const rowFor = (auth: object | null) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-key-'));
    homes.push(home);
    const codexHome = path.join(home, '.codex');
    fs.mkdirSync(codexHome);
    if (auth) fs.writeFileSync(path.join(codexHome, 'auth.json'), JSON.stringify(auth));
    forgetDiscovery();
    const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
    const config = { home, storeRoot: home, accountRoot: home, appDir: home, claudeBin: '/nonexistent/claude', codexBin: '/nonexistent/codex', codexHome, maxConcurrentSessions: 3, authProfiles: ['default'], sessionArgs: [] };
    const sup = new Supervisor(config as never, store as never, home);
    return { codexHome, row: readSettings({ config, supervisor: sup, store } as never, { search: false }).workspace.codex!.accounts![0] };
  };

  it('the computer says it holds a key, and still that no plan is signed in', () => {
    const { codexHome, row } = rowFor({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-not-a-key' });
    expect(codexLoginMode(codexHome)).toBe('apikey');
    expect(row).toMatchObject({ signedIn: false, apiKey: true });
  });

  it('a folder with no login, or a ChatGPT login, is not called a key', () => {
    expect(rowFor(null).row).toMatchObject({ signedIn: false, apiKey: false });
    const claims = Buffer.from(JSON.stringify({ email: 'a@example.test' })).toString('base64url');
    expect(rowFor({ auth_mode: 'chatgpt', tokens: { id_token: `h.${claims}.s` } }).row).toMatchObject({ signedIn: true, apiKey: false });
  });

  it('is named for what it is, with the command that signs in to a plan, and is not called Not signed in', () => {
    const tile = tileOf({ apiKey: true });
    const html = draw(tile);
    expect(html).toContain('API key');
    expect(html).not.toContain('Not signed in');
    expect(html).not.toContain(OLD);
    expect(tile.about).toEqual(['Run codex login to use your ChatGPT plan']);
    expect(tile.cmd).toBe('codex login');
    expect(html).toContain('codex login');
    // The app's own sign-in would find it signed in and open nothing.
    expect(tile.signIn).toBeNull();
    expect(tile.inUse).toBe(false);
  });
});

describe('the heading over the tiles', () => {
  const one = (login: object) => accountsOnce({ here: [here(login)] as never });
  it('says Signed in only when some login is', () => {
    expect(accountsHeading(one({}))).toBe('Account');
    expect(accountsHeading(one({ email: 'one@example.test', signedIn: true }))).toBe('Signed in');
    expect(accountsHeading([...one({}), ...one({ email: 'one@example.test', signedIn: true })])).toBe('Signed in');
  });
});

describe('the web app and the phone, which cannot sign a computer in', () => {
  it('the web app says where to sign in', () => {
    const list = [{ id: 'default', email: null, plan: null, chosen: true, signedIn: false }];
    const html = renderToStaticMarkup(React.createElement(WebAccounts, { engine: 'codex', list, reading: { value: null } as never, refusedAsk: null, onUse: vi.fn() }));
    expect(html).toContain('Sign in on your computer to use it');
    expect(html).not.toContain(OLD);
  });

  it('no screen says the old words', () => {
    const text = (file: string) => fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8');
    for (const file of ['renderer/src/components/Settings.tsx', 'mobile/src/ui/SettingsPages.tsx']) {
      expect(text(file).includes(OLD), file).toBe(false);
    }
    expect(text('mobile/src/ui/SettingsPages.tsx').includes('Sign in on your computer to use it')).toBe(true);
  });
});
