// WHAT PEOPLE DO IN THE MINUTES AFTER SETUP IS COUNTED.
//
// Activation fell from 13 of 76 installs (Oct 6 to 9) to 0 of 18 after it.
// Setup completion did not move (8 of 14 on 0.1.12, 7 of 12 on 0.1.13), but on
// 0.1.13 and 0.1.14 seven of the nine people who finished setup sent nothing
// again within four minutes (PostHog, 2026-10-16). Two things first reached
// people in 0.1.13 at exactly that moment: the corner tag floating over every
// app, and the import card that ends setup. Nothing said whether the app was
// quit, whether the tag was put away, or what the import offered and brought
// in, so the two could not be told apart.
//
// The cases:
//   · each new count is on the approved list, and keeps only a number;
//   · a quit says how long the app had been open, and is sent on the way out
//     where the last batch is flushed;
//   · hiding the tag says for how long, a choice that hides nothing sends
//     nothing, and turning it off in Settings is counted while turning it on
//     is not;
//   · setup's import card says how many it offered, once, and how many it
//     brought in; the same card opened from ⌘K says neither.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { EVENTS, sanitize } from '../shared/analytics-events.mjs';
import { createCornerTag } from '../main/corner-tag.mjs';
import { cornerTagTurnedOff } from '../main/settings.mjs';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('the new counts are on the approved list', () => {
  it('accepts each of them by name, with a number and nothing else', () => {
    for (const name of ['app_quit', 'tag_hidden', 'tag_turned_off', 'import_offered', 'import_taken']) {
      expect(EVENTS[name]).toBeTruthy();
      expect(sanitize(name, { seconds: 12, title: 'her row' })).toEqual({ seconds: 12 });
    }
  });
});

describe('quitting', () => {
  it('says how long the app was open, on the way out', () => {
    const main = read('main/main.mjs');
    expect(main).toMatch(/quitStep\(app, 'before-quit', 'count the quit', \(\) => analytics\.track\('app_quit', \{ seconds: Math\.round\(process\.uptime\(\)\) \}\)\)/);
    // Counted before the hold that waits for the last batch, so it is in it.
    expect(main.indexOf("'count the quit'")).toBeLessThan(main.indexOf('flushBeforeQuit(app'));
  });
});

function tagRig() {
  const handlers = {};
  const counted = [];
  const clock = new Date(2026, 9, 16, 21, 0, 0).getTime();
  class FakeWindow {
    constructor() { this.webContents = { send: () => {}, on: () => {} }; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} on() {}
    isDestroyed() { return false; } isVisible() { return false; }
    hide() {} showInactive() {} setBounds() {} getBounds() { return null; } setPosition() {}
  }
  const area = { x: 0, y: 0, width: 1728, height: 1080 };
  const config = {};
  createCornerTag({
    BrowserWindow: FakeWindow,
    screen: { getAllDisplays: () => [{ workArea: area }], getDisplayMatching: () => ({ workArea: area }), getCursorScreenPoint: () => ({ x: 0, y: 0 }), on: () => {}, removeListener: () => {} },
    ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, removeHandler: () => {} },
    powerMonitor: { on: () => {}, removeListener: () => {} },
    Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
    config, saveConfig: (c, patch) => Object.assign(c, patch),
    mainWindow: { isDestroyed: () => false, isFocused: () => false, isMinimized: () => false, on: () => {}, show: () => {}, focus: () => {}, restore: () => {}, webContents: { send: () => {} } },
    load: () => {}, preload: '/p.cjs', now: () => clock,
    setTimer: () => 0, clearTimer: () => {}, mac: true,
    count: (name, props) => counted.push([name, props]),
  });
  return { hide: (choice) => handlers['corner-tag:hide'](null, choice), counted };
}

describe('the corner tag', () => {
  it('says for how long it was hidden', () => {
    const t = tagRig();
    t.hide('5m');
    t.hide('30m');
    t.hide('today');
    expect(t.counted).toEqual([
      ['tag_hidden', { seconds: 300 }],
      ['tag_hidden', { seconds: 1800 }],
      ['tag_hidden', { seconds: 3 * 3600 }],
    ]);
  });

  it('sends nothing for a choice that hides nothing', () => {
    const t = tagRig();
    t.hide('forever');
    t.hide(undefined);
    expect(t.counted).toEqual([]);
  });

  it('is counted when turned off in Settings, and not when turned on', () => {
    expect(cornerTagTurnedOff({ key: 'cornerTag', value: false })).toBe(true);
    expect(cornerTagTurnedOff({ key: 'cornerTag', value: true })).toBe(false);
    expect(cornerTagTurnedOff({ key: 'adhdMode', value: false })).toBe(false);
    expect(cornerTagTurnedOff({})).toBe(false);
    const ipc = read('main/ipc.mjs');
    const at = ipc.indexOf("ipcMain.handle('zero:settings-set-workspace',");
    expect(ipc.slice(at, at + 500)).toMatch(/if \(cornerTagTurnedOff\(payload\)\) analytics\.track\('tag_turned_off'\)/);
    expect(read('main/main.mjs')).toMatch(/createCornerTag\(\{[\s\S]{0,300}count: \(name, props\) => analytics\.track\(name, props\)/);
  });
});

describe("setup's import card", () => {
  const card = read('renderer/src/components/ImportAgents.tsx');

  it('says how many it offered, once, and only inside setup', () => {
    // Setup's last screen offers only the chats waiting on you when it has any
    // (w-62228098e6), so that is the number it offered.
    expect(card).toMatch(/if \(!walk \|\| !read \|\| toldOffered\.current\) return;\s*toldOffered\.current = true;\s*try \{ window\.zero\?\.track\?\.\('import_offered', pickup \? askLines\.length : lines\.length\); \} catch \{\}/);
  });

  it('says how many it brought in, and only inside setup', () => {
    expect(card).toMatch(/if \(walk\) \{ try \{ window\.zero\?\.track\?\.\('import_taken', added\); \} catch \{\} \}/);
  });
});
