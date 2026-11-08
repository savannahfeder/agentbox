// A PHONE BUILD WHOSE FRAMEWORKS DO NOT FIT TOGETHER STOPS BEFORE TESTFLIGHT.
//
// What broke (w-a68a52a026): every iPhone build from 11 (Oct 31) to 15 (Nov 7)
// died at launch, before any of our code ran. The crash log said dyld could not
// find `AnyModule._classTypes` in ExpoModulesCore, referenced from ExpoImage.
// Both ship ready-made: expo-image 58.0.18 was compiled against
// expo-modules-core 58.0.28, and the lock held 58.0.24. Measured with llvm-nm
// on the two prebuilt binaries: ExpoImage needed two core symbols the 58.0.24
// core does not define; with 58.0.30 every prebuilt framework finds all it
// needs. Two days of fixes went to guesses because nobody read the crash log.
// The build now checks this itself on Expo's machine, after npm install.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gaps } from '../mobile/scripts/check-prebuilt-frameworks.mjs';

const MISSING = '_$s15ExpoModulesCore9AnyModulePAAE11_classTypesSayAA12SharedObjectCmGvgZ';
const fw = (name, defined, needs) => ({ name, defined: new Set(defined), needs: new Set(needs) });

describe('frameworks checked against each other', () => {
  it('names the symbol the crash log named, and who needs it from whom', () => {
    const out = gaps([
      fw('ExpoModulesCore', ['_$s15ExpoModulesCore6ModuleC'], []),
      fw('ExpoImage', [], ['_$s15ExpoModulesCore6ModuleC', MISSING]),
    ]);
    expect(out).toEqual([{ framework: 'ExpoImage', from: 'ExpoModulesCore', missing: [MISSING] }]);
  });

  it('finds nothing when every needed symbol is defined', () => {
    expect(gaps([
      fw('ExpoModulesCore', ['_$s15ExpoModulesCore6ModuleC', MISSING], []),
      fw('ExpoImage', [], ['_$s15ExpoModulesCore6ModuleC', MISSING]),
    ])).toEqual([]);
  });

  it('leaves alone what comes from a framework that is built from source', () => {
    expect(gaps([fw('ExpoImage', [], ['_$s13SDWebImageKit3FooV', '_$s15ExpoModulesJSI3BarV'])])).toEqual([]);
  });

  it('does not mistake a module whose name starts the same for another', () => {
    expect(gaps([
      fw('ExpoModulesCore', [], []),
      fw('ExpoVideo', [], ['_$s23ExpoModulesCoreWorklets3BazV']),
    ])).toEqual([]);
  });
});

describe('the phone app', () => {
  const mobile = path.join(import.meta.dirname, '..', 'mobile');

  it('runs the check on Expo’s build machine after installing its packages', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(mobile, 'package.json'), 'utf8'));
    expect(pkg.scripts['eas-build-post-install']).toBe('node scripts/check-prebuilt-frameworks.mjs');
  });

  it('carries a core at least as new as the one its picture framework was built against', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(mobile, 'package-lock.json'), 'utf8')).packages;
    const [, , patch] = lock['node_modules/expo-modules-core'].version.split('.').map(Number);
    expect(lock['node_modules/expo-image'].version).toBe('58.0.18');
    expect(patch).toBeGreaterThanOrEqual(28);
  });
});
