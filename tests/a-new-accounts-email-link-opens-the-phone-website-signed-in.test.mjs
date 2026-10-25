// A NEW ACCOUNT'S EMAIL LINK OPENS THE PHONE WEBSITE, SIGNED IN.
//
// Making an account on the phone app sent an email whose link ended on "This
// site can't be reached". No sign-up named where the link should go, so the
// account database sent it to its own default, http://127.0.0.1:54783
// (cloud/supabase/config.toml `site_url`): the desktop's sign-in listener,
// which exists only on the Mac and only mid sign-in. Reported from a phone on
// 2026-10-21. Every team sign-up now names the phone website, the one public
// page that is already on the database's list of return addresses, and the
// website takes the link's sign-in when it opens, or says why the link failed.
// The desktop asks for the plain kind of link, not its usual one-time proof,
// which only the Mac that asked could have finished.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudClient } from '../renderer/src/cloud-rest';

const CFG = { url: 'https://cloud.example', anonKey: 'public-key' };
const SITE = 'https://phone.example/';
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const tokenAnswer = { access_token: 'a2', refresh_token: 'r2', expires_in: 3600, user: { id: 'u-9', email: 'new@example.com' } };

function recording(answer = { id: 'u-9' }, status = 200) {
  const asked = [];
  const fetchImpl = async (url, init) => { asked.push({ url, body: init.body ? JSON.parse(init.body) : null }); return new Response(JSON.stringify(answer), { status }); };
  return { asked, fetchImpl };
}

describe('a sign-up names where its email link goes', () => {
  it('sends the link to the address it is given', async () => {
    const { asked, fetchImpl } = recording();
    const client = cloudClient(CFG, { storage: store(), fetchImpl });
    expect(await client.signUp('Ada', 'new@example.com', 'pw-123456', SITE)).toEqual({ confirm: true });
    expect(asked[0].url).toBe(`https://cloud.example/auth/v1/signup?redirect_to=${encodeURIComponent(SITE)}`);
    expect(asked[0].body).toEqual({ email: 'new@example.com', password: 'pw-123456', data: { full_name: 'Ada' } });
  });

  it('names nothing when it has no address, as before', async () => {
    const { asked, fetchImpl } = recording();
    const client = cloudClient(CFG, { storage: store(), fetchImpl });
    await client.signUp('Ada', 'new@example.com', 'pw-123456');
    expect(asked[0].url).toBe('https://cloud.example/auth/v1/signup');
  });
});

describe('the website opened from that link', () => {
  it('signs in with the link, trading its renewal token for a whole sign-in', async () => {
    const { asked, fetchImpl } = recording(tokenAnswer);
    const client = cloudClient(CFG, { storage: store(), fetchImpl });
    const s = await client.finishEmailLink('#access_token=a1&expires_in=3600&refresh_token=r1&token_type=bearer&type=signup');
    expect(asked).toEqual([{ url: 'https://cloud.example/auth/v1/token?grant_type=refresh_token', body: { refresh_token: 'r1' } }]);
    expect(s?.user.id).toBe('u-9');
    expect(client.signedIn()).toBe(true);
  });

  it('says why when the link has run out, and stays signed out', async () => {
    const { asked, fetchImpl } = recording();
    const client = cloudClient(CFG, { storage: store(), fetchImpl });
    await expect(client.finishEmailLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'))
      .rejects.toThrow('Email link is invalid or has expired');
    expect(asked).toEqual([]);
    expect(client.signedIn()).toBe(false);
  });

  it('leaves an address with no sign-in in it alone', async () => {
    const { asked, fetchImpl } = recording();
    const client = cloudClient(CFG, { storage: store(), fetchImpl });
    expect(await client.finishEmailLink('')).toBeNull();
    expect(await client.finishEmailLink('#threads')).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe('every team sign-up names the phone website', () => {
  it('the website names its own address and takes the link when it opens', () => {
    const bridge = fs.readFileSync('renderer/src/cloud-bridge.ts', 'utf8');
    expect(bridge).toMatch(/client\.signUp\(name, email, password, `\$\{location\.origin\}\$\{location\.pathname\}`\)/);
    expect(bridge).toMatch(/client\.finishEmailLink\(/);
  });

  it('the phone app names the website its settings carry', () => {
    expect(fs.readFileSync('mobile/app.config.ts', 'utf8')).toMatch(/phoneSite/);
    expect(fs.readFileSync('mobile/src/app/sign-in.tsx', 'utf8')).toMatch(/signUp\(name\.trim\(\), email\.trim\(\), password, phoneSite\)/);
  });

  it('the desktop names the website its team settings carry', () => {
    expect(fs.readFileSync('main/team/session.mjs', 'utf8')).toMatch(/emailRedirectTo: typeof cloudConfig\.phoneSite === 'string' \? cloudConfig\.phoneSite : undefined/);
  });

  // The desktop's client signs in with a one-time proof (PKCE), whose link
  // comes back as a code only the Mac that asked can spend; the website would
  // say "started somewhere else" over an account that had just been confirmed.
  it("the desktop's sign-up asks for a link the website can finish", () => {
    const src = fs.readFileSync('main/team/session.mjs', 'utf8');
    const signUp = src.slice(src.indexOf('async signUp({ email, password, name })'), src.indexOf('cancelSignIn'));
    expect(signUp).toMatch(/flowType: 'implicit'/);
    expect(signUp).toMatch(/persistSession: false/);
    expect(signUp).toMatch(/const c = await getClient\(\);\n\s+const \{ error: kept \} = await c\.auth\.setSession\(data\.session\)/);
  });
});
