// OPENING SETTINGS SWAPS THE SIDEBAR FOR ITS OWN MENU (w-ccadd13c46, 2026-10-05).
//
// Settings was redone from scratch with Linear's settings as the reference.
// The ask named the move this file pins: "when you go to Settings from the home
// page, it changes the sidebar to show the settings menu". The old screen kept
// the app's sidebar up and drew its pages as a tab strip across the top of the
// panel, under a second header reading "Settings"; photographed at 1920x1080
// that was three rows of chrome (header, tabs, page title) above the first
// setting, against one now.
//
// What this holds: while Settings is up the app's sidebar and the panel's header
// are not drawn; the menu stands where the sidebar stood, at its expanded width;
// the menu opens with the way back and the search box; Escape in a search with
// words in it empties the search rather than leaving Settings; and a page named
// by an old link still opens the page its content went to.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('renderer/src/components/Settings.tsx');
const layout = read('renderer/src/workspace-navigation.css');

describe('the sidebar swap', () => {
  it('hides the app sidebar and the panel header while Settings is up', () => {
    expect(layout).toMatch(/\.workspace-layout\.workspace-settings > \.workspace-navigation,\s*\n?\s*\.workspace-layout\.workspace-settings > \.topbar \{ display: none; \}/);
  });

  it('puts the menu exactly where the sidebar stood, at its expanded width', () => {
    expect(layout).toContain('.app.workspace-layout.workspace-settings { --workspace-width: 202px; }');
    expect(layout).toMatch(/\.settings-embedded \.set-nav \{[^}]*position: absolute;[^}]*left: calc\(22px - var\(--workspace-left\)\);[^}]*width: var\(--workspace-width\);/);
  });

  it('no longer draws the pages as a tab strip', () => {
    expect(layout).not.toMatch(/\.settings-embedded \.set-nav-scroll \{[^}]*display: flex/);
    expect(layout).not.toMatch(/\.settings-embedded \.set-nav-group[^{]*\{ display: none/);
  });
});

describe('the menu', () => {
  const top = settings.slice(settings.indexOf('<div className="set-nav-top">'), settings.indexOf('<div className="set-nav-scroll">'));

  it('opens with Back to app, then the search box', () => {
    expect(top).toContain('Back to app');
    expect(top.indexOf('Back to app')).toBeLessThan(top.indexOf('className="set-search"'));
    expect(top).toContain('aria-label="Search settings"');
  });

  it('is headed Personal, Agents and Workspace', () => {
    expect(settings).toContain("(['Personal', 'Agents', 'Workspace'] as const)");
  });

  it('shows the search results in place of the menu while there are words in the box', () => {
    const nav = settings.slice(settings.indexOf('<div className="set-nav-scroll">'), settings.indexOf('<div className="set-pane"'));
    expect(nav.indexOf('{query.trim() ? (')).toBeLessThan(nav.indexOf("(['Personal', 'Agents', 'Workspace']"));
  });

  it('empties the search on Escape before it leaves Settings', () => {
    expect(settings).toContain("const clearing = (e: KeyboardEvent) => !!queryRef.current && e.target === searchBox.current;");
    expect(settings).toContain("if (e.key === 'Escape' && !clearing(e))");
    expect(settings).toContain("if (e.key === 'Escape') { e.preventDefault(); setQuery(''); return; }");
  });
});

describe('old links', () => {
  // Every name the screen has used still lands somewhere true.
  it.each([
    ['themes', "if (want === 'themes') return 'appearance';"],
    ['priority', "if (want === 'priority') return 'projects';"],
    ['accounts', "if (want === 'accounts') return 'claude';"],
    ['agents', "if (want === 'agents') return 'running';"],
    ['codex on a Mac without it', "if (want === 'codex') return has.codex ? 'codex' : 'claude';"],
  ])('%s', (_name, line) => {
    expect(settings).toContain(line);
  });

  it('lands anything it does not know on General', () => {
    const fn = settings.slice(settings.indexOf('function paneFrom('), settings.indexOf('/* --------------------------------- screen'));
    expect(fn.trim().endsWith("return 'general';\n}")).toBe(true);
  });
});
