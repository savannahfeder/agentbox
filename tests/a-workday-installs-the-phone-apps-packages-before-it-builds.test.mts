// A WORKDAY INSTALLS THE PHONE APP'S PACKAGES BEFORE IT BUILDS (r-00a452c588).
//
// The 2026-11-02 workday died in its first minute: mobile/package.json had
// gained expo-image on 2026-10-31, the app folder's mobile/node_modules never
// got it, and `expo export` stopped on "Unable to resolve module expo-image".
// The build ran with its output thrown away, so workday.log said only
// "Command failed". workday.mjs now names the packages that are missing,
// installs them with `npm ci` before building, and puts the build's own error
// in the log when it fails.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { missingPackages } from '../.claude/skills/product-loop/scripts/workday.mjs';

function app({ dependencies = {}, devDependencies = {} }, installed = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workday-packages-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies, devDependencies }));
  for (const name of installed) {
    fs.mkdirSync(path.join(dir, 'node_modules', name), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', name, 'package.json'), '{}');
  }
  return dir;
}

describe('which of the phone app\'s packages are not installed', () => {
  it('names a dependency that package.json lists and node_modules lacks', () => {
    const dir = app({ dependencies: { expo: '1', 'expo-image': '1' } }, ['expo']);
    expect(missingPackages(dir)).toEqual(['expo-image']);
  });

  it('names a missing dev dependency and a missing scoped one', () => {
    const dir = app({ dependencies: { '@expo/vector-icons': '1' }, devDependencies: { typescript: '1' } }, []);
    expect(missingPackages(dir)).toEqual(['@expo/vector-icons', 'typescript']);
  });

  it('names nothing when every package is installed', () => {
    const dir = app({ dependencies: { expo: '1', '@expo/vector-icons': '1' } }, ['expo', '@expo/vector-icons']);
    expect(missingPackages(dir)).toEqual([]);
  });

  it('names every package when node_modules is not there at all', () => {
    const dir = app({ dependencies: { expo: '1' } });
    expect(missingPackages(dir)).toEqual(['expo']);
  });
});
