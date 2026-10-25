// STRIPE OPENS IN THE BROWSER, THE WAY OTHER DESKTOP APPS PAY.
//
// Paying for a cloud plan opened Stripe's hosted checkout in a sheet on the
// app's window. Drawn at full window size it was a white page dropped over
// the dark app, cut off at the bottom, with no Apple Pay (Apple offers it
// only in Safari). The owner (w-2c627fdea8, 2026-10-23): "this looks a little
// wild. we basically want to do what other desktop apps do". Desktop apps
// open checkout in the browser and pick the plan up when the payment lands.
// So: the browser again; the setup screen stays on the plan cards, the chosen
// card says Stripe is open and offers it again; the plan is read again every
// few seconds and whenever the window comes back to the front; and Stripe's
// last page names the plan and has a button back into the app.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { paidPage } from '../cloud/gateway/gateway.mjs';
import { ourLink, JOIN_SCHEME } from '../shared/room-links.mjs';
import { CloudPlanCards } from '../renderer/src/components/CloudPlanCards.tsx';
import { SETUP } from '../renderer/src/cloud-setup.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const exists = (p) => fs.existsSync(new URL(`../${p}`, import.meta.url));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the app hands Stripe to the browser', () => {
  const ipc = read('main/ipc.mjs');
  it('paying and the billing page both open with the browser', () => {
    expect(ipc).toMatch(/cloudCall\('payForCloud', \{ plan \}\)/);
    expect(ipc).toMatch(/cloudCall\('openCloudBilling'\)/);
    expect(ipc).toMatch(/openExternal: \(u\) => shell\.openExternal\(u\)/);
  });
  it('and no window of its own is opened for Stripe', () => {
    expect(exists('main/cloud/stripe-window.mjs')).toBe(false);
    expect(ipc).not.toContain('openStripeSheet');
  });
});

describe('the plan cards while Stripe is open', () => {
  const draw = (props) => renderToStaticMarkup(React.createElement(CloudPlanCards, { plan: { signedIn: true, plan: 'none' }, onChoose: () => {}, ...props }));
  it('the chosen card offers Stripe again, and is the one marked', () => {
    const html = draw({ waiting: 'plus' });
    expect(text(html)).toMatch(/Choose Pro.*Open Stripe again.*Choose Max/);
    expect((html.match(/class="cloud-plan waiting"/g) || []).length).toBe(1);
  });
  it('the other two can still be chosen', () => {
    expect((draw({ waiting: 'plus' }).match(/disabled=""/g) || []).length).toBe(0);
  });
  it('while the checkout is being made, every button holds and the chosen one says so', () => {
    const html = draw({ opening: 'max' });
    expect(text(html)).toContain('Opening Stripe…');
    expect((html.match(/disabled=""/g) || []).length).toBe(3);
  });
  it('with nothing open, every card just offers itself', () => {
    const html = draw({});
    expect(text(html)).not.toMatch(/Open Stripe again|Opening Stripe/);
    expect(html).not.toContain('waiting');
  });
});

describe('the setup screen waits for the payment', () => {
  const setup = read('renderer/src/components/CloudSetup.tsx');
  it('says where to finish, in one plain line', () => {
    expect(SETUP.payWaitLede).toBe('Finish paying in your browser. This moves on by itself once you’ve paid.');
    expect(SETUP.payWaitLede).not.toMatch(/[:;—]/);
    expect(setup).toContain('SETUP.payWaitLede');
  });
  it('reads the plan again on a timer and when the window comes back to the front', () => {
    expect(setup).toMatch(/step === 'pay' && waiting\s*\?\s*setInterval\([\s\S]{0,120}void read\(\)/);
    expect(setup).toMatch(/until = Date\.now\(\) \+ 10 \* 60_000/);
    expect(setup).toMatch(/addEventListener\('focus', read\)/);
  });
  it('Settings reads it again when the window comes back too', () => {
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/addEventListener\('focus', [a-zA-Z]+\)/);
  });
});

describe("Stripe's last page", () => {
  const page = (q) => paidPage(new URLSearchParams(q));
  it('names the plan that was paid for, and goes back to the app', () => {
    const html = page('plan=pro');
    expect(text(html)).toContain('You’re on Agentbox Cloud Pro');
    expect(html).toContain(`href="${JOIN_SCHEME}://cloud"`);
  });
  it('says nothing was charged when checkout was cancelled', () => {
    const html = page('cancelled=1');
    expect(text(html)).toContain('Nothing was charged');
    expect(html).toContain(`href="${JOIN_SCHEME}://cloud"`);
  });
  it('after the billing page, only offers the way back', () => {
    const html = page('billing=1');
    expect(text(html)).not.toMatch(/You’re on|Nothing was charged/);
    expect(html).toContain(`href="${JOIN_SCHEME}://cloud"`);
  });
  it('names only a plan the server sells, never what the address says', () => {
    expect(text(page('plan=gold'))).toContain('You’re on Agentbox Cloud');
    expect(text(page('plan=gold'))).not.toContain('gold');
    expect(page('plan=%3Cscript%3Ealert(1)%3C%2Fscript%3E')).not.toContain('<script>');
    expect(page('plan=none')).not.toMatch(/Cloud None|Cloud none/);
  });
  // The checkout's return address carries the plan: tests/a-mac-opens-stripe-to-pay-for-a-cloud-plan.
});

describe('a link back into the app', () => {
  it('is any link on the app\'s own scheme', () => {
    expect(ourLink(`${JOIN_SCHEME}://cloud`)).toBe(true);
    expect(ourLink(`${JOIN_SCHEME}://join/abcdefghijklmnop`)).toBe(true);
  });
  it('and nothing else', () => {
    expect(ourLink('https://agentbox.ac/cloud')).toBe(false);
    expect(ourLink(`not${JOIN_SCHEME}://cloud`)).toBe(false);
    expect(ourLink(`${JOIN_SCHEME}x://cloud`)).toBe(false);
    expect(ourLink('')).toBe(false);
    expect(ourLink(undefined)).toBe(false);
  });
  it('brings the window to the front when it opens the app', () => {
    const main = read('main/main.mjs');
    expect(main).toMatch(/app\.on\('open-url', \(e, url\) => \{[^}]*ourLink\(url\)[^}]*showWindow\(\)/);
  });
});
