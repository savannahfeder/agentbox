// THE COMMAND BAR DRAWS LINE ICONS LIKE THE MENUS (2026-11-21).
//
// The founder, on the whole app: it "lacks UI polish... certain buttons are
// lacking icons or cleanliness". On a capture of ⌘K (dark and light) every row
// wore a text character in the mono face (✎ □ ↻ ● ◷), at three different
// sizes, while the thread's own menu draws the same actions as 16px line
// icons; "Give it to Theo" had no mark of its own and fell back to a lone dot.
// The picked row showed the accent orange twice (a 2px edge and an orange
// mark), a footer said "↑ ↓ MOVE ↵ SELECT" that nobody reads, New project
// carried the filler "name it, and it is yours", and Esc was a different cap
// from the row keys beside it.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Palette } from '../renderer/src/components/Palette';
import * as icons from '../renderer/src/palette-glyphs';
import { NAME } from '../shared/product-name.mjs';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const noop = () => {};
const iconFor = (icons as Record<string, unknown>).iconFor as ((row: { id: string; label: string }) => string) | undefined;
const ICONS = (icons as Record<string, unknown>).ICONS as Record<string, readonly string[]> | undefined;
const PLAIN = (icons as Record<string, unknown>).PLAIN_ICON as string | undefined;

const draw = (props = {}) => renderToStaticMarkup(createElement(Palette, {
  products: [{ slug: 'mine', name: 'My Workspace', personal: true }, { slug: 'site', name: 'Site' }],
  supervisorPaused: false, look: 'dark', order: [], onSetLook: noop, onOpenFilter: noop, onClearFilter: noop,
  onView: noop, onPause: noop, onResume: noop, onRankFirst: noop, onNewProject: noop, onNewThread: noop,
  onStanding: noop, onSettings: noop, onShortcuts: noop, keyHints: false, onSetKeyHints: noop,
  onFirstRun: noop, onTutorial: noop, onImportAgents: noop, onClose: noop,
  onOpenProjects: noop, onUsage: noop, onCheckUpdate: noop, onHome: noop, onConnections: noop,
  filtering: true, staleFiles: ['main/a.mts'], moveToApplications: true, onMoveToApplications: noop,
  teammates: [{ id: 't1', name: 'Theo', role: null }], onTeammates: noop, onPauseTeammate: noop,
  roomsOn: true, groups: [{ key: 'g', name: 'Design' }], onGroups: noop, onPickGroup: noop,
  itemCommands: [
    { id: 'give-theo', label: 'Hand over to Theo', run: noop },
    { id: 'rename', label: 'Rename thread…', run: noop },
    { id: 'snooze', label: 'Later', keyHint: 'L', run: noop },
  ],
  ...props,
} as Parameters<typeof Palette>[0]));

const glyphs = (html: string) => [...html.matchAll(/<span class="palette-glyph"[^>]*>((?:(?!<\/span>).)*)<\/span>/g)].map((m) => m[1]);
const hints = (html: string) => [...html.matchAll(/<span class="palette-hint">([^<]*)<\/span>/g)].map((m) => m[1]);
const rule = (css: string, sel: string) => css.match(new RegExp(`(?:^|\\n)${sel} \\{([^}]*)\\}`))?.[1] ?? '';

describe('every row', () => {
  const html = draw();

  it('wears a 16px line icon, not a character', () => {
    const all = glyphs(html);
    expect(all.length).toBeGreaterThan(20);
    for (const g of all) {
      expect(g).toMatch(/^<svg [^>]*width="16" height="16"[^>]*stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/);
      expect(g.replace(/<[^>]*>/g, '')).toBe('');
    }
  });

  it('never falls back to a dot', () => {
    expect(glyphs(html).join('')).not.toMatch(/[·•●]/);
    expect(read('renderer/src/palette-glyphs.ts')).not.toMatch(/'·'/);
  });

  // The case that must NOT get an icon of its own: an id nobody has drawn
  // yet gets the one neutral icon, the same every time.
  it('draws an id nobody has drawn with the one plain icon', () => {
    expect(iconFor?.({ id: 'something-new', label: 'Something new' })).toBe(PLAIN);
    expect(iconFor?.({ id: 'another-new', label: 'Another' })).toBe(PLAIN);
    expect(iconFor?.({ id: 'give-theo', label: 'Hand over to Theo' })).not.toBe(PLAIN);
  });
});

describe("the thread menu's drawings", () => {
  const menu = read('renderer/src/threads/ThreadMenu.tsx');
  const pathsOf = (mark: string) => {
    const body = menu.match(new RegExp(`function ${mark}\\(([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
    return [...body.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  };
  const same: [string, string][] = [
    ['rename', 'RenameMark'], ['move-site', 'MoveMark'], ['pin', 'PinMark'], ['snooze', 'LaterMark'],
    ['give-theo', 'GiveMark'], ['done', 'DoneMark'], ['close-task', 'DoneMark'], ['code', 'CodeMark'],
    ['run-now', 'RunMark'], ['wait-stop', 'WaitMark'], ['shipped', 'ShippedMark'],
    ['end-repeat', 'StopRepeatMark'], ['reopen', 'ReopenMark'], ['add-people', 'PeopleMark'],
  ];
  for (const [id, mark] of same) {
    it(`draws ${id} as the menu's ${mark}`, () => {
      const paths = pathsOf(mark);
      expect(paths.length).toBeGreaterThan(0);
      const mine = ICONS?.[iconFor?.({ id, label: '' }) ?? ''] ?? [];
      for (const d of paths) expect(mine).toContain(d);
    });
  }
});

describe('the picked row', () => {
  const styles = read('renderer/src/styles.css');
  it('is the faint fill alone, with no orange edge', () => {
    const sel = rule(styles, '\\.palette-item\\.selected');
    expect(sel).toMatch(/background: var\(--wash\)/);
    expect(sel).not.toMatch(/accent/);
  });
  it('draws its icon in the text colour, not the accent', () => {
    expect(rule(styles, '\\.palette-k \\.palette-item\\.selected \\.palette-glyph')).toMatch(/color: var\(--text\)/);
    const palette = styles.split('\n').filter((l) => /palette/.test(l) && /\{/.test(l));
    expect(palette.filter((l) => /var\(--accent\)/.test(l) && !/caret-color/.test(l))).toEqual([]);
  });
});

describe('the words around the rows', () => {
  const html = draw();

  it('has no footer of keys', () => {
    expect(html).not.toContain('palette-foot');
    expect(html).not.toMatch(/↑ ↓/);
  });

  it('drops the filler beside New project', () => {
    expect(html).not.toMatch(/name it, and it is yours/);
  });

  it('keeps each hint to four lowercase words or fewer', () => {
    const all = hints(html);
    expect(all).toContain('made for you');
    for (const h of all) {
      expect(h.split(/\s+/).filter((w) => /\w/.test(w)).length, h).toBeLessThanOrEqual(4);
      expect(h.replaceAll(NAME, '').replace(/Claude Code|Codex|Theo|My Workspace|Site/g, ''), h).not.toMatch(/[A-Z]/);
    }
  });
});

describe('the Esc key', () => {
  it('is the same cap as the keys on the rows', () => {
    const styles = read('renderer/src/styles.css');
    expect(styles).toMatch(/(?:^|\n)\.palette-key, \.palette-k \.palette-esc \{[^}]*border-radius: var\(--radius\)/);
    expect(draw()).toMatch(/<button type="button" class="palette-esc"[^>]*>esc<\/button>/);
  });
});
