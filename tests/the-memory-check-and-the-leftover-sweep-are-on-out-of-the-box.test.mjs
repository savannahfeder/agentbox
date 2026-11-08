// THE MEMORY CHECK AND THE LEFTOVER SWEEP ARE ON OUT OF THE BOX (w-54c640f8da).
//
// "Hold heavy work when memory is short" and "Stop programs agents leave
// behind" were both off until somebody found them on Settings > Running, so a
// new install ran with neither. Measured before the change: loadConfig on an
// empty zero.config.json answered `memoryGate: false` and
// `cleanupLeftovers: false`. Both can still be turned off, and an install whose
// file says off stays off.
//
// The row below them read "Copies of a project made by hand", which the person
// it is for could not place. They are git worktrees of a project that Agentbox
// did not make, so the row says that.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../main/config.mjs';
import { memoryGateSettings, leftoverSettings, strayFolderSettings } from '../main/settings.mts';
import { NAME } from '../shared/product-name.mjs';

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

describe('the row about worktrees the app did not make', () => {
  const page = (strays) => strayFolderSettings({ supervisor: { strayFolders: () => strays } }, '/Users/you');
  const settings = fs.readFileSync(path.join(root, 'renderer/src/components/Settings.tsx'), 'utf8');

  it('is labelled by what the folders are', () => {
    expect(settings).not.toMatch(/made by hand/);
    expect(settings).toMatch(/label=\{`Worktrees \$\{NAME\} didn’t make`\}/);
  });

  it('says what they are, that they use disk, and what to do', () => {
    const out = page(Array.from({ length: 11 }, (_, i) => ({ path: `/Users/you/Desktop/dev/kestrel-${i}`, project: 'Kestrel' })));
    expect(out.now).toBe(
      `11 worktrees of Kestrel are using disk space, among them ~/Desktop/dev/kestrel-0 and ~/Desktop/dev/kestrel-1. ${NAME} never deletes a worktree it didn’t make, so delete the ones you’re done with.`,
    );
  });

  it('reads right for one', () => {
    const out = page([{ path: '/Users/you/Desktop/dev/website-fontsize', project: 'Website' }]);
    expect(out.now).toBe(
      `1 worktree of Website is using disk space, at ~/Desktop/dev/website-fontsize. ${NAME} never deletes a worktree it didn’t make, so delete it when you’re done with it.`,
    );
  });

  it('reads right for two, naming both', () => {
    const out = page([{ path: '/Users/you/a', project: 'Website' }, { path: '/Users/you/b', project: 'Kestrel' }]);
    expect(out.now).toMatch(/^2 worktrees of Website and Kestrel are using disk space, at ~\/a and ~\/b\./);
  });

  it('is absent when there are none', () => {
    expect(page([])).toBe(null);
  });
});
