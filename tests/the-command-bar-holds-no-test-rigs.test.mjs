// "Remove the 'Open a demo inbox' option ... and see if there are any other
// weird options that might not be relevant, perhaps things I did during
// testing" (2026-10-29).
//
// Two ⌘K rows were test rigs in everybody's command bar: "Open a demo inbox"
// (a second copy on an invented studio's work) and "Open Agentbox as a new
// user" (a second copy that has never been set up). The copies themselves stay
// for whoever builds the app: `npm run fresh` opens the new user. "Set Agentbox
// up again" is kept: a downloaded app has no other way back to the welcome
// screen (tests/the-walk-can-be-walked-again.test.mjs).

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Palette } from '../renderer/src/components/Palette.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const noop = () => {};
const drawn = () => renderToStaticMarkup(createElement(Palette, {
  products: [], supervisorPaused: false, look: 'ember-grid', onSetLook: noop, onOpenFilter: noop, onClearFilter: noop,
  onView: noop, onPause: noop, onResume: noop, onRankFirst: noop, onNewProject: noop, onNewThread: noop, onStanding: noop,
  onSettings: noop, onShortcuts: noop, keyHints: false, onSetKeyHints: noop, onSearch: noop, onFirstRun: noop,
  onTutorial: noop, onImportAgents: noop, onClose: noop,
}));

describe('⌘K', () => {
  it('offers no demo inbox and no second copy as a new user', () => {
    const html = drawn();
    expect(html).not.toMatch(/demo inbox/i);
    expect(html).not.toMatch(/as a new user/i);
  });

  it('still offers the tutorial and setting the app up again', () => {
    const html = drawn();
    expect(html).toContain('Take the tutorial');
    expect(html).toMatch(/Set \w+ up again/);
  });

  it('and the app no longer wires either row in', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).not.toMatch(/onDemo=|onFreshUser=/);
  });

  it('the new user stays one command away for whoever builds the app', () => {
    expect(JSON.parse(read('package.json')).scripts.fresh).toBe('node scripts/fresh-user.mjs');
  });
});
