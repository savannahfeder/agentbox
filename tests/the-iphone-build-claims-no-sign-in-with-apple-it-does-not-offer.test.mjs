// THE IPHONE BUILD CLAIMS NO SIGN IN WITH APPLE IT DOES NOT OFFER (2026-11-08).
//
// Sign in with Apple came off the sign-in screen on 2026-11-04 (8f06d530), but
// mobile/app.config.ts still asked for its capability (usesAppleSignIn and the
// expo-apple-authentication plugin). A mock App Review reviewer reading the
// store build flagged the mismatch: an entitlement for a sign-in nobody can
// reach. Nothing in mobile/src imports it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../mobile/', import.meta.url);
const config = fs.readFileSync(new URL('app.config.ts', root), 'utf8');
const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

describe('the iPhone build', () => {
  it('nothing in the app uses Sign in with Apple', () => {
    for (const f of sources(new URL('src/', root).pathname)) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/expo-apple-authentication/);
  });
  it('so its config asks for no Sign in with Apple capability', () => {
    expect(config).not.toMatch(/usesAppleSignIn/);
    expect(config).not.toMatch(/'expo-apple-authentication'/);
  });
});
