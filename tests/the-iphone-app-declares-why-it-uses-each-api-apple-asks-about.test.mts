// THE IPHONE APP DECLARES WHY IT USES EACH API APPLE ASKS ABOUT.
//
// Greenlight, an offline App Store pre-review scanner, run on mobile/ on
// 2026-11-08, called the missing privacy manifest the one thing that would get
// the app rejected (ITMS-91061). React Native's pod install does merge the
// packages' own manifests on Expo's build machines, but Expo's guide
// (docs.expo.dev/guides/apple-privacy) says Apple does not read every manifest
// a static pod carries and to repeat the reasons in the app config. So the
// app's own manifest names every required-reason API its packages declare,
// with their reasons, and says it tracks nobody.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const configText = fs.readFileSync(path.join(root, 'mobile/app.config.ts'), 'utf8');

// What the packages in mobile/node_modules declare, when they are installed.
function declaredByPackages() {
  const dir = path.join(root, 'mobile/node_modules');
  if (!fs.existsSync(dir)) return null;
  const files = execFileSync('find', [dir, '-name', 'PrivacyInfo.xcprivacy', '-not', '-path', '*/Example/*'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const out = {};
  for (const f of files) {
    const xml = fs.readFileSync(f, 'utf8');
    for (const m of xml.matchAll(/<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/g)) {
      out[m[1]] ??= new Set();
      for (const r of m[2].matchAll(/<string>([^<]+)<\/string>/g)) out[m[1]].add(r[1]);
    }
  }
  return out;
}

const DECLARED = {
  NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
  NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
  NSPrivacyAccessedAPICategoryFileTimestamp: ['0A2A.1', '3B52.1', 'C617.1'],
  NSPrivacyAccessedAPICategoryDiskSpace: ['85F4.1', 'E174.1'],
};

describe('the app config', () => {
  it('declares each API with its reasons', () => {
    for (const [type, reasons] of Object.entries(DECLARED)) {
      const entry = configText.match(new RegExp(`NSPrivacyAccessedAPIType: '${type}', NSPrivacyAccessedAPITypeReasons: \\[([^\\]]*)\\]`));
      expect(entry, type).not.toBeNull();
      for (const r of reasons) expect(entry[1]).toContain(`'${r}'`);
    }
  });
  it('says it tracks nobody', () => {
    expect(configText).toMatch(/NSPrivacyTracking: false/);
  });
});

describe('the packages', () => {
  it('declare nothing the app config leaves out', () => {
    const found = declaredByPackages();
    if (!found) return; // mobile/ not installed here; GitHub installs it
    for (const [type, reasons] of Object.entries(found)) {
      expect(Object.keys(DECLARED), `a package now uses ${type}`).toContain(type);
      for (const r of reasons) expect(DECLARED[type], `${type} gained the reason ${r}`).toContain(r);
    }
  });
});
