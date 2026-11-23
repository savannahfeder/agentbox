// ⌘K's rows for single settings, from the index Settings' own search reads.

import type { Command } from './components/Palette';
import { nameRank } from './palette-pick';
import { searchSettings, type SettingsHit } from './settings-search';

export const SETTING_ROW = 'setting:';
export const SETTINGS_SHOWN = 3;

export function settingRows(query: string, pages: readonly string[], open: (hit: SettingsHit) => void): Command[] {
  const rows = searchSettings(query, { pages }).map((hit) => {
    const label = hit.say ?? hit.label;
    return {
      id: `${SETTING_ROW}${hit.page}:${hit.label}`,
      label,
      hint: label.includes(hit.pageLabel) ? 'Settings' : `Settings · ${hit.pageLabel}`,
      place: hit.pageLabel,
      run: () => open(hit),
    };
  });
  // Sorted by the name ⌘K shows, which the index's own order does not know.
  return rows.map((r, i) => ({ r, i, k: nameRank(query, r.label) })).sort((a, b) => a.k - b.k || a.i - b.i).slice(0, SETTINGS_SHOWN).map((x) => x.r);
}

/** A setting named like a command already listed ("Keyboard shortcuts") is that command. */
export function besideCommands(settings: readonly Command[], commands: readonly Command[]): Command[] {
  const named = new Set(commands.map((c) => c.label.toLowerCase()));
  return settings.filter((s) => !named.has(s.label.toLowerCase()));
}
