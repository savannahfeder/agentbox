// THE WAY BACK FROM STRIPE OPENS THE MAC APP.
//
// A tester paid for Cloud Pro and pressed "Back to Agentbox" on Stripe's last
// page, and nothing happened. The button is a link on the app's own scheme,
// and main.mts asks macOS to hand that scheme to the app with
// setAsDefaultProtocolClient. On macOS that call only works for a scheme the
// app's Info.plist declares (CFBundleURLTypes), and package.json's build block
// declared none, so the call did nothing and so did every link on the scheme,
// room invites included. electron-builder writes CFBundleURLTypes from
// `build.protocols`; this holds that it is there, names the scheme the links
// use, and is carried from the name module like every other name field.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { JOIN_SCHEME } from '../shared/room-links.mjs';
import { NAME, WAS_SLUGS } from '../shared/product-name.mjs';
import { drift, expected } from '../scripts/product-name.mjs';
import { paidPage } from '../cloud/gateway/gateway.mjs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const claimed = () => [pkg.build.protocols ?? []].flat().flatMap((p) => p.schemes ?? []);

describe('the Mac app declares the scheme its links use', () => {
  it('build.protocols names the scheme', () => {
    expect(claimed()).toContain(JOIN_SCHEME);
  });

  it('under the app name, the way macOS lists it', () => {
    expect([pkg.build.protocols].flat()[0].name).toBe(NAME);
  });

  it('is the scheme Stripe\'s last page links to', () => {
    const href = /href="([a-z0-9+.-]+):\/\//.exec(paidPage(new URLSearchParams('plan=pro')))?.[1];
    expect(href).toBe(JOIN_SCHEME);
    expect(claimed()).toContain(href);
  });

  it('claims nothing else: not a web scheme, not a name the app used to have', () => {
    expect(claimed()).toEqual([JOIN_SCHEME]);
    for (const old of WAS_SLUGS) expect(claimed()).not.toContain(old);
  });
});

describe('the scheme is carried from the name module, not typed', () => {
  it('is one of the fields the name script owns', () => {
    expect(expected().some(([keys]) => keys.join('.') === 'build.protocols')).toBe(true);
  });

  it('and package.json agrees with it', () => {
    expect(drift(pkg)).toEqual([]);
  });

  it('a package.json without it is drift', () => {
    const without = structuredClone(pkg);
    delete without.build.protocols;
    expect(drift(without).map(([where]) => where)).toContain('build.protocols');
  });

  it('and one claiming another scheme is drift too', () => {
    const other = structuredClone(pkg);
    other.build.protocols = [{ name: NAME, schemes: ['something-else'] }];
    expect(drift(other).map(([where]) => where)).toContain('build.protocols');
  });
});
