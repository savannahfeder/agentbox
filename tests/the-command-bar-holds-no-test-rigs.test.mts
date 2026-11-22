// "Remove the 'Open a demo inbox' option ... and see if there are any other
// weird options that might not be relevant, perhaps things I did during
// testing" (2026-10-29).
//
// Two ⌘K rows were test rigs in everybody's command bar: "Open a demo inbox"
// and "Open Agentbox as a new user". The new user went for good: `npm run
// fresh` opens it. The demo was asked for back on 2026-11-21, for onboarding
// calls, so it is offered only once "demo" is typed and never sits in the list
// (tests/a-demo-copy-opens-from-command-k). "Set Agentbox up again" is kept: a
// downloaded app has no other way back to the welcome screen
// (tests/the-walk-can-be-walked-again.test.mts).

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
  onTutorial: noop, onImportAgents: noop, onDemo: noop, onClose: noop,
}));

describe('⌘K', () => {
  it('lists no demo and no second copy as a new user before anything is typed', () => {
    const html = drawn();
    expect(html).not.toMatch(/demo/i);
    expect(html).not.toMatch(/as a new user/i);
  });

  it('still offers the tutorial and setting the app up again', () => {
    const html = drawn();
    expect(html).toContain('Start the walkthrough');
    expect(html).toMatch(/Set \w+ up again/);
  });

  it('and the app no longer wires the new-user row in', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).not.toMatch(/onFreshUser=/);
  });

  it('the new user stays one command away for whoever builds the app', () => {
    expect(JSON.parse(read('package.json')).scripts.fresh).toBe('node scripts/run.mjs scripts/fresh-user.mjs');
  });
});
