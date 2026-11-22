// A PHONE WHOSE SIGN-IN RUNS OUT SAYS SO, AND NEVER ASKS FOR CONSENT AGAIN.
//
// QA M-54, 2026-11-14: left open for a day on a bad connection, the Android
// app showed "Step 3 of 4 · Where your messages go" for a yes given on
// November 9, then landed on Sign in after a relaunch with nothing said. The
// client drops a session whose renewal is refused; until the next read
// noticed, the app still counted itself signed in with no account, so the
// yes, kept per account, matched nobody and the first run opened the consent
// step. A renewal whose answer is lost (cut off, or the line dropped) also
// left the phone holding a renewal token the cloud had already spent, and a
// spent one asked again later ends the whole sign-in.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudClient } from '../renderer/src/cloud-rest';
import { keptStore } from '../mobile/src/lib/kept';

const CFG = { url: 'https://cloud.example', anonKey: 'public-key' };
const answer = (n: number, expiresIn = 3600) => ({ access_token: `a${n}`, refresh_token: `r${n}`, expires_in: expiresIn, user: { id: 'u-1', email: 'me@example.com' } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function memory() {
  const kept = new Map<string, string>();
  return { kept, getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); }, removeItem: (k: string) => { kept.delete(k); } };
}

describe('a renewal the cloud refuses', () => {
  const refusing = (url: string) => (url.includes('grant_type=refresh_token')
    ? json({ error_description: 'Invalid Refresh Token: Already Used' }, 400)
    : url.includes('grant_type=password') ? json(answer(1, 0)) : json([]));

  it('signs out and says the sign-in ran out, for that email', async () => {
    const storage = memory();
    const client = cloudClient(CFG, { storage, fetchImpl: async (url) => refusing(String(url)) });
    await client.signInWithPassword('me@example.com', 'pw');
    await expect(client.select('t', 'x=1')).rejects.toThrow();
    expect(client.signedIn()).toBe(false);
    expect(client.lapsed()).toBe('me@example.com');
  });

  it('is still said after a relaunch, and a new sign-in clears it', async () => {
    const kept: Record<string, string> = {};
    const persist = { read: async () => ({ ...kept }), write: async (k: string, v: string | null) => { if (v === null) delete kept[k]; else kept[k] = v; } };
    const first = cloudClient(CFG, { storage: await keptStore(persist), fetchImpl: async (url) => refusing(String(url)) });
    await first.signInWithPassword('me@example.com', 'pw');
    await first.select('t', 'x=1').catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    const again = cloudClient(CFG, { storage: await keptStore(persist), fetchImpl: async () => json(answer(2)) });
    expect(again.signedIn()).toBe(false);
    expect(again.lapsed()).toBe('me@example.com');
    await again.signInWithPassword('me@example.com', 'pw');
    expect(again.lapsed()).toBeNull();
  });

  it('is not said when you signed out yourself', async () => {
    const client = cloudClient(CFG, { storage: memory(), fetchImpl: async () => json(answer(1)) });
    await client.signInWithPassword('me@example.com', 'pw');
    client.signOut();
    expect(client.lapsed()).toBeNull();
  });

  it('is not said when the line is down, and you stay signed in', async () => {
    const client = cloudClient(CFG, { storage: memory(), fetchImpl: async (url) => {
      if (String(url).includes('grant_type=password')) return json(answer(1, 0));
      throw new TypeError('Network request failed');
    } });
    await client.signInWithPassword('me@example.com', 'pw');
    await expect(client.select('t', 'x=1')).rejects.toThrow();
    expect(client.signedIn()).toBe(true);
    expect(client.lapsed()).toBeNull();
  });
});

describe('a renewal whose answer never arrives', () => {
  it('is asked again at once with the same token, and the sign-in holds', async () => {
    const renewals: string[] = [];
    const client = cloudClient(CFG, { storage: memory(), fetchImpl: async (url, init) => {
      const u = String(url);
      if (u.includes('grant_type=password')) return json(answer(1, 0));
      if (u.includes('grant_type=refresh_token')) {
        renewals.push(JSON.parse(String(init?.body)).refresh_token);
        if (renewals.length === 1) throw new TypeError('Network request failed');
        return json(answer(2));
      }
      return json([]);
    } });
    await client.signInWithPassword('me@example.com', 'pw');
    await expect(client.select('t', 'x=1')).resolves.toEqual([]);
    expect(renewals).toEqual(['r1', 'r1']);
    expect(client.session()?.refresh_token).toBe('r2');
  });

  it('is asked twice at most', async () => {
    let renewals = 0;
    const client = cloudClient(CFG, { storage: memory(), fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('grant_type=password')) return json(answer(1, 0));
      if (u.includes('grant_type=refresh_token')) { renewals += 1; throw new TypeError('Network request failed'); }
      return json([]);
    } });
    await client.signInWithPassword('me@example.com', 'pw');
    await expect(client.select('t', 'x=1')).rejects.toThrow();
    expect(renewals).toBe(2);
  });
});

describe('the phone', () => {
  const cloud = fs.readFileSync(new URL('../mobile/src/state/cloud.tsx', import.meta.url), 'utf8');
  const signIn = fs.readFileSync(new URL('../mobile/src/app/sign-in.tsx', import.meta.url), 'utf8');
  const persist = fs.readFileSync(new URL('../mobile/src/platform/persist.ts', import.meta.url), 'utf8');

  it('counts itself signed in only while the client holds a session', () => {
    expect(cloud).toMatch(/const live = signedIn && !!cloud\?\.signedIn\(\);/);
    expect(cloud).toMatch(/const me = live \?/);
    expect(cloud).toMatch(/opened, signedIn: live,/);
  });

  it('keeps the note in the keychain with the sign-in, and the sign-in page says it', () => {
    expect(persist).toContain("'agentbox-cloud-lapsed'");
    expect(signIn).toMatch(/c\.cloud\?\.lapsed\(\)/);
  });
});
