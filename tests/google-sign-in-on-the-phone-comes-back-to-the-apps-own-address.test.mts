// GOOGLE SIGN-IN ON THE PHONE COMES BACK TO THE APP'S OWN ADDRESS.
//
// In Expo Go, Google sign-in ended on http://127.0.0.1, twice, after
// `exp://192.168.68.51:8081/--/signed-in` and then `exp://192.168.68.*:*/--/signed-in`
// were added to the database's allowed return addresses. The app asked to come
// back to Expo Go's own address, which is always the Mac's Wi-Fi address, and the
// database (supabase/auth IsRedirectURLValid) refuses any return address whose
// host is a raw IP other than loopback before it reads the allowed list, then
// falls back to its site_url, the desktop's listener.
//
// Measured on 2026-10-22 against the live database: start Google with a return
// address, fail the callback with that start's state, and read where it sends
// you. The Expo Go address landed on http://127.0.0.1:54783 with the wildcard on
// the list; `agentbox://signed-in` and the phone website came back to themselves.
// The app now always asks for its own address. iOS's sign-in sheet hands back
// any address with the scheme it watches, so that works inside Expo Go too.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import { nameSlug } from '../shared/product-name.mjs';
import { googleReturn } from '../mobile/src/lib/google-return';

const signIn = fs.readFileSync(new URL('../mobile/src/platform/sign-in.ts', import.meta.url), 'utf8');
const appConfig = fs.readFileSync(new URL('../mobile/app.config.ts', import.meta.url), 'utf8');
const hostIsAnIp = (address) => net.isIP(new URL(address).hostname) !== 0;

describe('the address Google comes back to from the phone', () => {
  it('is the app\'s own, the one on the database\'s list', () => {
    expect(googleReturn).toBe(`${nameSlug}://signed-in`);
    expect(appConfig).toMatch(/scheme: nameSlug,/);
  });

  it('never names a network address, which the database refuses whatever its list says', () => {
    expect(hostIsAnIp(googleReturn)).toBe(false);
    expect(hostIsAnIp('exp://192.168.68.51:8081/--/signed-in')).toBe(true);
    expect(hostIsAnIp('https://agentbox-phone.pages.dev/')).toBe(false);
  });

  it('is the one the sign-in sheet waits for, not the address Expo Go was loaded from', () => {
    expect(signIn).toMatch(/openAuthSessionAsync\(await cloud\.googleUrl\(googleReturn\), googleReturn\)/);
    expect(signIn).not.toMatch(/createURL/);
  });
});
