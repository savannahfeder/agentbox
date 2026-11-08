// A PASSWORD RESET LINK WORKS AFTER THE PHONE APP RESTARTS.
//
// The sign-in client marks that this phone asked for a reset
// (`agentbox-cloud-reset` in renderer/src/cloud-rest.ts), and the email's link
// is honoured only with that mark. The phone wrote the mark to its keychain but
// read back only the keys listed in platform/persist.ts, which left it out. So
// if iOS ended the app while you were in Mail, which it often does, the link
// opened the inbox instead of asking for a new password. Codex found it reading
// the app as an App Store reviewer on 2026-11-08. Now every key the sign-in
// client keeps is read back at launch.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudClient } from '../renderer/src/cloud-rest';
import { keptStore } from '../mobile/src/lib/kept';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const keysOfClient = [...read('renderer/src/cloud-rest.ts').matchAll(/^const \w+_KEY = '([^']+)';/gm)].map((m) => m[1]);
const persist = read('mobile/src/platform/persist.ts');
const keptList = persist.match(/const KEYS = \[([^\]]*)\]/)[1];

// A keychain that, like the phone's, gives back only the keys asked for.
function keychain(asked) {
  const kept = {};
  return {
    kept,
    read: async () => Object.fromEntries(asked.filter((k) => k in kept).map((k) => [k, kept[k]])),
    write: async (k, v) => { if (v === null) delete kept[k]; else kept[k] = v; },
  };
}
const CFG = { url: 'https://abc.supabase.co', anonKey: 'anon' };
const fetchImpl = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });

describe('what the phone reads back at launch', () => {
  it('the sign-in client keeps the session, the proof and the reset mark', () => {
    expect(keysOfClient).toEqual(expect.arrayContaining(['agentbox-cloud-session', 'agentbox-cloud-verifier', 'agentbox-cloud-reset']));
  });
  it('lists every one of them', () => {
    for (const k of keysOfClient) expect(keptList).toContain(`'${k}'`);
  });
});

describe('a reset asked for, then the app ended', () => {
  it('is still asked for when it opens again', async () => {
    const asked = [...keptList.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const chain = keychain(asked);
    const storage = await keptStore(chain);
    storage.setItem('agentbox-cloud-reset', String(Date.now()));
    await new Promise((r) => setTimeout(r, 0));
    const again = cloudClient(CFG, { storage: await keptStore(chain), fetchImpl });
    expect(again.resetAsked()).toBe(true);
  });
  it('a key the phone does not list is not read back, which is how the mark was lost', async () => {
    const chain = keychain(['agentbox-cloud-session', 'agentbox-cloud-verifier']);
    const storage = await keptStore(chain);
    storage.setItem('agentbox-cloud-reset', String(Date.now()));
    await new Promise((r) => setTimeout(r, 0));
    expect(cloudClient(CFG, { storage: await keptStore(chain), fetchImpl }).resetAsked()).toBe(false);
  });
});
