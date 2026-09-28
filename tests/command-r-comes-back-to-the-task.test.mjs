// ⌘R PUTS HER BACK WHERE SHE WAS.
//
// The reload throws the renderer away, so everything that said where she was
// lived in React state and died with it: the tab, the open task, the row the
// cursor was on. The page came back on the inbox because that is what
// `useState` was given.
//
// Two halves are guarded here. The module below is the note the page leaves
// itself, and the tests read it the way a reload does, including the ways a
// note written by another build can be wrong. The second describe reads App.tsx
// itself, for the three wirings that make the note mean anything and that a
// later edit could quietly undo: that the restore is gated on a real ⌘R rather
// than on any load, that the boot screen waits for it instead of flashing the
// inbox, and that the write is held until the read has happened.

import { describe, it, expect } from 'vitest';
import { NAME } from '../shared/product-name.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeIsSomewhere, readPlace, writePlace } from '../renderer/src/where-she-was';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');
const mainProcess = fs.readFileSync(path.join(here, '..', 'main', 'main.mjs'), 'utf8');

const store = (seed) => {
  let held = seed ?? null;
  return {
    getItem: () => held,
    setItem: (_k, v) => { held = v; },
    read: () => held,
  };
};

// What the app does on ⌘R, in one line: write where it is, throw the page away,
// read it back.
const acrossAReload = (place) => {
  const s = store();
  writePlace(s, place);
  return readPlace(store(s.read()));
};

describe('the note survives the reload', () => {
  it('brings back the task she was in, by identity', () => {
    const back = acrossAReload({ view: 'done', item: { product: 'agentbox', id: 'w-f59b19dab6' } });
    expect(back.view).toBe('done');
    expect(back.item).toEqual({ product: 'agentbox', id: 'w-f59b19dab6' });
  });

  it('carries the tab, the row, the document and Settings', () => {
    const back = acrossAReload({
      view: 'progress',
      item: { product: 'agentbox', id: 'w-1' },
      doc: { product: 'agentbox', src: 'designs/w-1/flows.html' },
      settings: true,
      row: 'w-2',
    });
    expect(back).toEqual({
      view: 'progress',
      item: { product: 'agentbox', id: 'w-1' },
      doc: { product: 'agentbox', src: 'designs/w-1/flows.html' },
      settings: true,
      row: 'w-2',
    });
  });

  it('keeps an open and empty search field open and empty', () => {
    // '' is the field open with nothing in it, and undefined is not searching
    // at all. Collapsing the two would reload her out of the search she was in.
    expect(acrossAReload({ view: 'inbox', search: '' }).search).toBe('');
    expect(acrossAReload({ view: 'inbox' }).search).toBeUndefined();
  });

  it('remembers a repeating rule as a rule, not as a task', () => {
    const back = acrossAReload({ view: 'snoozed', repeat: { product: 'agentbox', id: 'r-9' } });
    expect(back.repeat).toEqual({ product: 'agentbox', id: 'r-9' });
    expect(back.item).toBeUndefined();
  });
});

describe('a note this build cannot read costs only itself', () => {
  it('is nothing at all when there is nothing written', () => {
    expect(readPlace(store(null))).toBe(null);
  });

  it('is nothing at all when what is written is not a place', () => {
    expect(readPlace(store('{oh no'))).toBe(null);
    expect(readPlace(store('"inbox"'))).toBe(null);
    expect(readPlace(store('null'))).toBe(null);
  });

  it('falls back to the inbox on a tab this build does not have', () => {
    const back = readPlace(store(JSON.stringify({ view: 'archive', item: { product: 'agentbox', id: 'w-1' } })));
    expect(back.view).toBe('inbox');
    // AND STILL OPENS THE TASK. One unreadable field is not a reason to lose
    // the thing she actually asked to come back to.
    expect(back.item).toEqual({ product: 'agentbox', id: 'w-1' });
  });

  it('drops a half-written reference rather than opening something nameless', () => {
    const back = readPlace(store(JSON.stringify({
      view: 'inbox', item: { id: 'w-1' }, repeat: { product: 'agentbox' }, doc: { src: 'x.html' }, row: 4,
    })));
    expect(back.item).toBeUndefined();
    expect(back.repeat).toBeUndefined();
    expect(back.doc).toBeUndefined();
    expect(back.row).toBeUndefined();
  });
});

describe('the boot screen only waits when there is somewhere to go', () => {
  // Holding the window on "the app" for a frame it did not need is the cost of
  // getting this wrong, on every reload, for everyone.
  it('does not wait for the inbox with nothing open', () => {
    expect(placeIsSomewhere(null)).toBe(false);
    expect(placeIsSomewhere({ view: 'inbox' })).toBe(false);
  });

  it('waits for a task, a rule, another tab, Settings, a search or a row', () => {
    expect(placeIsSomewhere({ view: 'done' })).toBe(true);
    expect(placeIsSomewhere({ view: 'inbox', item: { product: 'a', id: 'w-1' } })).toBe(true);
    expect(placeIsSomewhere({ view: 'inbox', repeat: { product: 'a', id: 'r-1' } })).toBe(true);
    expect(placeIsSomewhere({ view: 'inbox', settings: true })).toBe(true);
    expect(placeIsSomewhere({ view: 'inbox', search: '' })).toBe(true);
    expect(placeIsSomewhere({ view: 'inbox', row: 'w-1' })).toBe(true);
  });
});

describe('the app is wired to it', () => {
  it('restores on a reload and never on a fresh launch', () => {
    // `bootInfo.reloaded` is true only after the ⌘R it was added for. Restoring
    // on every load would reopen a task from days ago in place of the inbox the
    // app is designed to open on.
    expect(app).toMatch(/setReloaded\(!!info\?\.reloaded\)/);
    expect(app).toMatch(/reloaded !== true/);
  });

  it('holds the boot screen until she is back, so the inbox never flashes', () => {
    expect(app).toMatch(/if \(restoring\) return <div className="boot">\{NAME\}<\/div>;\n\s*if \(!snap\) return <div className="boot">/);
  });

  it('does not overwrite the note with the blank page that is about to read it', () => {
    expect(app).toMatch(/if \(reloaded === null \|\| \(reloaded && !restored\)\) return;/);
  });

  it('is told about the chord by the main process, and told only once', () => {
    // The harness copies these three lines into its
    // own harness so it can press a real ⌘R. If they move, the harness is
    // proving something the app no longer does.
    expect(mainProcess).toMatch(/reloadRequested = true;\n\s*window\.webContents\.reloadIgnoringCache\(\);/);
    expect(mainProcess).toMatch(/if \(key === 'r'\) \{\n\s*reloadRenderer\(\);/);
    expect(mainProcess).toMatch(/reloaded: reloadRequested[\s\S]{0,200}?reloadRequested = false;/);
  });

  it('leaves the first run alone', () => {
    // The walk drives the tabs itself; a reload in the middle of it belongs to
    // the walk, not to wherever she was standing before it started.
    expect(app).toMatch(/if \(run \|\| firstRunNeeded\(\{/);
  });
});
