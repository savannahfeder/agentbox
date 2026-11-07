// TAB MOVES ALONG THE TABS, AND ⌘1 TO ⌘4 ARE GONE (w-914b16eab6, 2026-10-02).
//
// "Update these to remove the cmd 1 + cmd 2 shortcuts as we replaced it with
// tabs. update the tutorial too accordingly. and when i hover over them just
// like other shortcuts it should show these (tab)."
//
// What was measured before the change: the shortcuts page listed "⌘1 to ⌘4 Go
// straight to a section of the sidebar", the sidebar's Threads row hovered "⌘1
// Go to this section", and the tutorial's tour of the tabs said "Press ⌘2 or
// click In progress". Since In progress, Later and Done became tabs on the
// Inbox page (2026-10-01), Tab and Shift-Tab are how you move along them, and
// the number keys jumped through a sidebar list that is no longer drawn. The
// five tabs themselves hovered nothing at all.
//
// THEN, ON THE FIRST ROUND'S SCREENSHOTS: "Just show the Next tab. We don't
// need to show people the previous tab shortcut. I prefer the way they show
// Tab in their tutorial because it shows the icon on the keyboard as well as
// the name "Tab". I prefer that it's uppercase." The plate and the shortcuts
// page had drawn two lowercase caps, "tab" and "⇧ tab". Shift-Tab still goes
// back; it is just not advertised.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as nav from '../renderer/src/workspace-navigation.mjs';
import { HINTS, capsFor, capWord } from '../renderer/src/hint-plate';
import { SHORTCUTS } from '../renderer/src/shortcuts';
import { TEAM_TABS, TEAM_TAB_NAMES, coach, keyName, keyToken } from '../renderer/src/onboarding';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const numberChord = /⌘[1-4]/;

describe('⌘1 to ⌘4 do nothing and are offered nowhere', () => {
  it('has no handler for them', () => {
    expect(nav.sidebarSlot).toBeUndefined();
    expect(code('renderer/src/App.tsx')).not.toContain('sidebarSlot');
  });

  it('is not on the shortcuts page', () => {
    const keys = SHORTCUTS.flatMap((g) => g.keys.flatMap((k) => k.keys));
    expect(keys.filter((k) => numberChord.test(k))).toEqual([]);
  });

  it('is not on any hover plate, and the sidebar Threads row wears none', () => {
    const plateKeys = Object.values(HINTS).flat().map((l) => l.key);
    expect(plateKeys.filter((k) => numberChord.test(k))).toEqual([]);
    expect(Object.keys(HINTS).filter((id) => id.startsWith('section-'))).toEqual([]);
    expect(code('renderer/src/components/WorkspaceNavigation.tsx')).not.toContain('sectionHint');
  });
});

describe('Tab is offered where the number keys were', () => {
  // Carried over from command-numbers-go-to-a-sidebar-section.test.mjs, which
  // went with the keys: Tab moves along the tabs the Inbox draws and hands the
  // press to the browser everywhere else (editing, dialogs, an opened task).
  it('is guarded while typing, in a dialog and on an opened task', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("if (e.key === 'Tab') {");
    expect(app).toContain('if (!onTheTabs) return;');
    expect(app).toMatch(/const onTheTabs = !inInput && !modal && !focused/);
    expect(app).not.toContain("if (e.key === 'Tab' && modal !== 'compose')");
  });

  it('is on the shortcuts page as one ⇥ cap, next tab only', () => {
    const rows = SHORTCUTS.flatMap((g) => g.keys);
    const row = rows.find((k) => k.keys.includes('⇥'));
    expect(row?.keys).toEqual(['⇥']);
    expect(row?.what).toMatch(/next tab/i);
    expect(row?.what).not.toMatch(/back/i);
  });

  it('hovers "Next tab" on every tab along the top of the inbox, and nothing about going back', () => {
    expect(HINTS['state-tab']).toEqual([{ key: '⇥', what: 'Next tab' }]);
    const pages = code('renderer/src/threads/Pages.tsx');
    const tabs = pages.slice(pages.indexOf('export function StateTabs'), pages.indexOf('function PeopleLine'));
    expect(tabs).toContain('data-hint="state-tab"');
  });

  it('offers Shift-Tab nowhere, on the plate or the page', () => {
    const plateKeys = Object.values(HINTS).flat().map((l) => l.key);
    const pageKeys = SHORTCUTS.flatMap((g) => g.keys.flatMap((k) => k.keys));
    expect([...plateKeys, ...pageKeys].filter((k) => /⇧(tab|⇥)|^tab$/i.test(k))).toEqual([]);
  });

  it('draws ⇥ as one cap with "Tab" in it, the way the tutorial does', () => {
    expect(capsFor('⇥')).toEqual(['⇥']);
    expect(capWord('⇥')).toBe('Tab');
    // The tutorial's own cap says the same word.
    expect(keyName('⇥')).toBe(capWord('⇥'));
    // The neighbours keep their bare caps.
    expect(capWord('↵')).toBeNull();
    expect(capWord('esc')).toBeNull();
    expect(capWord('K')).toBeNull();
    expect(capsFor('esc')).toEqual(['esc']);
    expect(capsFor('⌘K')).toEqual(['⌘', 'K']);
  });

  it('puts the word inside the cap on the plate and on the shortcuts page', () => {
    expect(code('renderer/src/components/HintPlate.tsx')).toMatch(/capWord\(glyph\)/);
    expect(code('renderer/src/components/Settings.tsx')).toMatch(/capWord\(k\)/);
  });
});

describe('the tutorial tours the tabs with Tab', () => {
  const tabs = [...TEAM_TABS];

  it.each(tabs)('says Tab, never a number, standing on %s', (view) => {
    const said = coach('where', 0, { view, tabs, tabNames: TEAM_TAB_NAMES });
    expect(said.key).toBe('⇥');
    expect(`${said.lead}${said.key}${said.tail}`).not.toMatch(numberChord);
  });

  it('still names the tab to click', () => {
    const said = coach('where', 0, { view: 'inbox', tabs, tabNames: TEAM_TAB_NAMES });
    expect(`${said.lead}${said.key}${said.tail}`).toBe('Press ⇥ or click In progress to see where it all went.');
  });

  it('hears Tab as the answer and no longer hears ⌘2', () => {
    expect(keyToken({ key: 'Tab' })).toBe('⇥');
    expect(keyToken({ key: 'Tab', shiftKey: true })).toBe('⇥');
    expect(keyToken({ key: '2', metaKey: true })).toBeNull();
    // The keys either side are untouched: ⌘K is still the walk's, and a bare
    // number is still an option pick.
    expect(keyToken({ key: 'k', metaKey: true })).toBe('⌘K');
    expect(keyToken({ key: '2' })).toBe('2');
  });
});
