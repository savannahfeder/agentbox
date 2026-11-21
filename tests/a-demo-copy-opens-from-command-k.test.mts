// "It would be really helpful to have a demo instance of the app. Maybe I can
// even use Command-K to open it" (2026-11-21, for onboarding calls). The row
// had been taken out on 2026-10-29 as a test rig in everybody's list, so it
// comes back only for whoever types "demo": before that it is not listed.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOT_ON_A_PHONE, Palette } from '../renderer/src/components/Palette.tsx';
import { matchesQuery } from '../renderer/src/palette-rows.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const drawn = (typed: string, props: Record<string, unknown> = { onDemo: noop }) => renderToStaticMarkup(createElement(Palette, {
  products: [], supervisorPaused: false, look: 'ember-grid', onSetLook: noop, onOpenFilter: noop, onClearFilter: noop,
  onView: noop, onPause: noop, onResume: noop, onRankFirst: noop, onNewProject: noop, onNewThread: noop, onStanding: noop,
  onSettings: noop, onShortcuts: noop, keyHints: false, onSetKeyHints: noop, onFirstRun: noop, onTutorial: noop,
  onImportAgents: noop, onClose: noop, typed, ...props,
}));

describe('⌘K offers the demo copy by name', () => {
  it('when "demo" is typed', () => {
    expect(drawn('demo')).toContain('Open a demo copy');
  });

  it('from its first two letters', () => {
    expect(drawn('de')).toContain('Open a demo copy');
  });

  it('and not in the list before anything is typed', () => {
    expect(drawn('')).not.toContain('Open a demo copy');
  });

  it('nor for words that only its keywords hold', () => {
    expect(drawn('onboarding')).not.toContain('Open a demo copy');
  });

  it('nor in a window that cannot open one', () => {
    expect(drawn('demo', {})).not.toContain('Open a demo copy');
  });

  it('and never on a phone, which has no second copy to open', () => {
    expect(NOT_ON_A_PHONE).toContain('demo');
  });
});

describe('an unlisted row', () => {
  const row = { label: 'Open a demo copy', onlyWith: 'demo', unlisted: true };
  it('is left out of the empty list and found by its word', () => {
    expect(matchesQuery('', row)).toBe(false);
    expect(matchesQuery('demo', row)).toBe(true);
  });

  it('and leaves every other row in the empty list', () => {
    expect(matchesQuery('', { label: 'Take the tutorial' })).toBe(true);
    expect(matchesQuery('', { label: 'Turn the cloud off', onlyWith: 'cloud' })).toBe(true);
  });
});

describe('the app', () => {
  it('wires the row to the demo copy and says which window opened', () => {
    const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
    expect(app).toContain('onDemo={openDemoCopy}');
    expect(app).toMatch(/const openDemoCopy = useCallback\(async \(\) => \{[\s\S]{0,200}api\.openDemo\(\)/);
  });
});
