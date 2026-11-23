// ⌘K's rows for single settings, from the index Settings' own search reads.

import type { Command } from './components/Palette';
import { searchSettings, type SettingsHit } from './settings-search';

export const SETTING_ROW = 'setting:';
export const SETTINGS_SHOWN = 3;

export function settingRows(query: string, pages: readonly string[], open: (hit: SettingsHit) => void): Command[] {
  return searchSettings(query, { pages }).slice(0, SETTINGS_SHOWN).map((hit) => ({
    id: `${SETTING_ROW}${hit.page}:${hit.label}`,
    label: hit.label,
    hint: `Settings · ${hit.pageLabel}`,
    run: () => open(hit),
  }));
}
