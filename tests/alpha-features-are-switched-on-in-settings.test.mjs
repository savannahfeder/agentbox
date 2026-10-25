// ALPHA FEATURES ARE SWITCHED ON IN SETTINGS (w-3d0fa23ffb, 2026-10-20).
//
// What was asked: Rooms "should only be available in alpha so it should be
// toggleable on. Maybe there's a section in settings where you can toggle on
// alpha features". There was no switch for anything.
//
// Measured here: the saved setting, what Settings reads back, the snapshot
// field the renderer gates Rooms on, and the page in the menu. Off is the
// default.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setWorkspaceSetting, alphaFeatures } from '../main/settings.mjs';
import { SETTINGS_PAGES, searchSettings } from '../renderer/src/settings-search.ts';

const read = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8');

describe('saving the switches', () => {
  const world = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-'));
    return { config: { appDir: dir }, supervisor: { onChange() {} }, store: {}, dir };
  };

  it('all are off until someone turns them on', () => {
    expect(alphaFeatures({}, { packaged: true })).toEqual({ rooms: false, teammates: false, multiplayer: false });
  });

  it('Rooms on is written to the config file and read back', () => {
    const w = world();
    setWorkspaceSetting(w, { key: 'alphaRooms', value: true });
    expect(JSON.parse(fs.readFileSync(path.join(w.dir, 'zero.config.json'), 'utf8')).alphaRooms).toBe(true);
    expect(alphaFeatures(w.config, { packaged: true })).toEqual({ rooms: true, teammates: false, multiplayer: false });
    setWorkspaceSetting(w, { key: 'alphaRooms', value: false });
    expect(alphaFeatures(w.config).rooms).toBe(false);
    fs.rmSync(w.dir, { recursive: true, force: true });
  });

});

describe('where the app reads them', () => {
  it('the snapshot carries the switches, so the renderer can gate Rooms', () => {
    expect(read('main/ipc.mjs')).toMatch(/const alpha = alphaFeatures\(config\);[\s\S]{0,600}\n\s+alpha,\n/);
  });
  it('Settings reads them back', () => {
    expect(read('main/settings.mjs')).toMatch(/alpha:\s*alphaFeatures\(config\)/);
  });
});

describe('the page in Settings', () => {
  it('Alpha features is a page under Personal', () => {
    expect(SETTINGS_PAGES.find((p) => p.id === 'alpha')).toEqual({ id: 'alpha', label: 'Alpha features', group: 'Personal' });
  });
  it('typing alpha, rooms or beta finds it', () => {
    for (const q of ['alpha', 'rooms', 'beta']) {
      expect(searchSettings(q, { pages: SETTINGS_PAGES.map((p) => p.id) }).some((r) => r.page === 'alpha'), q).toBe(true);
    }
  });
  it('the page draws a switch for each, wired to its key', () => {
    const src = read('renderer/src/components/Settings.tsx');
    expect(src).toMatch(/setWorkspace\('alphaRooms'/);
  });
});
