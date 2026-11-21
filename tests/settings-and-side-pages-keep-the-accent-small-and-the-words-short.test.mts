// SETTINGS AND THE SIDE PAGES KEEP THE ACCENT SMALL AND THE WORDS SHORT.
//
// A design review of Settings, Connections, Files and the Feedback card,
// read off screenshots of a copy in dark and light, found: Settings' switches
// were big orange pills (the accent is only ever a small dot); the Agent Tray
// row explained itself in four lines; Settings' menu had 32px rows and a boxed
// search where the app's sidebar has 36px rows and an underlined one;
// Connections' "Add by address" was a 30px plain button beside the 32px
// icon buttons every other page header has; Figma was the one two-line card,
// at full strength, saying "Not available yet"; Files spent two toolbar rows
// on one file and said "1 KB on this computer"; the Feedback card had a
// sub-line, a long drop hint and a Send unlike the app's other ones.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { showsTotal } from '../renderer/src/files/files-shown';
import { FeedbackCard } from '../renderer/src/components/FeedbackCard';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const settingsCss = read('renderer/src/components/settings.css');
const settings = read('renderer/src/components/Settings.tsx');
const sidebarCss = read('renderer/src/workspace-navigation.css');
const connections = read('renderer/src/connections/ConnectionsPlace.tsx');
const connectionsCss = read('renderer/src/connections/connections.css');
const files = read('renderer/src/files/FilesPlace.tsx');
const feedbackCss = read('renderer/src/components/feedback-card.css');
const rule = (css: string, selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('Settings', () => {
  it('turns a switch on in the text ink, never the accent', () => {
    const on = rule(settingsCss, '.settings-screen[data-pane] .set-sw.on');
    expect(on).toContain('background: var(--text)');
    expect(on).not.toContain('accent');
    expect(rule(settingsCss, '.settings-screen[data-pane] .set-sw.on::after')).toContain('background: var(--bg)');
  });

  it('says what the Agent Tray is in one short sentence', () => {
    const desc = settings.match(/label="Show the Agent Tray"\s+desc="([^"]*)"/)?.[1] ?? '';
    expect(desc).toBe('A small tag over your other apps when an agent needs you.');
  });

  it('keeps every written-out description to two lines of the column', () => {
    const long = [...settings.matchAll(/desc="([^"]*)"/g)].map((m) => m[1]).filter((d) => d.length > 160);
    expect(long).toEqual([]);
  });

  it('draws its menu rows at the app sidebar\'s height and size', () => {
    expect(rule(sidebarCss, '.workspace-navigation button')).toMatch(/font-size: 13px;[^}]*height: 36px/);
    const row = rule(settingsCss, '.settings-screen[data-pane] .set-nav-item');
    expect(row).toContain('height: 36px');
    expect(row).toContain('font-size: 13px');
    expect(row).toContain('gap: 11px');
  });

  it('underlines its search the way the app sidebar does, with no box', () => {
    const box = rule(settingsCss, '.set-search');
    expect(box).toContain('border: 0');
    expect(box).toContain('background: none');
    expect(rule(settingsCss, '.set-search::after')).toContain('height: 1px');
  });
});

describe('Connections', () => {
  it('makes Add by address a header button with a plus, like New thread', () => {
    const add = connections.slice(connections.indexOf('cn-add-open'), connections.indexOf('Add by address</button>'));
    expect(connections).toContain('className="th-new cn-add-open"');
    expect(add).toContain('<PlusGlyph />');
  });

  it('gives the search beside it the same 32px', () => {
    expect(rule(connectionsCss, '.cn-head .cn-find')).toContain('height: 32px');
  });

  it('shows a tool nobody can connect yet on one dimmed line, the reason in its tooltip', () => {
    const tile = connections.slice(connections.indexOf('export function Tile('), connections.indexOf('const Section'));
    expect(tile).toContain("cn-tile-off");
    expect(tile).toMatch(/title=\{waits \?/);
    expect(tile).toContain('{!waits && <State');
    expect(rule(connectionsCss, '.cn-tile-off')).toMatch(/opacity: \.5/);
  });
});

describe('Files', () => {
  it('says the total only from a megabyte', () => {
    expect(showsTotal(0)).toBe(false);
    expect(showsTotal(1024 * 1024 - 1)).toBe(false);
    expect(showsTotal(1024 * 1024)).toBe(true);
    expect(files).toContain('showsTotal(used.onMac) && <TotalMenu');
  });

  it('puts sort and view in the first bar, so one file gets one toolbar row', () => {
    const bar = files.slice(files.indexOf('<div className="fp-bar">'), files.indexOf('<label className="fp-find">'));
    expect(bar).toContain('aria-label="Sort"');
    expect(bar).toContain('aria-label="View"');
    expect(files).toContain('(kinds.length > 1 || reviewing > 0 || review) && <div className="fp-tools">');
  });
});

describe('the Feedback card', () => {
  const html = renderToStaticMarkup(createElement(FeedbackCard, { onClose: () => {}, onSend: async () => ({ ok: true }) }));

  it('has no sub-line and a short drop hint', () => {
    expect(html).not.toContain('Goes straight');
    expect(html).toContain('>or drop files<');
  });

  it('draws Send as the app\'s other send buttons', () => {
    const send = rule(feedbackCss, '.fb-foot .dock-send');
    expect(send).toContain('height: 30px');
    expect(send).toContain('border: 1px solid var(--line-strong)');
    expect(send).toContain('border-radius: var(--radius)');
  });
});
