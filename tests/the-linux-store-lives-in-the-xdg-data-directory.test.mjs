// The inbox wrote itself to ~/Agentbox. Measured 2026-10-07: zero.config.json
// named no store, and the default is a folder of the app's name in $HOME.
// That is a visible directory in the home folder. On Linux an application's
// data goes in $XDG_DATA_HOME, which is ~/.local/share when the variable is
// unset. The Mac default stays a folder named after the app. A fresh copy
// must not inherit the real data directory and write into it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultStoreRoot, appHome } from '../main/store/home.mjs';
import { loadConfig } from '../main/config.mjs';
import { legacyRoot } from '../main/store/project.mjs';
import { freshEnv } from '../shared/fresh-user-home.mjs';
import { Name, nameSlug, envNames } from '../shared/product-name.mjs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = fs.readFileSync(path.join(here, '..', 'bin', 'agentbox.mjs'), 'utf8');

describe('the linux store lives in the xdg data directory', () => {
  it('uses ~/.local/share when XDG_DATA_HOME is unset', () => {
    const home = '/home/ada';
    const root = defaultStoreRoot({ home, platform: 'linux', env: {} });
    expect(root).toBe(path.join(home, '.local', 'share', nameSlug));
    expect(root).not.toBe(path.join(home, Name));
    expect(root).not.toBe(path.join(home, `.${nameSlug}`));
  });

  it('honours XDG_DATA_HOME, and treats a blank one as unset', () => {
    const home = '/home/ada';
    expect(defaultStoreRoot({ home, platform: 'linux', env: { XDG_DATA_HOME: '/var/lib/data' } }))
      .toBe(path.join('/var/lib/data', nameSlug));
    expect(defaultStoreRoot({ home, platform: 'linux', env: { XDG_DATA_HOME: '   ' } }))
      .toBe(path.join(home, '.local', 'share', nameSlug));
  });

  it('keeps the Mac folder, and ignores XDG there', () => {
    const home = '/Users/ada';
    expect(defaultStoreRoot({ home, platform: 'darwin', env: { XDG_DATA_HOME: '/var/lib/data' } }))
      .toBe(path.join(home, Name));
  });

  it('is where a config that names no store is opened', () => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xdg-store-'));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'xdg-home-'));
    fs.writeFileSync(path.join(appDir, 'zero.config.json'), JSON.stringify({ accountId: 'acct' }));
    try {
      const config = loadConfig(appDir, { home });
      // A stand-in home must not pick up this machine's XDG_DATA_HOME. That
      // variable is an absolute path in the real home.
      expect(config.storeRoot).toBe(defaultStoreRoot({ home, env: {} }));
      expect(config.storeRoot.startsWith(home + path.sep)).toBe(true);
      expect(config.accountRoot).toBe(path.join(config.storeRoot, 'accounts', 'acct'));
      if (process.platform === 'linux') {
        expect(config.storeRoot.startsWith(path.join(home, Name))).toBe(false);
      }
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('answers the same place from the home lookup on a fresh linux directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xdg-apphome-'));
    const held = {};
    for (const key of envNames('HOME')) { held[key] = process.env[key]; delete process.env[key]; }
    try {
      if (process.platform === 'linux') {
        expect(appHome(tmp)).toBe(path.join(tmp, '.local', 'share', nameSlug));
        expect(legacyRoot()).toBe(defaultStoreRoot());
      }
    } finally {
      for (const [key, value] of Object.entries(held)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not hand a fresh copy the real data directory', () => {
    const env = freshEnv('/tmp/stranger-home', {
      HOME: '/home/ada',
      XDG_DATA_HOME: '/home/ada/.local/share',
      PATH: '/usr/bin',
    });
    expect(env.XDG_DATA_HOME).toBeUndefined();
    expect(defaultStoreRoot({ home: env.HOME, platform: 'linux', env }))
      .toBe(path.join('/tmp/stranger-home', '.local', 'share', nameSlug));
  });

  it('is the browser command fallback, rather than a dot folder in $HOME', () => {
    // appHome() answers the XDG directory on a fresh Linux home, and keeps a
    // Mac's ~/.agentbox (tests/npx-on-a-mac-keeps-the-store-it-already-had).
    expect(bin).toContain('appHome()');
    expect(bin).not.toContain("path.join(os.homedir(), '.agentbox')");
  });
});
