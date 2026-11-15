// SETTINGS › PHONE LEADS TO THE IPHONE APP (2026-11-15).
//
// The iPhone app went on the App Store on 2026-11-11, but Settings › Phone
// only drew a QR code for the phone website, and only once you were signed in.
// Asked before the launch post: "If we go into Settings under, let's say,
// Phone, it should probably bring you to where you can download the mobile
// app." Measured by rendering the page signed in and signed out: neither named
// the App Store. Now both lead with the app's QR code and its App Store link,
// and the website is the line for phones without the app.
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IPHONE_APP_URL } from '../shared/phone-app.mts';
import { PhonePage } from '../renderer/src/components/Settings';

const eas = JSON.parse(fs.readFileSync(new URL('../mobile/eas.json', import.meta.url), 'utf8'));
const draw = (props) => renderToStaticMarkup(React.createElement(PhonePage, props));
const macShut = (over = {}) => ({ site: null, siteQr: null, all: true, projects: [], onChoose: () => {}, email: 'me@example.test', sentAt: 1, ...over });

describe('the App Store link', () => {
  it('is the app the phone build submits to', () => {
    expect(IPHONE_APP_URL).toBe(`https://apps.apple.com/app/id${eas.submit.production.ios.ascAppId}`);
  });
});

describe('Settings › Phone', () => {
  it('signed in, it leads with the iPhone app and says which account to sign in with', () => {
    const page = draw({ macShut: macShut() });
    expect(page).toContain(`href="${IPHONE_APP_URL}"`);
    expect(page.indexOf(IPHONE_APP_URL)).toBeLessThan(page.indexOf('Projects on your phone'));
    expect(page).toContain('me@example.test');
  });

  it('signed out, it still offers the app, beside the way to sign in', () => {
    const page = draw({ onSignIn: () => {} });
    expect(page).toContain(`href="${IPHONE_APP_URL}"`);
    expect(page).toContain('Sign in to use your phone');
  });

  it('names the phone website only as the way in for other phones, and only when there is one', () => {
    const withSite = draw({ macShut: macShut({ site: 'https://phone.example.test', siteQr: '<svg/>' }) });
    expect(withSite).toContain('phone.example.test');
    expect(withSite).not.toContain('QR code that opens phone.example.test');
    expect(draw({ macShut: macShut() })).not.toContain('On Android');
  });

  it('must NOT offer the App Store inside the web app, which is already on the phone', () => {
    const page = draw({ web: { email: 'me@example.test', seenAt: 0, cloud: true, onSignOut: () => {} } });
    expect(page).not.toContain(IPHONE_APP_URL);
  });
});
