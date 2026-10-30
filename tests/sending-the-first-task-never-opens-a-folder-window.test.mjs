// Send unexpectedly opened a folder window before the task had a project.
// Folder selection must be explicit, explained, and complete before Send.
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import FolderPicker from '../renderer/src/components/FolderPicker';

globalThis.React = React;
const source = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');

it('never opens a folder window from the task screen or its shortcut', () => {
  const next = source.slice(source.indexOf('const next = useCallback'), source.indexOf('const sendTo = useCallback'));
  expect(next).not.toContain('chooseAnother');
  expect(next).toContain("go('where')");
});

it('names the folder action without a second line of instructions', () => {
  expect(source).not.toContain('Choose the folder containing the project you want the agent to work on.');
  expect(source).not.toContain('ob-folder-note');
  expect(source).toContain('Choose its folder');
});

it('names the folder window for the project being chosen', () => {
  const html = renderToStaticMarkup(React.createElement(FolderPicker, {
    title: 'Choose your project folder', onPick() {}, onClose() {},
  }));
  expect(html).toContain('aria-label="Choose your project folder"');
  expect(html).toContain('<h2 class="fp-title">Choose your project folder</h2>');
});

it('keeps the controls readable on both light and dark backgrounds', () => {
  const css = fs.readFileSync(new URL('../renderer/src/components/first-run.css', import.meta.url), 'utf8');
  for (const selector of ['.first-run .ob-btn {', '.first-run .ob-chip {']) {
    const rule = css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
    expect(rule).toContain('background: var(--film-strong)');
  }
});
