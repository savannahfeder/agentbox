// WHAT SHE TYPES INTO A REPEATING TASK IS WHAT TOMORROW'S SESSION IS TOLD.
//
// A repeating task whose instruction could not be changed got ended rather than
// fixed, less than a minute after the problem was noticed.
//
// The box that answers it is in RepeatFocus, and the sentence under that box
// says "Every run after this one reads this." This file is why that sentence is
// allowed to be there. `main/repeats.mjs` briefs each run with
// `rule.body ?? rule.title`, and nothing but this test stops a later edit from
// caching the brief at creation, which would leave the box changing a screen
// and not a run.
//
// The label is checked in the same breath. The pane saves the ONE message she
// typed and lets `splitMessage` derive the title again, so a rule whose
// instruction changed and whose Scheduled row still says the old thing is the
// failure this guards.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Repeats } from '../main/repeats.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { splitMessage, joinMessage } from '../renderer/src/message-split';
import { NAME } from '../shared/product-name.mjs';

let dir, repeats, mods;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-edit-'));
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'p', name: 'P' }));
  mods = await loadStore();
  repeats = new Repeats(mods);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();
const MADE = at(2026, 8, 9, 9);

// Exactly what the pane does when she presses Save: split the one message the
// box holds, and patch both halves.
const saveTheBox = (id, message, now) => {
  const { title, body } = splitMessage(message);
  return repeats.patchRule(dir, id, { title, body }, now);
};

describe('changing a repeating task', () => {
  it('brief tomorrow morning is what she typed today', async () => {
    const made = repeats.setRule(dir, {
      title: 'Every morning, check overnight signups',
      body: 'Every morning, check overnight signups\nAgainst yesterday.',
      every: 'day', at: '09:00',
    }, MADE);

    // She opens it, types a line at the end of what is there, saves.
    const box = joinMessage(repeats.get(dir, made.id, MADE));
    saveTheBox(made.id, `${box}\nAnd against last Monday.`, at(2026, 8, 10, 12));

    // The next morning runs.
    const key = '2026-08-11';
    const { occurrenceId, created } = await repeats.serve(dir, made.id, key, at(2026, 8, 11, 9));
    expect(created).toBe(true);
    const run = mods.workItemsDisk.readWorkItem(dir, occurrenceId, at(2026, 8, 11, 9));
    expect(run.body).toContain('And against last Monday.');
    expect(run.body).toContain('Against yesterday.');
  });

  it('leaves the row saying what the task now does', () => {
    const made = repeats.setRule(dir, {
      title: 'Every morning, check overnight signups',
      body: 'Every morning, check overnight signups\nAgainst yesterday.',
      every: 'day', at: '09:00',
    }, MADE);
    saveTheBox(made.id, 'Every morning, check overnight cancellations\nAgainst yesterday.', at(2026, 8, 10, 12));
    expect(repeats.get(dir, made.id, at(2026, 8, 10, 13)).title)
      .toBe('Every morning, check overnight cancellations');
  });

  it('keeps the schedule, so changing the words never moves the hour', () => {
    const made = repeats.setRule(dir, { title: 'Check signups', body: 'daily', every: 'day', at: '08:00' }, MADE);
    saveTheBox(made.id, 'Check signups\nand cancellations', at(2026, 8, 10, 12));
    const after = repeats.get(dir, made.id, at(2026, 8, 10, 13));
    expect(after.at).toBe('08:00');
    expect(after.every).toBe('day');
    expect(after.createdAt).toBe(MADE);
  });

  it('does not lose a word of a paragraph she dictated in one breath', () => {
    // The shape of her own: past the title budget, so the title is a sentence
    // clipped out of a body that holds everything.
    const dictated = 'Can you keep a short list of my goals for this week and show it to me every morning so I can check it? '
      + 'I already set the recurrence. Main goal: Finish the onboarding copy.';
    const { title, body } = splitMessage(dictated);
    const made = repeats.setRule(dir, { title, body, every: 'day', at: '08:00' }, MADE);
    const box = joinMessage(repeats.get(dir, made.id, MADE));
    expect(box).toBe(dictated);
    saveTheBox(made.id, `${box} And ${NAME} is the one that matters.`, at(2026, 8, 10, 12));
    const back = joinMessage(repeats.get(dir, made.id, at(2026, 8, 10, 13)));
    expect(back).toBe(`${dictated} And ${NAME} is the one that matters.`);
  });
});
