// LIGHT AND DARK, AND THE ACCENT IS THE ONE ORANGE IN BOTH (w-abed8ae491).
//
// Her words: "There should only be two modes: light and dark, both with orange
// accents." She said it after a screenshot of the New thread card came back
// with a BLUE Send button on a dark window.
//
// The two looks anyone can pick were already orange. What was blue was the
// palette underneath them. Dark is drawn by `[data-skin="ember-grid"]` layered
// over `[data-theme="dark"]`, and that lower block still carried the older,
// cooler dark the app had before the launch film's look: accent #7aabff, the
// ask chip a yellow, the underline a pale blue. Anything painting dark without
// the skin attribute got that one instead, and one of them was reachable — an
// html file opened in the document pane took `--accent: #7aabff`, so its links
// were blue inside an orange window.
//
// Measured in Chromium off the real stylesheet, before this change: with
// `data-theme="dark"` alone, --accent was #7aabff, --select-bar #7aabff,
// --chip-ask #d8b44a and --underline rgba(149, 188, 255, 0.68).
//
// So there is one orange in the app and this is what says so. It reads every
// declaration rather than the three that were wrong, because the next one will
// be somewhere else.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'styles.css'), 'utf8');

/** The brand orange, and the only accent this app has. */
const ORANGE = '#ee6018';
const ORANGE_RGB = '238, 96, 24';

const declared = (token) => [...css.matchAll(new RegExp(`--${token}:\\s*([^;]+);`, 'g'))]
  .map((m) => m[1].trim().toLowerCase());

describe('the accent', () => {
  it('is declared somewhere, so an empty read cannot pass this file', () => {
    expect(declared('accent').length).toBeGreaterThan(2);
  });

  it('is the one orange in every block that names it', () => {
    for (const value of declared('accent')) {
      expect(value, `--accent: ${value}`).toBe(ORANGE);
    }
  });

  it('carries the same orange into the words that are drawn from it', () => {
    for (const token of ['select-bar', 'chip-ask', 'find-current']) {
      for (const value of declared(token)) {
        expect([ORANGE, 'var(--accent)'], `--${token}: ${value}`).toContain(value);
      }
    }
  });

  it('is the orange behind every underline, at whatever strength', () => {
    for (const value of declared('underline')) {
      expect(value, `--underline: ${value}`).toContain(ORANGE_RGB);
    }
  });
});

describe('the two modes', () => {
  const block = (selector) => {
    const at = css.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`no block for ${selector}`);
    return css.slice(at, css.indexOf('\n}', at));
  };

  it('agree on the accent, light and dark', () => {
    const light = block(':root').match(/--accent:\s*([^;]+);/)[1].trim();
    const dark = block(':root[data-theme="dark"],\n:root[data-skin]:where(:not([data-theme="light"]))')
      .match(/--accent:\s*([^;]+);/)[1].trim();
    expect(light).toBe(dark);
  });

  it('give an html file in the document pane the same accent as the window', () => {
    // It sets its own ink ladder for a dark window, and the accent went with it.
    expect(block(':root:not([data-theme="light"]) .doc-pane.doc-html'))
      .toMatch(/--accent:\s*#ee6018;/);
  });
});
