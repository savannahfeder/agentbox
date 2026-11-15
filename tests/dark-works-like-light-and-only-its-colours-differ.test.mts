// DARK WORKS LIKE LIGHT, AND ONLY ITS COLOURS DIFFER.
//
// The owner, 2026-11-02: "ember should be functionally the same as the light
// theme. only differnce is color pretty much". Dark is the Ember Grid picture,
// and beyond its colours it still drew the launch film's shapes: corner marks
// standing outside a card Light draws plain, the inbox-zero figure cropped by
// its own margins, and an opened thread's reply box with no card behind it.
// Its corners were squared too (one-corner-for-the-whole-app). Photographed
// side by side, Light and Dark, on the inbox, a thread, the viewer, Connections,
// Files, Settings and Command K.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const nav = read('renderer/src/workspace-navigation.css');
const styles = read('renderer/src/styles.css');

describe('Dark against Light', () => {
  it('draws no corner marks around the card', () => {
    expect(nav).not.toMatch(/\[data-skin="ember-grid"\] \.panel-marks/);
  });

  it('lays out inbox zero the way Light does', () => {
    expect(nav).not.toMatch(/\[data-skin="ember-grid"\] \.idle-zero \{[^}]*margin/);
    expect(nav).not.toMatch(/\[data-skin="ember-grid"\] \.idle-zero-col/);
  });

  it('keeps the reply box a card on an opened thread', () => {
    expect(styles).not.toMatch(/:root\[data-skin\] \.app\.flat \.dock-card \{ background: transparent; \}/);
  });

  it('keeps Light\'s corner', () => {
    const ember = styles.slice(styles.indexOf(':root[data-skin="ember-grid"] {'));
    expect(ember.slice(0, ember.indexOf('\n}'))).not.toMatch(/--radius:/);
  });
});
