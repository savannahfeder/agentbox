// THE IPHONE APP ASKS ONLY FOR THE PERMISSIONS IT USES.
//
// Reading the generated iPhone project before the first App Store submission
// (2026-11-08, `expo prebuild` in a scratch copy), its Info.plist carried a
// Face ID purpose line, "Allow $(PRODUCT_NAME) to access your Face ID
// biometric data.", which expo-secure-store adds by default. The app never
// asks for Face ID: the keychain holds the sign-in without it. App Review
// questions a purpose line for something an app does not do (5.1.1), so the
// line is switched off, and stays off while nothing asks for Face ID.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const config = fs.readFileSync(path.join(root, 'mobile/app.config.ts'), 'utf8');
const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? sources(p) : /\.(tsx?|mjs)$/.test(e.name) ? [p] : [];
});

describe('Face ID', () => {
  it('has no purpose line in the build', () => {
    expect(config).toMatch(/\['expo-secure-store', \{ faceIDPermission: false \}\]/);
  });
  it('because nothing in the app asks for it', () => {
    const asks = sources(path.join(root, 'mobile/src')).filter((f) => /requireAuthentication|LocalAuthentication/.test(fs.readFileSync(f, 'utf8')));
    expect(asks).toEqual([]);
  });
});

describe('the camera', () => {
  it('is never asked for either', () => {
    expect(config).toMatch(/cameraPermission: false/);
  });
});
