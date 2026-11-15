// THE PHONE APP LEAVES ITS ALERT ADDRESS FOR YOUR COMPUTERS, AND TAKES IT BACK.
//
// Turning alerts on got the phone an Expo push token and kept it in the
// screen's own state (2026-10-23): nothing else ever had it, so no computer
// could alert the phone, and it was gone when the app closed. Now turning
// alerts on writes the token to push_devices as yourself, the phone
// remembers that alerts are on, renews the row when the app opens (and drops
// it when alerts were turned off in iOS Settings), and takes it back when you
// turn alerts off or sign out. Deleting the account takes it with the
// account (tests/your-phones-alert-address-is-yours-alone-and-goes-with-your-account).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudClient } from '../renderer/src/cloud-rest';
import { ALERTS_KEY, EXPO_TOKEN, readAlerts, leaveAddress, takeAddressBack } from '../mobile/src/lib/push-device';
import { previewCloud } from '../mobile/src/lib/preview';

const read = (p) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');
const TOKEN = 'ExponentPushToken[abcdefghij0123456789AB]';
const NOW = Date.parse('2026-10-23T12:00:00Z');
const session = { access_token: 't', refresh_token: 'r', expires_at: NOW + 3600_000, user: { id: 'p-me', email: 'me@example.com' } };

function cloud() {
  const m = new Map([['agentbox-cloud-session', JSON.stringify(session)]]);
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const asked = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    asked.push({ method: init.method ?? 'GET', path: u.pathname, search: decodeURIComponent(u.search), prefer: init.headers?.prefer ?? '', body: init.body ? JSON.parse(init.body) : null });
    return new Response('[]', { status: 200 });
  };
  return { asked, c: cloudClient({ url: 'https://cloud.example', anonKey: 'k' }, { storage, fetchImpl, now: () => NOW }) };
}

describe('turning alerts on', () => {
  it('leaves this phone\'s token as yourself, once per phone, its moment brought up to date', async () => {
    const { c, asked } = cloud();
    await leaveAddress(c, { token: TOKEN, platform: 'ios', appVersion: '0.1.0', now: NOW });
    expect(asked).toHaveLength(1);
    const [a] = asked;
    expect([a.method, a.path, a.search]).toEqual(['POST', '/rest/v1/push_devices', '?on_conflict=owner,token']);
    expect(a.prefer).toContain('resolution=merge-duplicates');
    // The owner is the database's to fill (auth.uid()), never the phone's to claim.
    expect(a.body).toEqual({ token: TOKEN, platform: 'ios', app_version: '0.1.0', updated_at: new Date(NOW).toISOString() });
  });

  it('never sends what is not a token Expo gave', async () => {
    const { c, asked } = cloud();
    for (const bad of ['', 'abc', 'ExponentPushToken[]', 'ExponentPushToken[has space here!]']) {
      await expect(leaveAddress(c, { token: bad, platform: 'ios', appVersion: '0.1.0', now: NOW })).rejects.toThrow();
    }
    await expect(leaveAddress(c, { token: TOKEN, platform: 'web', appVersion: '0.1.0', now: NOW })).rejects.toThrow();
    expect(asked).toEqual([]);
    expect(EXPO_TOKEN.test(TOKEN)).toBe(true);
  });
});

describe('turning alerts off, or signing out', () => {
  it('takes this phone\'s token back, and only it', async () => {
    const { c, asked } = cloud();
    await takeAddressBack(c, TOKEN);
    expect(asked.map((a) => [a.method, a.path, a.search])).toEqual([['DELETE', '/rest/v1/push_devices', `?token=eq.${TOKEN}`]]);
  });
});

describe('what the phone remembers', () => {
  it('reads the token it left and when, and nothing else', () => {
    expect(readAlerts(JSON.stringify({ token: TOKEN, at: NOW }))).toEqual({ token: TOKEN, at: NOW });
    expect(readAlerts(null)).toBeNull();
    expect(readAlerts('not json')).toBeNull();
    expect(readAlerts(JSON.stringify({ token: 'abc', at: NOW }))).toBeNull();
    expect(readAlerts(JSON.stringify({ token: TOKEN }))).toBeNull();
  });

  it('is kept in the phone\'s keychain with the sign-in', () => {
    expect(ALERTS_KEY).toBe('agentbox-alerts');
    expect(read('platform/persist.ts')).toMatch(/const KEYS = \[[^\]]*ALERTS_KEY[^\]]*\]/);
  });
});

describe('the app', () => {
  const state = read('state/cloud.tsx');

  it('turning alerts on gets the token, leaves it, then remembers it', () => {
    expect(state).toMatch(/const token = await alertToken\(\);\s*await leaveAddress\(cloud, \{ token, platform: Platform\.OS, appVersion: APP_VERSION, now: Date\.now\(\) \}\);/);
    expect(state).toMatch(/persist\.write\(ALERTS_KEY, JSON\.stringify\(kept\)\)/);
  });

  it('on opening, renews the row while alerts are allowed, and drops it when they are not', () => {
    expect(state).toMatch(/await alertTokenIfAllowed\(\)/);
    expect(state).toMatch(/if \(!token\) return forget\(\);/);
    expect(state).toMatch(/AppState\.addEventListener\('change', \(s\) => \{ if \(s === 'active'\) void renew\(\); \}\)/);
  });

  it('signing out takes the token back before the sign-in goes, and never signs out a later sign-in', () => {
    expect(state).toMatch(/takeAddressBack\(c, token\)/);
    expect(state).toMatch(/if \(c\.generation\(\) === asked\) c\.signOut\(\);/);
  });

  it('the icon counts what needs you while the app is open', () => {
    expect(state).toMatch(/setIconCount\(tabs\.inbox\.length\)/);
  });

  it('Settings turns alerts on and off, and still sends a test', () => {
    const pages = read('ui/SettingsPages.tsx');
    expect(pages).toMatch(/turnOnAlerts\(\)/);
    expect(pages).toMatch(/turnOffAlerts\(\)/);
    expect(pages).toMatch(/Send a test alert/);
  });

  it('the preview\'s stand-in takes the same calls', async () => {
    const c = previewCloud(() => NOW);
    await expect(leaveAddress(c, { token: TOKEN, platform: 'ios', appVersion: '0.1.0', now: NOW })).resolves.toBeUndefined();
    await expect(takeAddressBack(c, TOKEN)).resolves.toBeUndefined();
  });
});
