// THE CLOUD TURNS ON OR OFF WITH ⌘C, AND ⌘C STILL COPIES.
//
// What broke (2026-10-17): a plain C turned the cloud on or off from anywhere,
// and she hit it by accident: the cloud came on with Everything and her app
// froze for minutes. Her words: "Let's change cloud to be toggleable at Cmd + C
// rather than C." ⌘C is also Copy in every screen, so the chord only takes the
// cloud when there is nothing to copy: no text selected, not in a field, and
// not over a dialog. A plain C does nothing now.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { CLOUD_KEY, cloudChord, cloudCommands } from '../renderer/src/cloud-menu';
import { HINTS } from '../renderer/src/hint-plate';
import { SHORTCUTS } from '../shared/shortcuts.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const key = (k, mods = {}) => ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });
const calm = { inInput: false, selection: '', modal: false };

describe('⌘C', () => {
  it('turns the cloud on or off with nothing to copy, with Command or Control', () => {
    expect(cloudChord(key('c', { metaKey: true }), calm)).toBe(true);
    expect(cloudChord(key('C', { metaKey: true }), calm)).toBe(true);
    expect(cloudChord(key('c', { ctrlKey: true }), calm)).toBe(true);
  });

  it('copies instead with text selected, in a field, or over a dialog', () => {
    expect(cloudChord(key('c', { metaKey: true }), { ...calm, selection: 'some words' })).toBe(false);
    expect(cloudChord(key('c', { metaKey: true }), { ...calm, inInput: true })).toBe(false);
    expect(cloudChord(key('c', { metaKey: true }), { ...calm, modal: true })).toBe(false);
    // A selection of only spaces is nothing to copy.
    expect(cloudChord(key('c', { metaKey: true }), { ...calm, selection: '  ' })).toBe(true);
  });

  it('is not a plain C, nor C with Shift or Option, nor another letter', () => {
    expect(cloudChord(key('c'), calm)).toBe(false);
    expect(cloudChord(key('c', { metaKey: true, shiftKey: true }), calm)).toBe(false);
    expect(cloudChord(key('c', { metaKey: true, altKey: true }), calm)).toBe(false);
    expect(cloudChord(key('v', { metaKey: true }), calm)).toBe(false);
  });
});

describe('where the key is said and heard', () => {
  it('says ⌘C on the button, in ⌘K and on the shortcuts page', () => {
    expect(CLOUD_KEY).toBe('⌘C');
    expect(HINTS.cloud).toEqual([{ key: '⌘C', what: 'Cloud on or off' }]);
    const on = { setUp: true, mode: 'full', whenOn: 'full', running: 0, month: { runs: 0, agentHours: 0 } };
    expect(cloudCommands(on)[0].keyHint).toBe('⌘C');
    const anywhere = SHORTCUTS.find((g) => g.label === 'Anywhere in the app');
    expect(anywhere.keys.some((k) => k.keys.includes('⌘C'))).toBe(true);
    expect(anywhere.keys.some((k) => k.keys.includes('C'))).toBe(false);
  });

  it('is heard once, with the other chords, and a plain C reaches the cloud nowhere', () => {
    const app = read('../renderer/src/App.tsx');
    expect(app.match(/toggleCloudRef\.current\?\.\(\)/g)).toHaveLength(1);
    expect(app).toMatch(/if \(cloudChord\(e, \{ inInput, selection: String\(window\.getSelection\?\.\(\) \?\? ''\), modal: !!modal \}\)\) \{/);
    expect(app).not.toMatch(/e\.key === 'c' \|\| e\.key === 'C'\) \{ e\.preventDefault\(\); toggleCloudRef/);
    expect(app).not.toMatch(/case 'c': case 'C': e\.preventDefault\(\); toggleCloudRef/);
    // Before the guard that sends every other chord to the menu and the OS.
    expect(app.indexOf('if (cloudChord(e')).toBeLessThan(app.indexOf('if (e.metaKey || e.ctrlKey || e.altKey) return;'));
  });
});
