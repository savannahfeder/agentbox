// A CLOSE QUESTION YOU CANNOT SEE DOES NOT EAT YOUR KEYS (w-23de8a26c0).
//
// "I keep hitting e, n and other shortcuts on this thread and nothing happens."
// E on a thread with a filed task still waiting raised "Before this closes"
// (w-d2744c6daa) at the foot of the conversation. They had scrolled up, so it
// came up off screen, and while it was up App.tsx's key handler returned on
// every key: N, R, J, K and E itself all did nothing, with no sign why.
// Measured by reading the handler: the `if (asking)` branch ended in a bare
// `return` after its own six keys.
//
// Now the question takes only the keys it answers with, everything else does
// what it always does, and each time a close raises it the pane brings it
// into view, so a second E points at it instead of doing nothing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { closeAskOwnsKey } from '../renderer/src/close-asks-first.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the keys the close question takes', () => {
  it('takes the keys that answer it: the numbers, the arrows, Enter and esc', () => {
    for (const k of ['1', '2', '3', '9', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape']) {
      expect(closeAskOwnsKey(k), k).toBe(true);
    }
  });

  it('leaves every other shortcut to do what it does on any thread', () => {
    for (const k of ['e', 'E', 'n', 'N', 'r', 'R', 'j', 'k', 'l', 'z', 'Z', 's']) {
      expect(closeAskOwnsKey(k), k).toBe(false);
    }
  });

  it('does not take 0, which is not one of its options, or the side arrows', () => {
    expect(closeAskOwnsKey('0')).toBe(false);
    expect(closeAskOwnsKey('ArrowLeft')).toBe(false);
    expect(closeAskOwnsKey('ArrowRight')).toBe(false);
  });
});

describe('where it is wired', () => {
  const app = read('renderer/src/App.tsx');
  const focus = read('renderer/src/components/Focus.tsx');

  it('asks the rule before the question takes a key, so the rest fall through', () => {
    expect(app).toMatch(/if \(asking && closeAskOwnsKey\(e\.key\)\) \{/);
  });

  it('counts each time a close raises the question, even on the same thread', () => {
    expect(app).toMatch(/setCloseAskRaised\(\(n\) => n \+ 1\)/);
    expect(app).toMatch(/raised: closeAskRaised/);
  });

  it('brings the question into view each time it is raised', () => {
    expect(focus).toMatch(/closeAskRef\.current\?\.scrollIntoView\(/);
    expect(focus).toMatch(/\}, \[closeAsk\?\.raised\]\);/);
    expect(focus.match(/stripRef=\{closeAskRef\}/g)?.length).toBe(2);
  });
});
