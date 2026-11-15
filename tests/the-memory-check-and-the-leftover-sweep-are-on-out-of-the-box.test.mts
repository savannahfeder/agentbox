// THE MEMORY CHECK AND THE LEFTOVER SWEEP ARE ON OUT OF THE BOX (w-54c640f8da).
//
// "Hold heavy work when memory is short" and "Stop programs agents leave
// behind" were both off until somebody found them on Settings > Running, so a
// new install ran with neither. Measured before the change: loadConfig on an
// empty zero.config.json answered `memoryGate: false` and
// `cleanupLeftovers: false`. Both can still be turned off, and an install whose
// file says off stays off.
//
// The row below them read "Copies of a project made by hand": a sentence about
// git worktrees Agentbox did not make, with nothing on it to do. Its reader
// could not place it, and the row is gone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../main/config.mts';
import { memoryGateSettings, leftoverSettings } from '../main/settings.mts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const supervisor = { memoryGateStatus: () => null, leftoverStatus: () => null, startHoldStatus: () => null };

function load(onDisk) {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'on-by-default-'));
  if (onDisk) fs.writeFileSync(path.join(appDir, 'zero.config.json'), JSON.stringify(onDisk));
  return loadConfig(appDir, { home: appDir });
}

describe('a computer nobody has changed a setting on', () => {
  for (const [name, onDisk] of [['no config file', null], ['an empty config file', {}], ['a file with other settings', { adhdMode: true }]]) {
    it(`holds heavy work and stops leftovers, with ${name}`, () => {
      const config = load(onDisk);
      expect(config.memoryGate).toBe(true);
      expect(config.cleanupLeftovers).toBe(true);
      expect(memoryGateSettings({ config, supervisor }).on).toBe(true);
      expect(leftoverSettings({ config, supervisor }).on).toBe(true);
    });
  }
});

describe('somebody who turned them off', () => {
  it('keeps each one off on its own', () => {
    const gateOff = load({ memoryGate: false });
    expect(gateOff.memoryGate).toBe(false);
    expect(gateOff.cleanupLeftovers).toBe(true);
    const sweepOff = load({ cleanupLeftovers: false });
    expect(sweepOff.memoryGate).toBe(true);
    expect(sweepOff.cleanupLeftovers).toBe(false);
  });
});

describe('the Running page', () => {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

  it('has no row about worktrees the app did not make', () => {
    expect(read('renderer/src/components/Settings.tsx')).not.toMatch(/strayFolders|made by hand|Worktrees \$\{NAME\}/);
    expect(read('main/settings.mts')).not.toMatch(/strayFolders/);
  });

  it('keeps the switches either side of where it was', () => {
    const page = read('renderer/src/components/Settings.tsx');
    expect(page).toMatch(/label="Stop programs agents leave behind"/);
    expect(page).toMatch(/label="Something felt slow"/);
  });
});
