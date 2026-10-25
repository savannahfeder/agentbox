// THE PHONE HAS ONE WAY IN, THROUGH THE CLOUD (2026-10-16).
//
// Settings › Phone showed two QR codes: the hosted phone site (read and reply
// with the computer closed) and, under "Straight to this computer, without
// signing in", a code for a door this computer opened itself, reached over the
// same Wi-Fi, Tailscale or the Cloudflare relay. Asked: "Why are there two QRs?
// Should only ever be one way to access mobile: through the Cloud ... the
// cloudflare relay was temporary to test the idea." Scanning that second code
// also got stuck (a phone that had held an older key never took the new one).
// Now the computer opens no door for phones and Settings draws only the site.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the computer', () => {
  const main = read('main/main.mjs');

  it('opens no door of its own for phones, and no link to the relay', () => {
    expect(main).not.toMatch(/createPhoneLink|phone-link\.mjs/);
    expect(main).not.toMatch(/relayAddress|relay-address\.mjs|relay-client/);
    expect(main).not.toMatch(/'zero:phone-link'/);
  });

  it('still does what the phone leaves in the cloud, through the window\'s own handlers', () => {
    expect(main).toMatch(/phoneApply = applyThrough\(phoneChannels\)/);
  });
});

describe('Settings › Phone', () => {
  const settings = read('renderer/src/components/Settings.tsx');
  const page = settings.slice(settings.indexOf('function PhonePage('), settings.indexOf('const Page = '));

  it('draws the phone site and nothing that reaches this computer directly', () => {
    expect(page).toMatch(/<MacShutGroup macShut=\{macShut\} \/>/);
    for (const gone of ['Straight to this computer', 'Let phones connect', 'Reach it over', 'Reset key', 'Connected devices', 'api.phoneLink']) {
      expect(settings).not.toContain(gone);
    }
  });

  it('without an account says to sign in, rather than offering another way', () => {
    expect(page).toMatch(/Sign in to use your phone/);
  });
});
