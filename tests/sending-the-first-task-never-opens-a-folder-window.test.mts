// Send unexpectedly opened a folder window before the task had a project.
// Folder selection must be explicit, explained, and complete before Send. The
// first task is now sent from the New thread box, whose Send stays off with no
// project; what is left here is the folder window's own name and the setup
// buttons' contrast.
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import FolderPicker from '../renderer/src/components/FolderPicker';

globalThis.React = React;

it('names the folder window for the project being chosen', () => {
  const html = renderToStaticMarkup(React.createElement(FolderPicker, {
    title: 'Choose your project folder', onPick() {}, onClose() {},
  }));
  expect(html).toContain('aria-label="Choose your project folder"');
  expect(html).toContain('<h2 class="fp-title">Choose your project folder</h2>');
});

it('keeps the controls readable on both light and dark backgrounds', () => {
  const css = fs.readFileSync(new URL('../renderer/src/components/first-run.css', import.meta.url), 'utf8');
  for (const selector of ['.first-run .ob-btn {']) {
    const rule = css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
    expect(rule).toContain('background: var(--film-strong)');
  }
});
