// Reading back through a thread while its agent works, the page kept jumping,
// and a film playing in an earlier message closed itself and landed you
// somewhere else in the thread.
//
// Every block on the page, and every fold you had opened, was named by its
// position in the list the thread draws. That list is a window: past 200 steps
// it drops the oldest step each time the agent does something, and past 40
// messages it drops the oldest kept message. So one new step renumbered every
// block, React rebuilt the whole page (a playing film starts over on its
// poster), and the open folds pointed at different runs, so heights changed
// above you. Measured here by running the real window over a 200-step thread
// and adding one step: every block's old name changed.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { threadWindow, groupWork } from '../shared/agents.mts';
import { lineIds, blockKeys } from '../renderer/src/thread-keys.ts';

const T0 = Date.UTC(2026, 10, 4, 20, 0);
const said = (k, who = 'it') => ({ at: T0 + k * 1000, who, text: `message ${k}` });
const step = (k) => ({ kind: 'work', at: T0 + k * 1000, verb: 'ran', subject: `command ${k}`, output: '', lines: 0, failed: false });

/** A conversation of `messages` messages, each followed by `per` steps. */
function thread(messages, per) {
  const out = [];
  let k = 0;
  for (let m = 0; m < messages; m += 1) {
    out.push(said(k++, m === 0 ? 'you' : 'it'));
    for (let s = 0; s < per; s += 1) out.push(step(k++));
  }
  return { events: out, next: k };
}

/** What the thread draws: the window, then runs folded, then each block's name. */
function drawn(events) {
  const { events: shown } = threadWindow(events);
  const ids = lineIds(shown);
  const nodes = groupWork(shown.map((e, i) => ({ ...e, i })), { min: 1 });
  const keys = blockKeys(nodes, ids);
  // What each block holds, so the same block can be found in two drawings.
  const holds = nodes.map((x) => (x.kind === 'run' ? `run>${x.items[x.items.length - 1].subject}` : x.text ?? x.subject));
  return { keys, holds, ids, shown };
}

function sameBlocksKeepTheirNames(before, after) {
  let compared = 0;
  before.holds.forEach((h, n) => {
    const m = after.holds.indexOf(h);
    if (m < 0) return;
    compared += 1;
    expect(after.keys[m], `block "${h}"`).toBe(before.keys[n]);
  });
  return compared;
}

describe('a block keeps its name while the agent adds to the thread', () => {
  it('past 200 steps, one more step renames nothing still on the page', () => {
    const { events, next } = thread(30, 8); // 240 steps, so the oldest are being dropped
    const before = drawn(events);
    const after = drawn([...events, said(next), step(next + 1)]);
    expect(sameBlocksKeepTheirNames(before, after)).toBeGreaterThan(20);
  });

  it('past 40 messages, one more message renames nothing still on the page', () => {
    const { events, next } = thread(45, 2);
    const before = drawn(events);
    const after = drawn([...events, said(next)]);
    expect(sameBlocksKeepTheirNames(before, after)).toBeGreaterThan(30);
  });

  it('under both limits, adding to the end renames nothing either', () => {
    const { events, next } = thread(5, 3);
    const before = drawn(events);
    const after = drawn([...events, said(next), step(next + 1)]);
    expect(sameBlocksKeepTheirNames(before, after)).toBe(before.keys.length);
  });

  it('a run the agent is still adding to keeps its name, so it stays open', () => {
    const { events, next } = thread(5, 3);
    const before = drawn(events);
    const after = drawn([...events, step(next)]);
    expect(after.keys.length).toBe(before.keys.length);
    expect(after.keys.at(-1)).toBe(before.keys.at(-1));
    expect(after.keys).toEqual(before.keys);
  });

  it('never gives two blocks or two steps the same name', () => {
    // Steps written by one reply of the agent share a moment, and so can two runs of the same command.
    const twin = { ...step(3), subject: 'command 2', at: T0 + 2000 };
    const events = [said(0, 'you'), step(1), step(2), twin, said(4), step(5), said(6, 'you'), said(7)];
    const { keys, ids } = drawn(events);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives a new block a name nothing on the page had', () => {
    const { events, next } = thread(5, 3);
    const before = drawn(events);
    const after = drawn([...events, said(next)]);
    const fresh = after.keys[after.holds.indexOf(`message ${next}`)];
    expect(before.keys).not.toContain(fresh);
  });
});

describe('the thread names its blocks and folds by that rule', () => {
  const source = fs.readFileSync(new URL('../renderer/src/components/Thread.tsx', import.meta.url), 'utf8');

  it('keys each block by its name, not by where it sits in the list', () => {
    expect(source).toMatch(/blockKeys\(/);
    expect(source).not.toMatch(/key=\{`\$\{e\.at\}-\$\{key\}-\$\{n\}`\}/);
  });

  it('remembers open folds and steps by name, not by position', () => {
    expect(source).toMatch(/useState<Set<string>>/);
    expect(source).toMatch(/useState<Map<string, number>>/);
  });
});
