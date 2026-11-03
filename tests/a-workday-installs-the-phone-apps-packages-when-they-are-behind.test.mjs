// A WORKDAY INSTALLS THE PHONE APP'S PACKAGES WHEN THEY ARE BEHIND (w-e4d49a1539).
//
// The first daily run on 2026-11-02 started its workday from the app folder,
// which had just been fast-forwarded to main. The preview build died in under
// a second: main had added expo-image on 10-31 (mobile/package-lock.json) and
// the folder's packages were installed on 10-28. The log said only "Command
// failed: npx expo export", because the build's output was thrown away. The
// workday now installs when the lock is newer than what is installed, and a
// build that fails says why.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packagesAreBehind, whyTheBuildFailed } from '../.claude/skills/product-loop/scripts/workday.mjs';

function mobile({ lockAt, installedAt }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workday-mobile-'));
  if (lockAt) {
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    fs.utimesSync(path.join(dir, 'package-lock.json'), lockAt, lockAt);
  }
  if (installedAt) {
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'node_modules', '.package-lock.json'), '{}');
    fs.utimesSync(path.join(dir, 'node_modules', '.package-lock.json'), installedAt, installedAt);
  }
  return dir;
}

const oct28 = new Date('2026-10-28T14:13:00Z');
const oct31 = new Date('2026-10-31T18:17:00Z');

describe('whether the phone app needs an install before it builds', () => {
  it('yes when the lock changed after the last install, as on 2026-11-02', () => {
    expect(packagesAreBehind(mobile({ lockAt: oct31, installedAt: oct28 }))).toBe(true);
  });

  it('yes when nothing was ever installed', () => {
    expect(packagesAreBehind(mobile({ lockAt: oct31 }))).toBe(true);
  });

  it('no when the install came after the lock', () => {
    expect(packagesAreBehind(mobile({ lockAt: oct28, installedAt: oct31 }))).toBe(false);
  });

  it('no when the two were written in the same second', () => {
    expect(packagesAreBehind(mobile({ lockAt: oct31, installedAt: oct31 }))).toBe(false);
  });

  it('no when there is no lock to install from', () => {
    expect(packagesAreBehind(mobile({ installedAt: oct28 }))).toBe(false);
  });
});

describe('a build that fails', () => {
  it('says what the build printed, not only that it failed', () => {
    const err = Object.assign(new Error('Command failed: npx expo export'), {
      stdout: 'Starting Metro Bundler\n', stderr: 'Error: Unable to resolve module expo-image from src/app/file.tsx\n',
    });
    const why = whyTheBuildFailed(err);
    expect(why).toContain('Unable to resolve module expo-image');
    expect(why).toContain('did not build');
  });

  it('keeps the end of a long build log, where the error is', () => {
    const err = Object.assign(new Error('Command failed'), { stdout: `${'bundling\n'.repeat(5000)}Error: the real reason\n`, stderr: '' });
    const why = whyTheBuildFailed(err);
    expect(why).toContain('the real reason');
    expect(why.length).toBeLessThan(5000);
  });

  it('still says something when the build printed nothing', () => {
    expect(whyTheBuildFailed(new Error('spawn npx ENOENT'))).toContain('spawn npx ENOENT');
  });
});
