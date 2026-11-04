// A REPEAT IN LATER OPENS FROM THE KEYBOARD, AND ONE TICKED ROW CAN REPEAT (w-8b637c7802).
//
// Round two of testers: a repeating task's row in Later could not be reached
// by Tab or opened with Enter, only clicked (two testers called it broken).
// And "every friday 5pm" typed in Later from the list, with one row ticked,
// read "not a time", though the same words worked from inside the thread: the
// box only took a rhythm when it was opened on an open thread. Measured on
// the rows' markup and the rule that picks the thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { oneToRepeat, opensOnKey } from '../renderer/src/repeat-from-thread.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('a repeating task’s row in Later', () => {
  it('is reached with Tab and named as something to press, in both lists that draw it', () => {
    const rows = read('renderer/src/components/List.tsx').match(/data-repeat-id=\{rule\.id\}[^>]*/g) ?? [];
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row).toMatch(/role="button" tabIndex=\{0\}/);
  });

  it('opens on Enter and Space, and the key goes no further', () => {
    let opened = 0, stopped = 0, held = 0;
    const press = opensOnKey(() => { opened += 1; });
    for (const key of ['Enter', ' ']) press({ key, preventDefault() { held += 1; }, stopPropagation() { stopped += 1; } });
    expect([opened, held, stopped]).toEqual([2, 2, 2]);
  });

  it('lets every other key by', () => {
    let opened = 0;
    opensOnKey(() => { opened += 1; })({ key: 'j', preventDefault() {}, stopPropagation() { throw new Error('stopped j'); } });
    expect(opened).toBe(0);
  });
});

describe('the thread a rhythm typed in Later makes repeat', () => {
  const row = { id: 'w-1' };
  it('is the open one', () => expect(oneToRepeat(row)).toBe(row));
  it('is the one ticked row', () => expect(oneToRepeat([row])).toBe(row));
  it('is none of several ticked rows', () => expect(oneToRepeat([row, { id: 'w-2' }])).toBe(null));
  it('is never an outside agent', () => {
    expect(oneToRepeat({ id: 'agent:1', agent: { name: 'claude' } })).toBe(null);
    expect(oneToRepeat([{ id: 'agent:1', agent: { name: 'claude' } }])).toBe(null);
  });
  it('is what the Later box is handed', () => {
    expect(read('renderer/src/App.tsx')).toMatch(/onRepeat=\{oneToRepeat\(snoozeItem\)/);
  });
});
