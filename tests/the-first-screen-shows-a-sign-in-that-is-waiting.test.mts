// THE FIRST SCREEN SHOWED NOTHING WHILE A SIGN-IN WAS OPEN IN THE BROWSER (F-199).
//
// QA batch 013, Debian 13, 0.1.22: a fresh user pressed Install Claude Code; a
// claude.ai login opened in the browser straight away, and the app still read
// "Install Claude Code or Codex to start" over "No coding agent found", with no
// waiting state. The screen only knew a setup was running from the reply to its
// own press, so a window that missed that reply drew nothing. Now the press
// shows the waiting state before the reply arrives, and the screen asks the app
// what is running when it opens and whenever the window comes back.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runningSetup, installGate } from '../renderer/src/first-run.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('the setup the app is already running', () => {
  it('is the sign-in waiting on the browser', () => {
    const s = runningSetup([{ engine: 'claude', phase: 'signing-in', error: null }, { engine: 'codex', phase: 'idle' }]);
    expect(s).toEqual({ engine: 'claude', phase: 'signing-in', error: null });
    expect(installGate(s).heading).toBe('Finish signing in to Claude Code in your browser');
  });

  it('is an install or a check too', () => {
    expect(runningSetup([null, { engine: 'codex', phase: 'installing' }])?.engine).toBe('codex');
    expect(runningSetup([{ engine: 'claude', phase: 'checking' }, null])?.phase).toBe('checking');
  });

  it('is nothing when nothing is running, failed or finished', () => {
    expect(runningSetup([null, null])).toBe(null);
    expect(runningSetup([{ engine: 'claude', phase: 'idle' }, { engine: 'codex', phase: 'idle' }])).toBe(null);
    expect(runningSetup([{ engine: 'claude', phase: 'failed', error: 'x' }, { engine: 'codex', phase: 'ready' }])).toBe(null);
  });
});

describe.each(['renderer/src/components/FirstRun.tsx', 'renderer/src/components/FirstRunClassic.tsx'])('%s', (file) => {
  const src = read(file);

  it('shows the waiting state the moment the button is pressed', () => {
    const press = src.match(/const startSetup = useCallback\(async \(engine: Engine\) => \{([\s\S]*?)\}, \[\]\);/)?.[1] ?? '';
    const shown = press.indexOf("setSetup({ engine, phase: 'checking'");
    expect(shown).toBeGreaterThan(-1);
    expect(shown).toBeLessThan(press.indexOf('await'));
  });

  it('asks the app what is running when it opens and when the window comes back', () => {
    const look = src.match(/const look = async \(\) => \{[\s\S]*?\}, \[\]\);/)?.[0] ?? '';
    expect(look).toMatch(/runningSetup\(/);
    expect(look).toMatch(/engineSetup\('status', 'claude'\)/);
    expect(look).toMatch(/engineSetup\('status', 'codex'\)/);
    expect(look).toMatch(/void look\(\)/);
    expect(look).toMatch(/addEventListener\('focus', look\)/);
  });
});
