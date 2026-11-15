// A RESTART PUTS YOU BACK WHERE YOU WERE, NOT ONLY ⌘R.
//
// What broke (power test 2, issue 5): a 176-character reply was half typed into
// a thread when the app quit and opened again, as an update does. The page came
// back on the thread list with nothing open and no reply box. The words were
// never lost, since they are written to localStorage on every keystroke, but
// the only thing that reopens the box is the thread being open, and the restore
// that reopens the thread was gated on `bootInfo.reloaded`, which the main
// process sets for ⌘R and for nothing else. A restart it did not ask for looked
// to the page exactly like opening the app in the morning.
//
// So the window now writes down that it is alive, every few seconds, and a load
// that finds a mark that recent knows it is coming back rather than starting.
// Measured against the two cases that must stay apart: a page reloading on top
// of a mark seconds old comes back to where it was, and the app opened the next
// morning opens on the inbox.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markWindowAlive, windowWasJustHere, ALIVE_EVERY_MS, STILL_THIS_SITTING_MS } from '../renderer/src/where-she-was';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

const store = () => {
  const held = new Map();
  return {
    getItem: (k) => (held.has(k) ? held.get(k) : null),
    setItem: (k, v) => { held.set(k, String(v)); },
    removeItem: (k) => { held.delete(k); },
  };
};

describe('whether this load is coming back or opening the app', () => {
  it('comes back when the window was alive a moment ago', () => {
    const s = store();
    markWindowAlive(s, 1_000_000);
    expect(windowWasJustHere(s, 1_000_000 + 2_000)).toBe(true);
  });

  it('comes back when the mark is as old as a heartbeat that was missed', () => {
    // The freeze the fix is for stops the app, not the window, so the beat goes
    // on through it. This is the case either side of that: one beat lost to a
    // busy page must still read as coming back.
    const s = store();
    markWindowAlive(s, 1_000_000);
    expect(windowWasJustHere(s, 1_000_000 + ALIVE_EVERY_MS * 2)).toBe(true);
  });

  it('opens on the inbox when the app was last up an hour ago', () => {
    const s = store();
    markWindowAlive(s, 1_000_000);
    expect(windowWasJustHere(s, 1_000_000 + 60 * 60 * 1000)).toBe(false);
  });

  it('opens on the inbox on the very edge, and comes back just inside it', () => {
    const s = store();
    markWindowAlive(s, 1_000_000);
    expect(windowWasJustHere(s, 1_000_000 + STILL_THIS_SITTING_MS - 1)).toBe(true);
    expect(windowWasJustHere(s, 1_000_000 + STILL_THIS_SITTING_MS)).toBe(false);
  });

  it('opens on the inbox on a machine that has never run it', () => {
    expect(windowWasJustHere(store(), 1_000_000)).toBe(false);
  });

  it('opens on the inbox when the mark is not a number, or is from the future', () => {
    const s = store();
    s.setItem('zero.alive', 'yesterday');
    expect(windowWasJustHere(s, 1_000_000)).toBe(false);
    // A clock moved back leaves a mark ahead of now. It is not evidence of
    // anything, and reading it as "just here" would reopen a day-old thread.
    s.setItem('zero.alive', String(2_000_000));
    expect(windowWasJustHere(s, 1_000_000)).toBe(false);
  });

  it('survives a storage that refuses to be written to', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(() => markWindowAlive(full, 1)).not.toThrow();
    expect(windowWasJustHere(full, 1)).toBe(false);
  });
});

describe('the app is wired to it', () => {
  it('restores after a reload AND after a restart it did not ask for', () => {
    expect(app).toMatch(/const cameBack = useRef\(windowWasJustHere\(window\.localStorage\)\);/);
    expect(app).toMatch(/const comingBack = reloaded === true \|\| cameBack\.current;/);
    expect(app).toMatch(/if \(restored \|\| reloaded === null \|\| !comingBack \|\| !snap\) return;/);
  });

  it('holds the boot screen and the note on the same answer', () => {
    // Both used to read `reloaded` directly. A restart that restored but did
    // not hold the boot screen would flash the inbox on the way to the thread,
    // and one that did not hold the note would overwrite it with that inbox.
    expect(app).toMatch(/if \(reloaded === null \|\| \(comingBack && !restored\)\) return;/);
    expect(app).toMatch(/\|\| \(comingBack && !restored && placeIsSomewhere\(wasAt\.current\)\)/);
  });

  it('says it is alive on a beat, and only after it has read the mark', () => {
    expect(app).toMatch(/setInterval\(beat, ALIVE_EVERY_MS\)/);
    expect(app.indexOf('const cameBack = useRef(')).toBeLessThan(app.indexOf('setInterval(beat, ALIVE_EVERY_MS)'));
  });
});
