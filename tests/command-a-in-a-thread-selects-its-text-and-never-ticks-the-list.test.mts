// ⌘A IN A THREAD SELECTS WHAT YOU ARE READING. IT NEVER TICKS THE INBOX.
//
// w-d52ec5ee91: with a thread open and a .txt file beside it, the agent's
// answer said "select all, copy". ⌘A closed the thread, went back to the
// inbox and ticked every row. App.tsx's chord read `setFocused(null)` and then
// ticked `list`, on purpose ("works from inside a focused task too"), and
// nothing checked what was on screen. Read off App.tsx at 558b49da.
//
// This repo has no jsdom, so the rule runs on stand-ins and the wiring is read
// from source, as the ⌘F tests do.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandATicksTheList, partToSelect } from '../renderer/src/select-all';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

const nothingOpen = { threadOpen: false, repeatOpen: false, cardOpen: false };

describe('whether ⌘A ticks the list', () => {
  it('ticks it when the list is what is on screen', () => {
    expect(commandATicksTheList(nothingOpen)).toBe(true);
  });
  it('does not with a thread open', () => {
    expect(commandATicksTheList({ ...nothingOpen, threadOpen: true })).toBe(false);
  });
  it('does not with a repeating task open', () => {
    expect(commandATicksTheList({ ...nothingOpen, repeatOpen: true })).toBe(false);
  });
  it("does not with a teammate's card open", () => {
    expect(commandATicksTheList({ ...nothingOpen, cardOpen: true })).toBe(false);
  });
});

describe('what ⌘A selects in a thread', () => {
  const file = { name: 'file' };
  const talk = { name: 'conversation' };
  const holds = (which: object | null) => (p: object) => p === which;

  it('the open file, when nothing is selected yet', () => {
    expect(partToSelect([file, talk], holds(null))).toBe(file);
  });
  it('the conversation, when the selection is already in it', () => {
    expect(partToSelect([file, talk], holds(talk))).toBe(talk);
  });
  it('the file, when the selection is already in it', () => {
    expect(partToSelect([file, talk], holds(file))).toBe(file);
  });
  it('the conversation, when no file is open', () => {
    expect(partToSelect([null, talk], holds(null))).toBe(talk);
  });
  it('nothing, when there is nothing to read', () => {
    expect(partToSelect([null, null], holds(null))).toBe(null);
  });
});

describe('the wiring in App.tsx', () => {
  const start = app.indexOf("e.key.toLowerCase() === 'a' && !inInput && !modal");
  const chord = app.slice(start, app.indexOf('\n      }\n', start));

  it('asks what is on screen before ticking anything', () => {
    expect(start).toBeGreaterThan(-1);
    expect(chord).toContain('commandATicksTheList({ threadOpen: !!focused, repeatOpen: !!focusedRepeat, cardOpen: !!openCard })');
  });
  it('no longer closes the thread to get at the list', () => {
    expect(chord).not.toContain('setFocused(null)');
  });
  it('selects the text you are reading otherwise', () => {
    expect(chord).toContain('selectWhatYouAreReading(document)');
  });
});
