// CTRL+K OPENED THE PALETTE UNDERNEATH THE WALK, WHERE NOBODY COULD SEE IT.
//
// Reported from the Linux box, 2026-10-23: "On the welcome, provider, folder
// and setup screens, press Ctrl+K, then Escape. Neither key does anything."
// Measured in the stylesheet, which is where the answer was: `.fr-screen` is
// z-index 300 with an opaque background and the palette's backdrop is 40, so
// the press really did open it — behind a screen covering the window. The
// Escape that followed closed that invisible palette, which is why the second
// key looked dead as well.
//
// The walk's own screens answer no key but their own. ⌘K comes LAST in the
// walk on purpose ("⌘K IS LAST, NOT FIRST. So the palette no longer opens
// itself over an empty app"), and by then the walk draws no screen at all, so
// the beat that teaches it still works.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IN_PRACTICE, STEPS, walkCoversTheApp } from '../renderer/src/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('which walk draws over the whole window', () => {
  it('says yes on every screen the walk draws over the app', () => {
    for (const step of ['welcome', 'plan', 'folder', 'name', 'hand', 'done']) {
      expect(walkCoversTheApp({ step, practice: null })).toBe(true);
    }
  });

  it('says no once the walk is standing on the real app', () => {
    // The practice round draws a tether beside the app, not over it, and the
    // ⌘K beat is in there: the palette has to open for that beat to happen.
    for (const step of IN_PRACTICE) {
      expect(walkCoversTheApp({ step, practice: 'practice' })).toBe(false);
    }
    expect(walkCoversTheApp({ step: 'landed', practice: 'practice' })).toBe(false);
    expect(walkCoversTheApp(null)).toBe(false);
  });

  it('has an answer for every step there is', () => {
    for (const step of STEPS) {
      expect(typeof walkCoversTheApp({ step, practice: 'practice' })).toBe('boolean');
    }
  });
});

describe('the window handler', () => {
  it('leaves the palette shut while a walk screen covers the app', () => {
    const app = read('renderer/src/App.tsx');
    const start = app.indexOf('const onKey = (e: KeyboardEvent) => {');
    const handler = app.slice(start, app.indexOf('if (focused) {', start));
    // The guard is above the toggle, so the press cannot flip the modal at all.
    const guard = handler.indexOf('walkScreenRef.current');
    const toggle = handler.indexOf("setModal((m) => (m === 'palette' ? null : 'palette'))");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(toggle);
    expect(app).toContain('walkScreenRef.current = walkCoversTheApp(run)');
  });
});
