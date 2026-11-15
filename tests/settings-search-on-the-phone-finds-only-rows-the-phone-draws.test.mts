// SETTINGS SEARCH ON THE PHONE FINDS ONLY ROWS THE PHONE DRAWS.
//
// The phone's Settings search read the desktop's whole index, so "public
// links", "storage", "blur", "sidebar", "shortcut hints", "check for updates"
// and "keys for cloud threads" each opened a phone page without that row
// (measured 2026-11-08). "Connected devices" pointed at a group neither app
// draws any more. And `cornerTag` was a setting the phone could send with no
// control for it on the phone or the web app.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { searchSettings } from '../renderer/src/settings-search';
import { phoneSettingsRows } from '../mobile/src/lib/settings-rows';
import { checkSetting } from '../shared/phone-settings.mts';

const PAGES = ['general', 'appearance', 'phone', 'alpha', 'claude', 'codex', 'running', 'instructions', 'projects', 'team'];
const noCloud = { workspace: { cloud: null } };
const cloud = { workspace: { cloud: { mode: 'full', engines: ['claude'] } } };
const find = (q, settings = noCloud) => searchSettings(q, { pages: PAGES, rows: phoneSettingsRows(settings) }).map((h) => `${h.page}/${h.label}`);

describe('on the phone', () => {
  it('finds nothing for a row only the desktop has', () => {
    for (const q of ['public links', 'storage', 'blur', 'sidebar', 'shortcut hints', 'check for updates', 'keys for cloud', 'instructions for every agent']) {
      expect(find(q)).toEqual([]);
    }
  });

  it('still finds the rows it draws', () => {
    expect(find('permission mode')).toEqual(['claude/Permission mode', 'codex/Permission mode']);
    expect(find('sign out')).toEqual(['general/Your account']);
    expect(find('leftovers')).toEqual(['running/Stop programs agents leave behind']);
    expect(find('usage')).toEqual(expect.arrayContaining(['claude/Usage', 'codex/Usage']));
  });

  it('finds the cloud rows only for an agent the cloud has an account for', () => {
    expect(find('cloud accounts')).toEqual([]);
    expect(find('cloud accounts', cloud)).toEqual(['claude/Cloud accounts']);
  });

  it('lists only rows the desktop\'s index has, so a renamed row cannot drop out unseen', () => {
    for (const row of phoneSettingsRows(cloud)) {
      const [page, label] = row.split('/');
      expect(searchSettings(label, { pages: [page], rows: [row] }).map((h) => `${h.page}/${h.label}`)).toContain(row);
    }
  });

  it('is what the Settings screen searches with', () => {
    const src = fs.readFileSync(new URL('../mobile/src/app/settings/index.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/rows: phoneSettingsRows\(s\.settings\)/);
  });
});

describe('on the desktop', () => {
  it('finds every row as before', () => {
    expect(searchSettings('public links', { pages: ['general'] }).map((h) => h.label)).toEqual(['Public links']);
  });

  it('no longer lists Connected devices', () => {
    expect(searchSettings('connected devices', { pages: PAGES })).toEqual([]);
  });
});

describe('the corner tag', () => {
  it('is not a setting the phone can send', () => {
    expect(checkSetting({ scope: 'workspace', key: 'cornerTag', value: false })).not.toBeNull();
  });
});
