// THE WALK A PERSON IS HALFWAY THROUGH, WHEN THE APP UNDERNEATH IT CHANGES.
//
// The second half of that is the half nothing tested. The walk saves where it
// got to under one key so a quit halfway can resume, and the SHAPE of the walk
// has been rewritten five times in the three days it has existed. Measured off
// this repo's own history of `renderer/src/onboarding.ts`:
//
//   'agents'  a step of its own, then moved onto the finish card   (08-22)
//   'zero'    the inbox-zero card, deleted                          (08-23)
//   'make'    new                                                   (08-21)
//   'open'    new                                                   (08-21)
//   'done'    new                                                   (08-22)
//
// So a person who quits mid-walk and then takes an update is not an edge case
// here, it is the ordinary week. `readFirstRun` used to hand back whatever step
// string was on disk without asking whether this version still had one, and
// `Onboarding.tsx` draws a step by asking `run.step === 'welcome'` and so on all
// the way down. A step that is no longer any of them matches nothing: not a
// coached step, not the finish card, not `landed`. It falls through to the
// setup-screen shell, which then draws the Agentbox mark on an empty charcoal
// screen with no words on it and no button to press. There is no way forward
// from that screen and no way out of it, on the very first thing a new person
// ever sees.
//
// The rule this pins: EVERY STEP THAT CAN COME BACK OFF THE DISK IS A STEP THIS
// VERSION CAN DRAW. Delete a step whenever the walk needs it deleted; a saved
// walk sitting on the deleted one lands somewhere real instead of nowhere.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COACHED, BEAT, KEY, DONE_KEY, START,
  advance, finishFirstRun, firstRunDone, readFirstRun, restartFirstRun, saveFirstRun,
} from '../renderer/src/onboarding.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, '..', p), 'utf8');

/** localStorage, in as much as this uses of it. */
function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/**
 * The steps this version of the walk actually draws, read out of the component
 *  rather than out of a list in a test, so deleting a screen and forgetting to
 *  tell this file is itself a failure. */
function stepsTheAppDraws() {
  const tsx = src('renderer/src/components/Onboarding.tsx');
  const drawn = new Set(COACHED);
  for (const m of tsx.matchAll(/run\.step === '([a-z]+)'/g)) drawn.add(m[1]);
  return drawn;
}

/**
 * Steps that have really been in the Step union at some point and are not in
 *  it now. Taken from git history on 2026-08-23; the point of naming them is
 *  that these exact strings are sitting in somebody's localStorage today. */
const DELETED = ['agents', 'zero'];

describe('a step this version of the app has deleted', () => {
  it('is really gone, so these are the strings a stale walk would carry', () => {
    const drawn = stepsTheAppDraws();
    for (const dead of DELETED) {
      expect(BEAT[dead]).toBeUndefined();
      expect(drawn.has(dead)).toBe(false);
    }
  });

  it('never comes back off the disk as itself', () => {
    // The defect, stated as the thing that must not happen: a step string that
    // this version cannot draw reaching the renderer at all.
    for (const dead of DELETED) {
      const store = fakeStore({ [KEY]: JSON.stringify({ ...START, step: dead }) });
      expect(readFirstRun(store).step).not.toBe(dead);
    }
  });

  it('lands on a screen that exists, whatever nonsense is on the disk', () => {
    const drawn = stepsTheAppDraws();
    // `inbox` was on this list and it is a real step now: the first slab of
    // the introduction. `practice` replaces it as the plausible near-miss,
    // since that is what somebody would guess the hand-off step was called
    // and it is called `hand`.
    const junk = ['agents', 'zero', 'practice', '', 'WELCOME', 'folder ', '5', 'landed!'];
    for (const step of junk) {
      const store = fakeStore({ [KEY]: JSON.stringify({ ...START, step }) });
      const back = readFirstRun(store);
      expect(drawn.has(back.step), `${JSON.stringify(step)} came back as ${back.step}`).toBe(true);
    }
  });

  it('sends a walk that never made anything back to the start, not into the middle', () => {
    // Nothing was created, so beginning again costs the person nothing and is
    // the only honest place to put them.
    const store = fakeStore({ [KEY]: JSON.stringify({ ...START, step: 'zero' }) });
    expect(readFirstRun(store).step).toBe('welcome');
  });

  it('does not make a second project out of a walk that already made one', () => {
    // The two deleted steps were both LATE, after the project and the example
    // task were really in the store. Starting such a walk over at the welcome
    // walks the person through choosing a folder and naming a project they
    // already have, and leaves two of them behind.
    const store = fakeStore({
      [KEY]: JSON.stringify({
        ...START, step: 'agents', folder: '/Users/leon/dev/site', name: 'Site',
        product: 'site', item: 'w-1',
      }),
    });
    const back = readFirstRun(store);
    expect(back.step).toBe('landed');
    expect(back.product).toBe('site');
  });

  it('keeps the folder and the name it had already been told', () => {
    const store = fakeStore({
      [KEY]: JSON.stringify({ ...START, step: 'zero', folder: '/Users/leon/dev/site', name: 'Site' }),
    });
    const back = readFirstRun(store);
    expect(back.folder).toBe('/Users/leon/dev/site');
    expect(back.name).toBe('Site');
  });
});

describe('the walk on disk, read back', () => {
  it('resumes exactly where the quit happened, which is what the key is for', () => {
    const store = fakeStore();
    const half = advance({ ...START, step: 'folder' }, { t: 'folder', path: '/Users/leon/dev/site' });
    saveFirstRun(store, half);
    const back = readFirstRun(store);
    expect(back).toEqual(half);
    expect(back.name).toBe('Site');
  });

  it('is the start when nothing was ever saved', () => {
    expect(readFirstRun(fakeStore())).toEqual(START);
  });

  it('is the start when what was saved is not JSON at all', () => {
    expect(readFirstRun(fakeStore({ [KEY]: '{not json' }))).toEqual(START);
    expect(readFirstRun(fakeStore({ [KEY]: 'null' }))).toEqual(START);
  });

  it('fills in a field that did not exist when the walk was saved', () => {
    // `examples` arrived on 08-22. A walk saved the day before has no such key,
    // and the list beat spreads it, so undefined here is a crash on beat eight.
    const old = { step: 'name', folder: '/Users/leon/dev/site', name: 'Site' };
    const back = readFirstRun(fakeStore({ [KEY]: JSON.stringify(old) }));
    expect(Array.isArray(back.examples)).toBe(true);
    expect(back.examples).toEqual([]);
    expect(back.product).toBe(null);
    expect(back.item).toBe(null);
  });

  it('survives a store that throws on every call, because a locked-down browser is not a crash', () => {
    const angry = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    };
    expect(readFirstRun(angry)).toEqual(START);
    expect(firstRunDone(angry)).toBe(false);
    expect(() => saveFirstRun(angry, START)).not.toThrow();
    expect(() => finishFirstRun(angry)).not.toThrow();
    expect(() => restartFirstRun(angry)).not.toThrow();
  });
});

describe('finishing and walking it again', () => {
  it('writes the done mark and forgets where it got to', () => {
    const store = fakeStore({ [KEY]: JSON.stringify({ ...START, step: 'command' }) });
    finishFirstRun(store);
    expect(firstRunDone(store)).toBe(true);
    expect(store.getItem(KEY)).toBe(null);
  });

  it('does not count a done mark that says anything other than 1', () => {
    expect(firstRunDone(fakeStore({ [DONE_KEY]: '' }))).toBe(false);
    expect(firstRunDone(fakeStore({ [DONE_KEY]: 'true' }))).toBe(false);
    expect(firstRunDone(fakeStore({ [DONE_KEY]: '1' }))).toBe(true);
  });

  it('leaves every other key in the store alone, both times', () => {
    const seed = { 'zero.theme': 'lake', 'zero.skin': 'mountain', 'zero.lastProject': 'kestrel' };
    const store = fakeStore({ ...seed, [KEY]: JSON.stringify(START) });
    finishFirstRun(store);
    restartFirstRun(store);
    for (const [k, v] of Object.entries(seed)) expect(store.getItem(k)).toBe(v);
  });
});
