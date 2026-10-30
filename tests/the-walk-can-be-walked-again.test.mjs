// THE ONBOARDING, FROM ⌘K, ON AN INSTALL THAT IS ALREADY SET UP.
//
// `?firstrun=1` has always walked it a second time, and a downloaded app has no
// address bar, so until this landed the only way back to the welcome screen was
// to throw the install away. Two things are pinned here, and the second one
// matters more than the first: the row exists and can be found by the words she
// would type, and it DELETES NOTHING. The walk keeps two keys in localStorage
// and this forgets both of them; her store, her projects and her settings are
// not touched, which is why the row's hint says a new project gets made rather
// than pretending the app has been reset.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME } from '../shared/product-name.mjs';
import {
  DONE_KEY, KEY, START, finishFirstRun, firstRunDone, readFirstRun, restartFirstRun, saveFirstRun,
} from '../renderer/src/onboarding.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const palette = read('renderer/src/components/Palette.tsx');
const app = read('renderer/src/App.tsx');

const store = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};

describe('walking the onboarding again', () => {
  it('forgets that it was ever finished, and where it got to', () => {
    const s = store();
    saveFirstRun(s, { ...START, step: 'command', name: 'Zero' });
    finishFirstRun(s);
    expect(firstRunDone(s)).toBe(true);

    restartFirstRun(s);
    expect(firstRunDone(s)).toBe(false);
    expect(readFirstRun(s)).toEqual(START);
  });

  it('touches nothing else in the store', () => {
    // The one fear a row called "run the onboarding again" should answer.
    const s = store({
      [DONE_KEY]: '1',
      [KEY]: '{"step":"done"}',
      'zero.theme': 'dark',
      'zero.skin': 'lake',
      'zero.seen': '["w-1","w-2"]',
    });
    restartFirstRun(s);
    expect([...s.map.keys()].sort()).toEqual(['zero.seen', 'zero.skin', 'zero.theme']);
  });

  /* * THE LABEL AND TWO OF THE KEYWORDS MOVED ON 2026-08-28, AND THE ROW DID NOT
     (w-9a6ea066d6). What this test was written to hold is untouched and is still held
     below: the row exists, it is findable by the words SHE types, it is wired to
     `walkAgain`, and it deletes nothing. The pair of them is held against each other in
     tests/the-tutorial-and-the-onboarding-are-two-things.test.mjs.
  */
  it('is a row in ⌘K, found by the words she would type', () => {
    const row = palette.slice(palette.indexOf("id: 'first-run'"), palette.indexOf("id: 'keyhints'"));
    expect(row).toContain('label: `Set ${NAME} up again`');
    expect(row).toContain('run: onFirstRun');
    for (const word of ['onboarding', 'first run', 'new user', 'welcome']) {
      expect(row).toContain(word);
    }
    // AND THE HINT SAYS WHAT IT COSTS, because the walk makes a real project on
    // its way through rather than drawing a picture of one.
    expect(row).toMatch(/hint: '[^']*makes a project'/);
  });

  it('is wired to a handler that resets the walk and not the store', () => {
    expect(app).toContain('onFirstRun={walkAgain}');
    const fn = app.slice(app.indexOf('const walkAgain = useCallback'), app.indexOf('\n  }, [', app.indexOf('const walkAgain = useCallback')));
    expect(fn).toContain('restartFirstRun(localStorage)');
    expect(fn).toContain('setRun({ ...RUN_START })');
    // Nothing in it may reach the store or the main process.
    expect(fn).not.toMatch(/api\./);
    expect(fn).not.toMatch(/localStorage\.clear/);
  });
});

// Being a brand new user (a SECOND Agentbox in a throwaway home) left \u2318K on
// 2026-10-29 as a test rig; `npm run fresh` opens it
// (tests/the-command-bar-holds-no-test-rigs.test.mjs).
