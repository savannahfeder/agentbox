// A NEW ACCOUNT'S EMAIL LINK FROM THE MAC IS NOT SENT BACK TO THE MAC.
//
// Someone made an account by email in the Mac app (2026-11-16), followed the
// link, and Safari said it "can't connect to the server 127.0.0.1": the link
// was http://127.0.0.1:54783/#access_token=…&type=signup. The sign-up named
// the phone website as https://agentbox-phone.pages.dev, with no slash after
// the host. The database allows https://agentbox-phone.pages.dev/** and that
// pattern needs the slash, so it threw the address away and used its default,
// this Mac's sign-in listener, which only runs mid sign-in. Measured on the
// live database with an unsent sign-up link: without the slash the link went
// to http://127.0.0.1:54783, with it to https://agentbox-phone.pages.dev/.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { supabaseSession } from '../main/team/session.mts';

const asked: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); asked.length = 0; });

async function redirectOfASignUpTo(phoneSite: string | undefined) {
  vi.stubGlobal('fetch', async (url: string | URL | Request) => {
    asked.push(String(url instanceof Request ? url.url : url));
    return new Response(JSON.stringify({ id: 'u-1', email: 'new@example.com' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signup-link-'));
  const session = supabaseSession({
    cloudConfig: { url: 'https://cloud.example', anonKey: 'public-key', ...(phoneSite ? { phoneSite } : {}) },
    sessionFile: path.join(dir, 'session.json'),
    openExternal: () => {},
    packaged: false,
    testLogin: undefined,
  });
  expect(await session.signUp!({ email: 'new@example.com', password: 'pw-123456', name: 'Ada' })).toEqual({ confirm: true });
  const signup = asked.find((u) => u.includes('/auth/v1/signup'));
  expect(signup).toBeDefined();
  return new URL(signup!).searchParams.get('redirect_to');
}

describe('the Mac sign-up names the phone website in a form the database accepts', () => {
  it('adds the slash after a bare host, the address that ships', async () => {
    expect(await redirectOfASignUpTo('https://agentbox-phone.pages.dev')).toBe('https://agentbox-phone.pages.dev/');
  });

  it('leaves an address that already ends in a slash as it is', async () => {
    expect(await redirectOfASignUpTo('https://phone.example/')).toBe('https://phone.example/');
  });

  it('leaves an address with a path as it is', async () => {
    expect(await redirectOfASignUpTo('https://phone.example/app')).toBe('https://phone.example/app');
  });

  it('names nothing when the team has no phone website', async () => {
    expect(await redirectOfASignUpTo(undefined)).toBeNull();
  });
});
