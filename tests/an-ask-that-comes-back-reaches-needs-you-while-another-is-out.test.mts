// AN ASK THAT COMES BACK REACHES NEEDS YOU WHILE ANOTHER IS OUT (2026-11-21).
//
// Sam asked Theo for a review and Ben for help on one thread. Theo answered
// "Needs changes", and his hand-back was held on the thread for Sam's yes,
// but the thread stayed in In progress reading "Ben is helping": any open ask
// on a thread kept it out of Needs you, so Theo's request waited unseen until
// Ben handed back too. Found by a code review of the shipped Ask or hand off,
// read off the window's list rules. Now a thread holding a hand-back for you
// is not "asked out", whoever else still has an ask on it.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { heldForHer } from '../shared/answers.mts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

it('leaves a thread holding a hand-back for you out of the asked-out set', () => {
  expect(app).toContain('return a && askIsOpen(r) && !(thread && heldForHer(thread)) ? [a.thread] : [];');
});

it('a hand-back carried onto the thread is held for her, and her reply releases it', () => {
  const held = { status: 'blocked', answer: 'Theo reviewed this and asked for changes.', wrote: { answer: { ts: 200, source: 'system', from: 'Theo', teammate: 'theo' }, status: { ts: 201, source: 'system' } } };
  expect(heldForHer(held)).toBe(true);
  const replied = { ...held, status: 'open', wrote: { ...held.wrote, answer: { ts: 300, source: 'founder' }, status: { ts: 300, source: 'founder' } } };
  expect(heldForHer(replied)).toBe(false);
});
