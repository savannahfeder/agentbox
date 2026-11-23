// ⌘K FOUND NO SETTING BY ITS NAME.
//
// The founder typed "bring in new chats" into ⌘K, as she had been told to, and
// got five threads that mention the words and no switch (2026-11-23). Settings
// has its own search over every row (../renderer/src/settings-search.ts), but
// ⌘K only knew the one "Settings…" row, so a switch was two screens and a
// second search away. Now ⌘K reads the same index: a setting it names comes
// first and opens Settings on that page, lit where the switch is.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { besideCommands, settingRows, SETTINGS_SHOWN } from '../renderer/src/palette-settings';
import { pagesOn, type SettingsHit } from '../renderer/src/settings-search';
import { paletteOrder, type Command } from '../renderer/src/components/Palette';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const every = pagesOn({ team: true, cloud: true, rooms: true }).map((p) => p.id);
const opened: SettingsHit[] = [];
const rows = (q: string, pages: readonly string[] = every) => settingRows(q, pages, (hit) => opened.push(hit));
const thread = (label: string): Command => ({ id: `thread-${label}`, label, run: () => {} });
const order = (q: string, threads: Command[], commands: Command[] = []) => paletteOrder([...commands, ...rows(q)], threads, false, q, 0);

describe('a setting in ⌘K', () => {
  it('is found by its own name, says where it lives, and opens there', () => {
    const [row] = rows('bring in new chats');
    expect(row.label).toBe('Bring in new chats');
    expect(row.hint).toBe('Settings · Running');
    row.run();
    expect(opened.at(-1)).toMatchObject({ page: 'running', anchor: 'outside' });
  });

  it('goes above the threads that only mention the words', () => {
    const { rows: drawn, labels } = order('bring in new chats', [thread('Onboarding call takeaways'), thread('Setup hangs after importing chats')]);
    expect(drawn[0].label).toBe('Bring in new chats');
    expect(labels.get(1)).toBe('Threads');
  });

  it('goes under the threads when the words only name its page', () => {
    // "codex" is a word people type to find threads; the Codex page's rows must not push them down.
    const { rows: drawn, labels } = order('codex', [thread('Codex stalls on a long run')]);
    expect(drawn[0].label).toBe('Codex stalls on a long run');
    expect(labels.get(1)).toBe('Commands');
    expect(drawn.slice(1).every((c) => c.hint === 'Settings · Codex')).toBe(true);
  });

  it('comes after the commands the words find', () => {
    const cmd: Command = { id: 'usage', label: 'Usage and limits', keywords: 'codex', run: () => {} };
    const { rows: drawn, labels } = order('codex', [thread('Codex stalls')], [cmd]);
    expect(drawn.map((c) => c.label).slice(0, 3)).toEqual(['Codex stalls', 'Usage and limits', 'Usage']);
    expect(labels.get(1)).toBe('Commands');
    expect(labels.has(2)).toBe(false);
  });

  it('is left out when a command of the same name is listed', () => {
    const shortcuts: Command = { id: 'shortcuts', label: 'Keyboard shortcuts', run: () => {} };
    const found = rows('keyboard shortcut');
    expect(found.map((r) => r.label)).toContain('Keyboard shortcuts');
    expect(besideCommands(found, [shortcuts]).map((r) => r.label)).not.toContain('Keyboard shortcuts');
    expect(besideCommands(found, [shortcuts]).map((r) => r.label)).toContain('Show keyboard shortcut hints');
  });

  it('lists a few, not a page of them', () => {
    expect(rows('cloud').length).toBeLessThanOrEqual(SETTINGS_SHOWN);
    expect(rows('cloud').length).toBeGreaterThan(0);
  });

  it('is not offered for words that start no word of it', () => {
    expect(rows('bring out')).toEqual([]);
    expect(rows('ode')).toEqual([]);
    expect(rows('')).toEqual([]);
  });

  it('is not offered from a page this app does not have', () => {
    const solo = pagesOn({ team: false, cloud: false, rooms: false }).map((p) => p.id);
    expect(rows('invite', solo)).toEqual([]);
    expect(rows('invite').map((r) => r.label)).toContain('Team');
    expect(rows('change plan', solo)).toEqual([]);
  });
});

describe('the wiring', () => {
  const app = read('renderer/src/App.tsx');
  const palette = read('renderer/src/components/Palette.tsx');
  const settings = read('renderer/src/components/Settings.tsx');

  it('hands ⌘K the pages Settings draws, and opens Settings on the row picked', () => {
    expect(app).toMatch(/findSettings=\{[\s\S]{0,400}settingRows\(/);
    expect(app).toMatch(/setSettingsPane\(hit\.anchor \? `\$\{hit\.page\}#\$\{hit\.anchor\}` : hit\.page\)/);
    expect(settings).toMatch(/pagesOn\(\{ team: !!teamPane, cloud: !!cloudPlans, rooms: !!roomsPane \}\)/);
  });

  it('lands Settings on the group the row names, lit', () => {
    expect(settings).toMatch(/const \[askedPage, askedFind = ''\] = asked\.split\('#'\)/);
    expect(settings).toMatch(/useState<\{ anchor: string; at: number \} \| null>\(\(\) => \(askedFind \? \{ anchor: askedFind, at: Date\.now\(\) \} : null\)\)/);
  });

  it('leaves a phone to its own Settings search', () => {
    expect(palette).toMatch(/phone \|\| !findSettings/);
  });
});
