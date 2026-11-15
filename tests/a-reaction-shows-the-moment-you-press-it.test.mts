// A REACTION SHOWS THE MOMENT YOU PRESS IT.
//
// Reported 2026-10-05 (w-45cbac227a): "When I react to any message, there's a
// delay before the emoji registers ... It normally should be immediate." The
// chip was drawn only from the row itself, so a press waited on the whole
// round: the write to the ledger, a sync with the team cloud (zero:team-react
// awaits team.syncNow()), the push that tells the page something changed, and
// a fresh snapshot of every row. Only then did the chip appear.
//
// Now the press is drawn at once, over what the row says, and kept until the
// row agrees with it. If the press fails it is dropped, so the chip goes back
// to what is really stored rather than claim a reaction nobody else can see.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { press, withPresses, stillWaiting } from '../renderer/src/team/reactions-now.ts';

const ME = 'p-me', MAYA = 'p-maya';

describe('your press, drawn before the row has it', () => {
  it('adds you to a chip at once', () => {
    expect(withPresses({}, [{ on: 'u-1', emoji: '👍', off: false }], ME)).toEqual({ 'u-1': { '👍': [ME] } });
  });

  it('joins a chip other people are already on, after them', () => {
    const row = { 'u-1': { '👍': [MAYA] } };
    expect(withPresses(row, [{ on: 'u-1', emoji: '👍', off: false }], ME)).toEqual({ 'u-1': { '👍': [MAYA, ME] } });
  });

  it('takes yours back at once, and a chip nobody is left on goes', () => {
    const row = { 'u-1': { '👍': [ME], '🎉': [MAYA, ME] } };
    const shown = withPresses(row, [{ on: 'u-1', emoji: '👍', off: true }, { on: 'u-1', emoji: '🎉', off: true }], ME);
    expect(shown).toEqual({ 'u-1': { '🎉': [MAYA] } });
  });

  it('never counts you twice on a chip the row already has you on', () => {
    const row = { 'u-1': { '👍': [ME] } };
    expect(withPresses(row, [{ on: 'u-1', emoji: '👍', off: false }], ME)).toEqual(row);
  });

  it('leaves the row it was given untouched', () => {
    const row = { 'u-1': { '👍': [MAYA] } };
    withPresses(row, [{ on: 'u-1', emoji: '👍', off: false }], ME);
    expect(row).toEqual({ 'u-1': { '👍': [MAYA] } });
  });

  // THE CASE THAT MUST NOT CHANGE: with nothing pressed, the row is drawn as is.
  it('draws the row as it is when nothing is waiting', () => {
    const row = { 'u-1': { '👍': [MAYA] } };
    expect(withPresses(row, [], ME)).toBe(row);
    expect(withPresses(undefined, [], ME)).toBeUndefined();
  });
});

describe('pressing the same chip again before the row catches up', () => {
  it('keeps only the newest press on that chip, so on then off reads as off', () => {
    const one = press([], { on: 'u-1', emoji: '👍', off: false });
    const two = press(one, { on: 'u-1', emoji: '👍', off: true });
    expect(two).toEqual([{ on: 'u-1', emoji: '👍', off: true }]);
    expect(withPresses({}, two, ME)).toEqual({});
  });

  it('keeps presses on other chips and other messages', () => {
    const a = press([], { on: 'u-1', emoji: '👍', off: false });
    const b = press(a, { on: 'u-1', emoji: '🎉', off: false });
    const c = press(b, { on: 'u-2', emoji: '👍', off: false });
    expect(c).toHaveLength(3);
  });
});

describe('letting go of a press once the row has it', () => {
  const on = { on: 'u-1', emoji: '👍', off: false };
  const off = { on: 'u-1', emoji: '👍', off: true };

  it('drops a press the row now agrees with', () => {
    expect(stillWaiting([on], { 'u-1': { '👍': [ME] } }, ME)).toEqual([]);
    expect(stillWaiting([off], {}, ME)).toEqual([]);
  });

  it('keeps a press the row has not caught up with', () => {
    expect(stillWaiting([on], {}, ME)).toEqual([on]);
    expect(stillWaiting([off], { 'u-1': { '👍': [ME] } }, ME)).toEqual([off]);
  });

  // A teammate on the same chip is not you.
  it('keeps your press when only somebody else is on the chip', () => {
    expect(stillWaiting([on], { 'u-1': { '👍': [MAYA] } }, ME)).toEqual([on]);
  });

  it('hands back the same list when nothing landed, so nothing redraws', () => {
    const list = [on];
    expect(stillWaiting(list, {}, ME)).toBe(list);
  });
});

describe('the conversation draws from it', () => {
  const src = fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');
  it('feeds the chat and the thread panel the same drawn reactions, and sends through one place', () => {
    expect(src).toMatch(/useReactionsNow\(/);
    expect(src).not.toMatch(/reactions:\s*item\.reactions/);
    expect(src).not.toMatch(/reactions=\{item\.reactions\}/);
  });
});
