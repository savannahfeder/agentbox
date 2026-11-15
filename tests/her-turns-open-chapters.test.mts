// A DIVIDER ONLY WHERE ONE OF HER TURNS BEGINS (w-250047ba5f, 2026-09-26).
//
// The rule for the chapters look: a new message from the agent does not get a
// divider; only a new turn from the user does. These pin exactly that, plus the
// two places a rule would be wrong even on the user's words: the top of the
// thread, and a second user message in a row.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { herTurnEnds, herTurnStarts } from '../renderer/src/her-turns.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const you = { who: 'you' };
const it_ = { who: 'it' };
const work = { kind: 'work' };
const run = { kind: 'run' };

describe('where her chapters start', () => {
  it('never puts a divider on the agent, however many messages it sends in a row', () => {
    expect(herTurnStarts([you, it_, it_, it_, work, it_])).toEqual([false, false, false, false, false, false]);
  });

  it('puts one above each turn of hers after the agent has spoken', () => {
    expect(herTurnStarts([you, it_, you, work, it_, you])).toEqual([false, false, true, false, false, true]);
  });

  it('does not rule off the first thing in the thread', () => {
    expect(herTurnStarts([you])).toEqual([false]);
    expect(herTurnStarts([work, you])).toEqual([false, true]);
  });

  it('treats her second message in a row as the same turn, even across work lines', () => {
    expect(herTurnStarts([it_, you, you])).toEqual([false, true, false]);
    expect(herTurnStarts([it_, you, run, you])).toEqual([false, true, false, false]);
  });

  it('starts a new chapter on the far side of the cut middle', () => {
    expect(herTurnStarts([you, you, it_], 0)).toEqual([false, true, false]);
  });

  // The first build ruled above the turn only. The dividers belong around the
  // user's turn, so the turn also has to close.
  it('closes her turn after her last message in a row, wherever the agent follows', () => {
    expect(herTurnEnds([you, it_, you, you, it_])).toEqual([true, false, false, true, false]);
    expect(herTurnEnds([it_, you, work, it_])).toEqual([false, true, false, false]);
    expect(herTurnEnds([it_, you, run])).toEqual([false, true, false]);
  });

  it('never closes on the agent, between two of hers, or under the last thing in the thread', () => {
    expect(herTurnEnds([it_, it_, work, it_])).toEqual([false, false, false, false]);
    expect(herTurnEnds([it_, you, work, you, it_])).toEqual([false, false, false, true, false]);
    expect(herTurnEnds([it_, you])).toEqual([false, false]);
  });

  it('closes at the cut middle, the mirror of the opening rule', () => {
    expect(herTurnEnds([you, you, it_], 0)).toEqual([true, true, false]);
  });

  it('is wired into the one conversation screen and styled with a theme line', () => {
    const thread = fs.readFileSync(path.join(root, 'renderer/src/components/Thread.tsx'), 'utf8');
    expect(thread).toMatch(/herTurnStarts\(nodes, cutAt\)/);
    expect(thread).toMatch(/turnStarts\[n\] \? 'turn'/);
    const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
    expect(css).toMatch(/\.msg\.turn \{[^}]*border-top: 1px solid var\(--line-strong\)/);
    expect(thread).toMatch(/turnEnds\[n\] \? 'turn-end'/);
    expect(css).toMatch(/\.msg\.turn-end \{[^}]*border-bottom: 1px solid var\(--line-strong\)/);
  });
});
