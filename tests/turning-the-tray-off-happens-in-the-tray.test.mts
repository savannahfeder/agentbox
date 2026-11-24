// TURNING THE TRAY OFF HAPPENS IN THE TRAY (w-42b2671e8f).
//
// "Turn off…" in the tray's list used to open the app's Settings. The tray
// steps aside while the app is in front, so it vanished the moment Settings
// opened, which read as "it's off"; then it came back on leaving the app,
// still on. Now "Turn off…" turns the list into the choices themselves: for
// 5 minutes, 30 minutes, the rest of today, or for good.
//
// Measured by drawing the choices to markup and reading the page: the foot's
// "Turn off…" opens them rather than Settings, and every choice reaches the
// bridge. The main process side is in
// the-corner-tag-hides-for-a-while-and-comes-back.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OFF_CHOICES, OffPicker } from '../renderer/src/corner-tag/off.tsx';
import { HIDE_CHOICES } from '../shared/corner-tag.mts';

globalThis.React = React;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const page = read('renderer/src/corner-tag/main.tsx');
const bridge = read('main/corner-tag-preload.cjs');

describe('"Turn off…" at the foot of the list', () => {
  const foot = page.slice(page.indexOf('<div className="ct-foot">'));

  it('opens the choices in the list, not Settings', () => {
    expect(foot).toMatch(/className="ct-off" onClick=\{\(\) => setTurningOff\(true\)\}/);
    expect(page).not.toContain('bridge?.settings');
    expect(bridge).not.toContain('corner-tag:settings');
  });

  it('is the one way to hide it from the foot, so the foot has no Hide for row', () => {
    expect(foot).not.toContain('Hide for');
    expect(foot).not.toContain('HIDE_CHOICES');
  });
});

describe('the choices it opens into', () => {
  const html = renderToStaticMarkup(React.createElement(OffPicker, { onHide: () => {}, onOff: () => {}, onBack: () => {} }));

  it('offers every hide, then for good, last', () => {
    expect(OFF_CHOICES.map((c) => c.key)).toEqual([...HIDE_CHOICES.map((c) => c.key), 'good']);
    const words = ['For 5 minutes', 'For 30 minutes', 'For the rest of today', 'For good'];
    let at = -1;
    for (const w of words) {
      const next = html.indexOf(`>${w}<`);
      expect(next, w).toBeGreaterThan(at);
      at = next;
    }
  });

  it('is one button per choice, plus Back', () => {
    expect((html.match(/<button/g) ?? []).length).toBe(OFF_CHOICES.length + 1);
    expect(html).toContain('>Back<');
  });

  it('says what it turns off', () => {
    expect(html).toContain('Turn off the tray');
  });

  it('sends Back, each hide for a while, and an off for good', () => {
    const got = [];
    const picker = OffPicker({ onHide: (k) => got.push(['hide', k]), onOff: () => got.push(['off']), onBack: () => got.push(['back']) });
    const buttons = [];
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === 'button') buttons.push(n);
      walk(n.props?.children);
    };
    walk(picker);
    buttons.forEach((b) => b.props.onClick());
    expect(got).toEqual([['back'], ...HIDE_CHOICES.map((c) => ['hide', c.key]), ['off']]);
  });

  it('the page wires the choices to the bridge and shuts them when the list shuts', () => {
    expect(page).toMatch(/<OffPicker onHide=\{\(k\) => bridge\?\.hide\(k\)\} onOff=\{\(\) => bridge\?\.off\(\)\}/);
    expect(page).toMatch(/if \(!o\) \{ setPlacing\(false\); setTurningOff\(false\); \}/);
    expect(bridge).toContain("off: () => ipcRenderer.invoke('corner-tag:off')");
  });
});
