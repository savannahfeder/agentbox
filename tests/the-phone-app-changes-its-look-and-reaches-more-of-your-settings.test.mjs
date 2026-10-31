// THE PHONE APP CHANGES ITS LOOK, AND REACHES MORE OF YOUR SETTINGS.
//
// "There's lots of stuff I can't do on mobile, like update the appearance.
// Please make sure settings are more thorough" (w-40b72c3f35, 2026-10-29).
// Measured that day: the phone app's Settings had nine pages against the
// desktop's fourteen, Appearance was one of the five left off, and the app was
// dark only, its colours fixed at load in ui/theme.ts with `userInterfaceStyle:
// 'dark'` pinning the system to dark as well. Of the computer's settings the
// phone could already change, three switches the desktop shows were missing:
// Teammates and Multiplayer under Alpha features, and Bring in new chats under
// Running.
//
// The screens are React Native, which these tests do not draw, so the rules
// that decide are pure and tested here, and the screens are read as source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { DARK, LIGHT, color, wear } from '../mobile/src/ui/theme';
import { lookOf, wornOf, LOOK_KEY, PHONE_LOOKS } from '../mobile/src/lib/look';
import { LOOKS } from '../renderer/src/skins';
import { phoneSettingsOf, checkSetting, settingRoute } from '../shared/phone-settings.mjs';

const read = (p) => fs.readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');

describe('the look you pick', () => {
  it('offers the desktop\'s three looks, in its order, with its names', () => {
    expect(PHONE_LOOKS.map((l) => l.name)).toEqual(LOOKS.map((l) => l.name));
  });

  it('is Dark when nothing was picked, or the store holds something it does not know', () => {
    expect(lookOf(null)).toBe('dark');
    expect(lookOf(undefined)).toBe('dark');
    expect(lookOf('ember-grid')).toBe('dark');
    expect(lookOf('Light')).toBe('dark');
    expect(lookOf('light')).toBe('light');
    expect(lookOf('match')).toBe('match');
  });

  it('follows the phone only when Match system is the pick', () => {
    expect(wornOf('match', 'light')).toBe('light');
    expect(wornOf('match', 'dark')).toBe('dark');
    // A phone that has no answer is dark, like the desktop with no media engine.
    expect(wornOf('match', null)).toBe('dark');
    expect(wornOf('dark', 'light')).toBe('dark');
    expect(wornOf('light', 'dark')).toBe('light');
  });

  it('is kept on the phone under its own key, not sent to the computer', () => {
    expect(LOOK_KEY).toMatch(/look/);
    expect(checkSetting({ scope: 'workspace', key: 'look', value: 'light' })).not.toBeNull();
  });
});

describe('the two palettes', () => {
  it('name the same colours, so no screen can reach one Light lacks', () => {
    expect(Object.keys(LIGHT).sort()).toEqual(Object.keys(DARK).sort());
  });

  it('take the desktop\'s light tokens (renderer/src/styles.css :root)', () => {
    expect(LIGHT.bg).toBe('#f8f8fa');
    expect(LIGHT.text).toBe('#12182a');
    expect(LIGHT.dim).toBe('#4a5266');
    expect(LIGHT.faint).toBe('#6e7590');
    expect(LIGHT.accent).toBe(DARK.accent);
  });

  it('are worn by changing the one colour object every screen reads', () => {
    wear('light');
    expect(color.bg).toBe(LIGHT.bg);
    wear('dark');
    expect(color.bg).toBe(DARK.bg);
    expect(color).toEqual(DARK);
  });
});

describe('no screen keeps a colour from before the switch', () => {
  // A colour copied into a constant when the file loads stays dark after Light is picked.
  const files = fs.readdirSync(new URL('../mobile/src/', import.meta.url), { recursive: true })
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('theme.ts'));
  it('reads it while drawing, never once at load', () => {
    const frozen = files.flatMap((f) => read(`src/${f}`).split('\n')
      // A getter or an arrow reads the colour when it is drawn; a plain value froze it.
      .filter((line) => /^(export )?const \w+(: [\w<>]+)? = .*\bcolor\.\w+/.test(line) && !/=>|get \w+\(\)/.test(line))
      .map((line) => `${f}: ${line.trim().slice(0, 80)}`));
    expect(frozen).toEqual([]);
  });

  it('types no dark surface of its own where the palette has one', () => {
    for (const f of ['src/ui/Approvals.tsx', 'src/ui/Markdown.tsx', 'src/ui/Files.tsx']) {
      expect(read(f)).not.toMatch(/'#2f2d2c'|'#272524'|'#282625'/);
    }
  });

  it('lets the phone tell the app light from dark, and the status bar follows', () => {
    expect(read('app.config.ts')).toMatch(/userInterfaceStyle: 'automatic'/);
    expect(read('src/app/_layout.tsx')).not.toMatch(/<StatusBar style="light" \/>/);
  });
});

describe('the Appearance page', () => {
  const pages = read('src/ui/SettingsPages.tsx');
  it('is on the phone, under Personal, after General', () => {
    const ids = [...pages.matchAll(/\{ id: '([\w-]+)', label: '([^']+)', group: '(\w+)'/g)].map(([, id]) => id);
    expect(ids.slice(0, 2)).toEqual(['general', 'appearance']);
  });
});

describe('the computer\'s switches the phone was missing', () => {
  const base = { ok: true, workspace: { alpha: { rooms: false, teammates: true, multiplayer: false }, importNew: true, memoryGate: {}, leftovers: {} }, projects: [] };
  const sent = phoneSettingsOf(base, { version: '1' });

  it('reach the phone', () => {
    expect(sent.workspace.alpha).toEqual({ rooms: false, teammates: true, multiplayer: false });
    expect(sent.workspace.importNew).toBe(true);
  });

  it('read off when the computer never set them', () => {
    const bare = phoneSettingsOf({ ok: true, workspace: { memoryGate: {}, leftovers: {} }, projects: [] }, { version: '1' });
    expect(bare.workspace.alpha).toEqual({ rooms: false, teammates: false, multiplayer: false });
    expect(bare.workspace.importNew).toBe(false);
  });

  it('can be changed from the phone, as switches and nothing else', () => {
    for (const key of ['alphaTeammates', 'alphaMultiplayer', 'importNew']) {
      expect(checkSetting({ scope: 'workspace', key, value: true })).toBeNull();
      expect(checkSetting({ scope: 'workspace', key, value: false })).toBeNull();
      expect(checkSetting({ scope: 'workspace', key, value: 'on' })).not.toBeNull();
      expect(settingRoute({ scope: 'workspace', key, value: true }, base)).toEqual(['zero:settings-set-workspace', { key, value: true }]);
    }
  });

  it('are drawn on the pages the desktop keeps them on', () => {
    const pages = read('src/ui/SettingsPages.tsx');
    expect(pages).toMatch(/label="Teammates"[^\n]*k="alphaTeammates"/);
    expect(pages).toMatch(/label="Multiplayer"[^\n]*k="alphaMultiplayer"/);
    expect(pages).toMatch(/label="Bring in new chats"[^\n]*k="importNew"/);
  });
});
