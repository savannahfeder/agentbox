// THE WEB APP ON A PHONE OFFERS ALERTS, AND TURNS THEM ON.
//
// What broke (2026-10-27): the founder wants the launch video to show the
// phone getting alerts, and asked for instructions on adding the web app to
// the home screen, which iPhones require before a web app may alert. The web
// app answered "unsupported" (renderer/src/phone-alerts.ts only spoke to a
// computer serving the page) and its site carried no alert worker. Now the
// web app keeps its own subscription and signing keys, hands them to every
// computer of the account as a setting, says how to add it to the home screen
// in its bar and on Settings › Account, and the site carries the worker.
// Measured on the pieces with a stand-in for the cloud client.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { cloudAlertsVia } from '../renderer/src/cloud-alerts';
import { ALERTS_SAY } from '../renderer/src/phone-alerts';
import { checkSetting } from '../shared/phone-settings.mjs';
import { WEB_ALERTS_KEY, WEB_ALERTS_TEST_KEY } from '../shared/web-alerts.mjs';
import { buildPhoneSite } from '../scripts/build-phone-site.mjs';

const A = '0a1b2c3d4e5f';
const B = 'a1b2c3d4e5f6';
const SUB = { endpoint: 'https://web.push.apple.com/QH4bAbCdEfGh0123456789', keys: { p256dh: crypto.createECDH('prime256v1').generateKeys().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };

function world(computers = [A]) {
  const kept = new Map();
  const sent = [];
  const via = cloudAlertsVia({
    computers: () => computers,
    send: async (cmd) => { sent.push(cmd); },
    storage: { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)), removeItem: (k) => kept.delete(k) },
    subtle: crypto.webcrypto.subtle,
  });
  return { via, sent, kept, computers };
}

describe('the web app\'s side of alerts', () => {
  it('makes its signing key once and keeps it', async () => {
    const w = world();
    const key = await w.via.key();
    expect(Buffer.from(key, 'base64url')).toHaveLength(65);
    expect(await w.via.key()).toBe(key);
  });

  it('hands its subscription to every computer, as a setting each one takes', async () => {
    const w = world([A, B]);
    const key = await w.via.key();
    await w.via.subscribe(SUB);
    expect(w.sent.map((c) => c.device)).toEqual([A, B]);
    for (const c of w.sent) {
      expect(c).toMatchObject({ project: null, item: null, kind: 'setting', payload: { scope: 'workspace', key: WEB_ALERTS_KEY } });
      expect(c.payload.value).toMatchObject({ on: true, endpoint: SUB.endpoint, keys: SUB.keys, vapid: { publicKey: key } });
      expect(checkSetting(c.payload)).toBeNull();
    }
    expect(await w.via.on()).toBe(true);
  });

  it('hands it to a computer that connects later, once', async () => {
    const w = world([A]);
    await w.via.key();
    await w.via.subscribe(SUB);
    w.computers.push(B);
    await w.via.catchUp();
    await w.via.catchUp();
    expect(w.sent.map((c) => c.device)).toEqual([A, B]);
  });

  it('turns off on every computer, and asks the newest one for a test', async () => {
    const w = world([A, B]);
    await w.via.key();
    await w.via.subscribe(SUB);
    expect(await w.via.test()).toBe(true);
    const test = w.sent.at(-1);
    expect(test).toMatchObject({ device: A, payload: { key: WEB_ALERTS_TEST_KEY, value: { endpoint: SUB.endpoint } } });
    expect(checkSetting(test.payload)).toBeNull();
    await w.via.unsubscribe();
    expect(w.sent.slice(-2).map((c) => [c.device, c.payload.value])).toEqual([[A, { on: false, endpoint: SUB.endpoint }], [B, { on: false, endpoint: SUB.endpoint }]]);
    expect(await w.via.on()).toBe(false);
  });

  it('with no computer yet, says so rather than pretending', async () => {
    const w = world([]);
    await w.via.key();
    await expect(w.via.subscribe(SUB)).rejects.toThrow(/computer/);
  });
});

describe('what it says', () => {
  it('tells a phone in Safari how to add it to the home screen', () => {
    expect(ALERTS_SAY['needs-home-screen']).toMatch(/Share/);
    expect(ALERTS_SAY['needs-home-screen']).toMatch(/Add to Home Screen/);
    expect(ALERTS_SAY['needs-home-screen']).toMatch(/home screen/);
  });
  it('is on Settings › Account, and the bar offers it only on a phone-sized screen', () => {
    const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/<WebAlertsGroup \/>/);
    expect(read('renderer/src/components/WebAlerts.tsx')).toContain('Alerts on this phone');
    expect(read('renderer/src/phone-alerts.ts')).toMatch(/if \(!phoneSized\(\)\) return;/);
    const bridge = read('renderer/src/cloud-bridge.ts');
    expect(bridge).toMatch(/startPhoneAlerts\(alertsVia,/);
    expect(bridge).toMatch(/badge: async \(count: unknown\) => \{ setIconCount\(/);
  });
  // The bar hangs off the body, outside the app that sets --phone-tabs, so it
  // sat over the bottom tabs; and it shared the foot with an agent's question.
  // The tabs moved to the top on 2026-10-28, so it is told there are none.
  it('the bar is told where the tabs are and waits while an agent asks something', () => {
    const css = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
    expect(css).toMatch(/:has\(\.app\.workspace-layout\) #phone-alerts-ask \{ --phone-tabs: 0px; \}/);
    expect(css).toMatch(/body:has\(\.approvals\) #phone-alerts-ask \{ display: none; \}/);
  });
});

describe('the site', () => {
  it('carries the alert worker, with the app\'s name in it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-sw-'));
    const dist = path.join(dir, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
    const configFile = path.join(dir, 'team.config.json');
    fs.writeFileSync(configFile, JSON.stringify({ url: 'https://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890' }));
    const icon = path.join(dir, 'icon.png');
    fs.writeFileSync(icon, 'png');
    const out = path.join(dir, 'out');
    buildPhoneSite({ dist, out, configFile, icon, log: () => {} });
    const sw = fs.readFileSync(path.join(out, 'phone-sw.js'), 'utf8');
    expect(sw).toContain("addEventListener('push'");
    expect(sw).not.toContain('__APP_NAME__');
    expect(sw).toContain("|| 'Agentbox'");
  });
});
