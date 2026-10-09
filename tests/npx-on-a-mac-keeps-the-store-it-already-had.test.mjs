// NPX ON A MAC KEEPS THE STORE IT ALREADY HAD.
//
// `npx agentbox-app` has kept its store in ~/.agentbox since it shipped. The
// Linux pull request (2026-10-07) pointed the command at defaultStoreRoot(),
// which on macOS is the desktop config's folder, ~/Agentbox. Every Mac that
// had used the browser command would have opened an empty inbox, its tasks
// still on disk in a folder nothing read any more. Found by reading
// bin/agentbox.mjs against main/store/home.mjs.
//
// The command asks appHome(), the lookup the store itself uses: an existing
// dot-folder first, then on Linux the XDG data directory, and on a Mac the
// dot-folder it always was.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appHome } from '../main/store/home.mjs';
import { nameSlug } from '../shared/product-name.mjs';

const bin = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'agentbox.mjs'),
  'utf8',
);

describe('where npx keeps the store', () => {
  it('asks the store lookup rather than the desktop default', () => {
    expect(bin).toContain('appHome()');
    expect(bin).not.toContain('defaultStoreRoot()');
  });

  it('is the dot-folder on a Mac, whether or not it is there yet', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'npx-mac-'));
    try {
      expect(appHome(home, { platform: 'darwin', env: {} })).toBe(path.join(home, `.${nameSlug}`));
      fs.mkdirSync(path.join(home, `.${nameSlug}`));
      expect(appHome(home, { platform: 'darwin', env: {} })).toBe(path.join(home, `.${nameSlug}`));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('keeps a Linux dot-folder that is already there', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'npx-linux-old-'));
    try {
      fs.mkdirSync(path.join(home, `.${nameSlug}`));
      expect(appHome(home, { platform: 'linux', env: {} })).toBe(path.join(home, `.${nameSlug}`));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('is the XDG data directory on a fresh Linux home, not the dot-folder', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'npx-linux-new-'));
    try {
      expect(appHome(home, { platform: 'linux', env: {} })).toBe(path.join(home, '.local', 'share', nameSlug));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
