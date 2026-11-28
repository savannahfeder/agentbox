// SETTINGS HAS NO ALPHA FEATURES, AND THE WINDOW NO GLASS (w-11d0017da3, 2026-11-26).
//
// On the Nov 26 onboarding call a team came for multiplayer, opened Settings
// and read out "alpha features: rooms, teammates, multiplayer": the thing they
// came for was labelled unfinished. The founder asked for most alpha features
// to go and for the Glass look to go. Glass had been taken out once already
// (9ff11e762, Nov 12), then put back only because that ship's deadline was too
// short, and it never left again.
//
// Measured here: what main reads for each former switch whatever was saved,
// that no page or search row is called Alpha features on the desktop or the
// phone, and that the main window is opaque with nothing in the page going
// glass. The tray's own Liquid Glass is a different thing and is not touched.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alphaFeatures, setWorkspaceSetting } from '../main/settings.mts';
import { roomsSetup } from '../main/team/room-setup.mts';
import { SETTINGS_PAGES, searchSettings } from '../renderer/src/settings-search.ts';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const rooms = (config: Record<string, unknown>, onTeam: boolean) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-alpha-'));
  try {
    return roomsSetup({ config: { storeRoot: dir, ...config }, store: { listProducts: () => [], readItem: () => null }, supervisor: { runsGoing: () => [] }, userDir: dir, log: () => {} }).enabled({ onTeam });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

describe('what the old switches turned on is simply on', () => {
  it('Multiplayer is on whatever was saved', () => {
    for (const saved of [undefined, true, false, null]) {
      expect(alphaFeatures({ alphaMultiplayer: saved }, { packaged: true }).multiplayer, String(saved)).toBe(true);
    }
  });

  it('Rooms is on for someone on a team and off for anyone else, whatever was saved', () => {
    for (const saved of [undefined, true, false]) {
      const config = { alphaRooms: saved, alphaMultiplayer: false };
      expect(alphaFeatures(config, { onTeam: true }).rooms, `on a team, saved ${saved}`).toBe(true);
      expect(rooms(config, true), `service on a team, saved ${saved}`).toBe(true);
      expect(alphaFeatures(config, { onTeam: false }).rooms, `no team, saved ${saved}`).toBe(false);
      expect(rooms(config, false), `service with no team, saved ${saved}`).toBe(false);
    }
  });

  it('AI teammates keep their own switch, now in General', () => {
    expect(alphaFeatures({}).teammates).toBe(true);
    expect(alphaFeatures({ alphaTeammates: false }).teammates).toBe(false);
  });

  it('a phone that still sends an old switch is answered, and nothing changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-alpha-'));
    const world = { config: { appDir: dir } as Record<string, unknown>, supervisor: { onChange() {} }, store: {} };
    expect(setWorkspaceSetting(world, { key: 'alphaMultiplayer', value: false })).toBe(true);
    expect(setWorkspaceSetting(world, { key: 'alphaRooms', value: false })).toBe(true);
    expect(alphaFeatures(world.config, { onTeam: true })).toMatchObject({ multiplayer: true, rooms: true });
    expect(() => setWorkspaceSetting(world, { key: 'alphaGlass', value: true })).toThrow(/unknown workspace setting/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('no page is called Alpha features', () => {
  it('Settings has no such page and search finds none', () => {
    expect(SETTINGS_PAGES.map((p) => p.id)).not.toContain('alpha');
    for (const q of ['alpha', 'rooms', 'multiplayer', 'glass']) {
      expect(searchSettings(q, { pages: SETTINGS_PAGES.map((p) => p.id) }).some((r) => (r.page as string) === 'alpha'), q).toBe(false);
    }
  });

  it('neither the desktop nor the phone draws it, and no message sends anyone there', () => {
    for (const f of ['renderer/src/components/Settings.tsx', 'mobile/src/ui/SettingsPages.tsx', 'renderer/src/App.tsx', 'renderer/src/web-settings.ts']) {
      const src = read(f);
      expect(src, f).not.toMatch(/Alpha features/);
      expect(src, f).not.toMatch(/setWorkspace\('alpha(Rooms|Multiplayer|Glass)'|k="alpha(Rooms|Multiplayer)"/);
    }
  });
});

describe('the window has no glass', () => {
  it('is made opaque on every platform, with no blur and no see-through window', () => {
    const main = read('main/main.mts');
    const made = main.slice(main.indexOf('window = new BrowserWindow({'));
    const options = made.slice(0, made.indexOf('\n  });'));
    expect(options).toContain("backgroundColor: '#1a1a1c',");
    expect(options).not.toMatch(/transparent|vibrancy|\.\.\.glass/);
    expect(main).not.toMatch(/window-glass|applyGlass|glass-tone/);
    expect(fs.existsSync(path.join(root, 'main/window-glass.mts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'main/native/window-glass'))).toBe(false);
  });

  it('has no Glass switch and reads none back', () => {
    expect(read('main/settings.mts')).not.toMatch(/alphaGlass/);
    expect(alphaFeatures({ alphaGlass: true } as never, { packaged: true })).not.toHaveProperty('glass');
  });

  it('leaves nothing in the page that goes glass', () => {
    expect(read('preload.cjs')).not.toMatch(/agentbox-glass|glassAble|glassTone/);
    expect(read('shared/bridge-map.mts')).not.toMatch(/glassTone/);
    expect(read('main/serve.mts')).not.toMatch(/glass-tone/);
    expect(read('renderer/src/App.tsx')).not.toMatch(/GlassBand|dataset\.glass\b|glassTone/);
    expect(read('renderer/src/workspace-navigation.css')).not.toMatch(/\[data-glass\]|\.glass-band/);
    expect(fs.existsSync(path.join(root, 'renderer/src/components/GlassBand.tsx'))).toBe(false);
  });

  it('still builds the tray its own Liquid Glass', () => {
    expect(fs.existsSync(path.join(root, 'main/native/liquid-glass'))).toBe(true);
    expect(read('scripts/build-liquid-glass.mjs')).toMatch(/liquid-glass/);
    expect(read('scripts/build-liquid-glass.mjs')).not.toMatch(/window-glass/);
  });
});
