// "2 Change something first" sent at once and moved on to the next thread.
//
// Both power testers hit it, one of them twice in the same session
// (power-test-1 issue 21, power-test-2 issue 30). The worker was handed "change
// something first" with nothing to change; one tester had to "press z fast or
// let it run". Their words: "that option is meaningless without my words".
//
// The narrow case only. An option that names the change is a whole instruction
// and still sends on one key, because a pick that opens a box instead of
// sending is the wrong surprise on an option that said enough.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closesTheTask, needsYourWords } from '../renderer/src/format.ts';

describe('options that say nothing on their own', () => {
  it('catches the one the testers pressed, as the strip drew it', () => {
    expect(needsYourWords('Change something first')).toBe(true);
    expect(needsYourWords('change something first')).toBe(true);
    expect(needsYourWords('Change something first.')).toBe(true);
    expect(needsYourWords('Change something first (recommended)')).toBe(true);
  });

  it('catches the ways the same offer gets worded', () => {
    for (const option of [
      'Change this part first', 'Tweak it first', 'Revise something',
      'Adjust this first', 'Fix a few things first', 'Something else',
    ]) expect(needsYourWords(option), option).toBe(true);
  });
});

describe('options that say enough', () => {
  it('leaves a change that names itself alone', () => {
    for (const option of [
      'Change the empty state copy first',
      'Change it to use the project colour',
      'Ship it',
      'Throw it away',
      'Ship it, then close the task',
      'Rework the migration to run in one pass',
    ]) expect(needsYourWords(option), option).toBe(false);
  });

  it('is a different question from the one that closes the thread', () => {
    expect(closesTheTask('Close this task')).toBe(true);
    expect(needsYourWords('Close this task')).toBe(false);
  });
});

// The pick is handled where every other pick is handled, and the option's own
// words go in as the first line, so sending without adding a word is exactly
// what pressing the number did before.
describe('what the pick does instead of sending', () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
  const pick = app.slice(app.indexOf('const pickOption'), app.indexOf('/* ------------------------ the task she just wrote'));

  it('opens the reply box rather than writing an answer', () => {
    expect(pick).toContain('if (needsYourWords(option.text))');
    const asks = pick.indexOf('if (needsYourWords(option.text))');
    expect(asks).toBeLessThan(pick.indexOf('api.answer('));
    expect(pick.slice(asks, pick.indexOf('api.answer('))).toContain("setModal('reply')");
  });

  it('keeps a draft already in the box rather than writing over it', () => {
    expect(pick).toContain('kept.trim() ? kept :');
  });

  // The key that opens a text field types itself into it otherwise: the box
  // read "2Change something first" in the built app (renderer/src/keys.ts
  // carries the first time this happened, with S).
  // AND IT IS SWALLOWED WHETHER THE PRESS PICKS OR IS HELD. The branch now
  // holds the key for a moment after the app moved you (pick-settles.ts,
  // F-31), and the held press would be the one that typed itself into the box.
  it('swallows the number that opened the box', () => {
    expect(app).toMatch(/else if \(\/\^\[1-9\]\$\/\.test\(e\.key\)\) \{\s*\n\s*e\.preventDefault\(\);/);
    expect(app).toMatch(/else if \(\/\^\[1-9\]\$\/\.test\(e\.key\)\) \{[\s\S]{0,400}pickOption\(focused, Number\(e\.key\)\);/);
  });
});
