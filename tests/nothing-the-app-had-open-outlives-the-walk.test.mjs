// NOTHING THE APP HAD OPEN OUTLIVES THE WALK.
//
// The card is <NewProject>, and the route to it is one press wide. Closing the
// palette is the exact event that ends the ⌘K beat, so the finish card arrives
// in the same frame and covers it. Then the walk ends and the card is what is
// left on top of her own inbox.
//
// Reproduced on the built renderer with
// The harness, which drives those presses
// and photographs the result. This file is the part that runs in the suite, and
// it guards the two things a later edit could undo without noticing: that the
// list of overlays is TOTAL, and that the rule is applied at both ends of every
// walk rather than to the one door somebody found.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLOATS_OVER_THE_APP, NOTHING_OVER_THE_APP, afterTheWalk, anythingOverTheApp,
} from '../renderer/src/walk-scope.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

describe('the rule', () => {
  it('leaves nothing over the app, whatever was open', () => {
    expect(afterTheWalk({
      modal: 'palette', settings: true, importAgents: true, newProject: true,
    })).toEqual(NOTHING_OVER_THE_APP);
  });

  it('is the identity on a window that already has nothing over it', () => {
    expect(afterTheWalk(NOTHING_OVER_THE_APP)).toEqual(NOTHING_OVER_THE_APP);
  });

  it('can say whether anything is over the app at all', () => {
    expect(anythingOverTheApp(NOTHING_OVER_THE_APP)).toBe(false);
    expect(anythingOverTheApp({ ...NOTHING_OVER_THE_APP, newProject: true })).toBe(true);
    expect(anythingOverTheApp({ ...NOTHING_OVER_THE_APP, modal: 'palette' })).toBe(true);
  });
});

describe('the list of overlays is total', () => {
  // Every `{something && (` at the top level of App's tree is a thing drawn
  // OVER the inbox. One that is not in the list is one nobody has decided
  // about, and the way that reaches her is as a card left on her screen.
  //
  // `modeDraft` is the exception and it is not user-reachable: it is the
  // `?modes=` drawing surface, which stands INSTEAD of the walk rather than
  // under it, and no press in the app opens it. `run` and `landing` are the
  // walk's own furniture.
  //
  // `toast` joined this list on 2026-09-18 without changing anything about what
  // it is. It became a `{toast && (` only because one kind of it is now a
  // button rather than a div, so this scan started seeing it. It is not a thing
  // anybody can leave open: it fades on its own in a few seconds and it is the
  // walk's OWN way of saying things, so closing it at the end of a walk would
  // be the walk silencing itself.
  //
  // `fullScreenDoc` joined on 2026-09-21 and is the same kind of thing. What it
  // draws is the transparent corner that wakes the marks over a full screen
  // document. It is not a state she can be left stranded in: the condition IS a
  // document being open full screen, so it is gone the moment that is, and
  // closing the document is already on the list.
  const NOT_AN_OVERLAY = new Set(['modeDraft', 'run', 'landing', 'snoozeItem', 'toast', 'fullScreenDoc']);

  it('names every overlay App draws over the inbox', () => {
    const drawn = new Set();
    for (const m of app.matchAll(/^ {6}\{(\w+) && \(/gm)) drawn.add(m[1]);
    for (const m of app.matchAll(/^ {6}\{modal === '(\w+)'/gm)) drawn.add('modal');
    for (const name of drawn) {
      if (NOT_AN_OVERLAY.has(name)) continue;
      const sorted = FLOATS_OVER_THE_APP.includes(name)
        // `settingsOpen` is the state; `settings` is its name in the rule.
        || (name === 'settingsOpen' && FLOATS_OVER_THE_APP.includes('settings'));
      expect(sorted, `${name} is drawn over the app and is in neither list`).toBe(true);
    }
  });
});

describe('the rule is applied at both ends of every walk', () => {
  const bodyOf = (name) => {
    const at = app.indexOf(`const ${name} = useCallback(`);
    expect(at, `${name} is gone`).toBeGreaterThan(-1);
    return app.slice(at, app.indexOf('}, [', at));
  };

  it('closes what floats when a walk ends', () => {
    expect(bodyOf('finishRun')).toMatch(/closeWhatFloats\(\)/);
  });

  // A walk covers the whole window, so a screen open when one STARTS is
  // invisible for nineteen beats and then back. Both of these used to close
  // `modal` alone, which is the same rule half-applied from the other side.
  it('closes what floats when the onboarding is walked again', () => {
    expect(bodyOf('walkAgain')).toMatch(/closeWhatFloats\(\)/);
  });

  it('closes what floats when the tutorial starts', () => {
    expect(bodyOf('startTutorial')).toMatch(/closeWhatFloats\(\)/);
  });

  it('shuts every overlay in the list, not just the card Sam found', () => {
    const body = bodyOf('closeWhatFloats');
    for (const setter of ['setModal', 'setSettingsOpen', 'setImportAgents', 'setNewProject']) {
      expect(body, `${setter} is not called`).toMatch(new RegExp(`${setter}\\(`));
    }
  });
});
