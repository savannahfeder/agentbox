// Neo, the voice assistant woken by tapping ⌘ twice, was scrapped on
// 2026-10-25 before a launch: "remove everything about Neo". It had its own
// window, a Settings page, an Alpha features switch, bridge channels and a
// page on the phone. Measured by searching every source folder for the name
// and by reading what Settings and the phone are handed. A config file that
// still says `alphaNeo: true` must turn nothing on.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alphaFeatures, setWorkspaceSetting } from '../main/settings.mjs';
import { SETTINGS_PAGES, searchSettings } from '../renderer/src/settings-search.ts';
import { REQUEST_CHANNELS, PUSH_CHANNELS, DESKTOP_ONLY } from '../shared/bridge-map.mjs';
import { phoneSettingsOf } from '../shared/phone-settings.mjs';

const root = path.join(import.meta.dirname, '..');
const SOURCE = ['main', 'renderer', 'shared', 'mobile/src', 'mcp', 'bin', 'scripts', 'cloud'];
// Neo on its own, and inside a name: alphaNeo, neoEnabled, onNeoAct.
const NAME = /(^|[^a-zA-Z])(neo|Neo|NEO)([^a-zA-Z]|$)|[a-z]Neo([^a-z]|$)|(^|[^a-zA-Z])neo[A-Z]|[jJ]arvis|JARVIS/;

function* files(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'scratch'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(m?[jt]sx?|cjs|mts|css|html|swift|json|sh)$/.test(entry.name)) yield full;
  }
}

describe('Neo is gone from the code', () => {
  it('no source file names it', () => {
    const hits = [];
    for (const dir of SOURCE) {
      for (const file of files(path.join(root, dir))) {
        if (NAME.test(fs.readFileSync(file, 'utf8')) || NAME.test(path.basename(file))) hits.push(path.relative(root, file));
      }
    }
    expect(hits).toEqual([]);
  });

  it('its folders and its window page are deleted', () => {
    for (const rel of ['main/neo', 'renderer/src/neo', 'renderer/neo.html']) expect(fs.existsSync(path.join(root, rel)), rel).toBe(false);
  });

  it('the microphone helper voice notes use is still there', () => {
    expect(fs.existsSync(path.join(root, 'main/mic.mjs'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'main/main.mjs'), 'utf8')).toMatch(/import \{ getMic \} from '\.\/mic\.mjs'/);
  });

  it('no bridge channel is about it', () => {
    const names = [...Object.keys(REQUEST_CHANNELS), ...Object.keys(PUSH_CHANNELS), ...DESKTOP_ONLY];
    const channels = [...Object.values(REQUEST_CHANNELS), ...Object.values(PUSH_CHANNELS)];
    expect(names.filter((n) => NAME.test(n) || /^(on)?neo/i.test(n))).toEqual([]);
    expect(channels.filter((c) => c.startsWith('neo:'))).toEqual([]);
  });
});

describe('nothing a person sees offers it', () => {
  it('Settings has no Neo page and the search finds nothing for it', () => {
    expect(SETTINGS_PAGES.map((p) => p.id)).not.toContain('neo');
    for (const q of ['neo', 'jarvis', 'voice']) {
      expect(searchSettings(q, { pages: SETTINGS_PAGES.map((p) => p.id) }), q).toEqual([]);
    }
  });

  it('an old config that switched it on turns nothing on', () => {
    expect(alphaFeatures({ alphaNeo: true }, { packaged: true })).toEqual({ rooms: false, teammates: false, multiplayer: false });
  });

  it('the switch can no longer be written', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-neo-'));
    const world = { config: { appDir: dir }, supervisor: { onChange() {} }, store: {} };
    setWorkspaceSetting(world, { key: 'alphaRooms', value: true });
    try { setWorkspaceSetting(world, { key: 'alphaNeo', value: true }); } catch {}
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8'));
    expect(saved.alphaNeo).toBeUndefined();
    expect(saved.alphaRooms).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the phone is not handed a Neo switch', () => {
    const model = { ok: true, workspace: { alpha: { neo: true, rooms: true } }, projects: [] };
    // The phone has Teammates and Multiplayer too since w-40b72c3f35; Neo is never among them.
    expect(phoneSettingsOf(model, { version: '1.0.0' }).workspace.alpha).toEqual({ rooms: true, teammates: false, multiplayer: false });
  });
});
