// THE WELCOME SCREEN SAID SOFTWARE WAS MISSING FROM A MAC THAT HAS IT.
//
// It was an accident, and here is the whole of it. `api.settings` answers with
// its own empty Settings whenever the page cannot reach the main process, and
// that object carried `claudeFound: false`. The welcome screen drew
// `!claude.found`. Every screenshot taken through the shot harness hit it too,
// because the harness answered on a channel api.ts does not read.
//
// The fix is that nothing may say missing without an answer saying so. These
// pin it at each place the answer passes through.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('a page that could not read its settings knows nothing about Claude Code', () => {
  const api = read('renderer/src/api.ts');

  it('says so in the settings it falls back to', () => {
    // The object handed back when the bridge is not there. It is allowed to say
    // claudeFound: false, because a Settings needs a boolean; what it may not
    // do is claim that answer is worth anything.
    expect(api).toMatch(/claudeFound: false, claudeCertain: false/);
  });

  it('and it is the same object every unreachable channel answers with', () => {
    // emptySettings is returned with ok: false from settings and from every
    // write, so one certainty flag covers all of them.
    expect(strip(api)).toMatch(/if \(!zero\?\.settingsRead\) return \{ \.\.\.emptySettings, ok: false/);
  });
});

describe('the welcome screen', () => {
  const app = strip(read('renderer/src/App.tsx'));
  const walk = strip(read('renderer/src/components/Onboarding.tsx'));

  it('only decides Claude Code is missing off an answer that arrived', () => {
    expect(app).toMatch(/const sure = s\.ok !== false && s\.workspace\?\.claudeCertain === true;/);
    expect(app).toMatch(/missing: sure && !s\.workspace\?\.claudeFound/);
  });

  it('starts saying nothing, so a read that never lands never draws the line', () => {
    expect(app).toMatch(/useState\(\{ missing: false, url:/);
  });

  it('draws the line off that one word and nothing else', () => {
    // The word is still the only input. It is read one step further back now:
    // `finishCard` in ../onboarding takes `{ missing }` and nothing else, and
    // it is what decides between the ending she approved and the card that
    // will not open the inbox (hers, 2026-08-23). One reader, so the card
    // cannot end up saying one thing while the gate does another.
    const logic = strip(read('renderer/src/onboarding.ts'));
    const fn = logic.slice(logic.indexOf('export function finishCard'));
    expect(fn.slice(0, fn.indexOf('}\n'))).toMatch(/if \(claude\.missing\)/);
    // `read` grew a second half on 2026-08-27: the last card is the import card
    // now and it reaches every folder on the Mac, so the walk waits on that
    // scan as well as on the file read. The word is still the only thing that
    // decides `blocked`.
    expect(walk).toMatch(/const card = finishCard\(claude, \{ read: found !== null && folders !== null, some \}\);/);
    expect(walk).toMatch(/\{card\.blocked && \(/);
    // The old test of the old bug. `found` is gone from the prop entirely, so
    // there is no boolean left that a failed read can flip.
    expect(walk).not.toMatch(/claude\.found/);
  });

  // THIS USED TO CHECK THE LINE SAT UNDER THE FOLDER CARD, which was the quiet
  // version of it and was still on the second screen of the walk.So the folder
  // screen has nothing about Claude Code on it at all now and the finish card
  // is the only place it can appear. What that costs, and what the rest of the
  // states are, is in
  // tests/the-claude-code-line-almost-never-comes-up.test.mjs.
  it('is nowhere near the folder screen any more', () => {
    // The end of that screen used to be the row of counting dots and this read
    // up to them; the dots came off on 2026-08-25. What closes the folder step
    // now is the guard that opens the next one.
    // w-ec62ab6b38 (2026-09-28): the folder card is the recent-folders list now, not a bare fr-card.
    const card = walk.indexOf('<div className="fr-card fr-folders"');
    const end = walk.indexOf("run.step === 'name' &&", card);
    expect(card).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(card);
    expect(walk.slice(card, end)).not.toMatch(/claude\./);
  });
});

/* * THE COUNTING DOTS ARE GONE, AND FOUR TESTS WENT WITH THEM (2026-08-25). They held
 `dotsBottom`, which lifted the row of dots off the reply box on the one beat that draws
 one. The one thing the walk still draws over the app is the way out, and where THAT sits is
 held in tests/her-three-onboarding-fixes.test.mjs.
*/
