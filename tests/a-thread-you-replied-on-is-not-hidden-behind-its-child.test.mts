// An urgent thread with a fresh answer on it was in no list (w-2eb0e716dd,
// 2026-10-08). Its own rule put it in Needs you; a second rule then hid it,
// because an agent had spawned a thread from it and the user had put that one
// off for three days. On the real store 4 open rows were hidden this way, each
// ending in a question for the user.
//
// The user's call: a thread spawned from another is treated like any other
// thread. So nothing hides a thread because of the threads spawned from it,
// and the inbox is exactly the rows `belongsInInbox` says yes to.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as rules from '../renderer/src/list-rules';

const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

const SPLIT = 1791417867687;
const parent = {
  id: 'parent', status: 'open', kind: 'directive', labels: ['founder'],
  answer: 'still waiting for your answer here', answeredThrough: SPLIT + 1, result: 'a question back',
  wrote: { answer: { ts: SPLIT + 1, source: 'founder' }, result: { ts: SPLIT + 2, source: 'agent' } },
};

describe('a thread with a thread spawned from it', () => {
  it('belongs in Needs you by its own rule', () => {
    expect(rules.belongsInInbox(parent, { now: SPLIT + 3 })).toBe(true);
  });

  it('is not hidden by any rule about its children', () => {
    expect(rules.threadMasked).toBeUndefined();
    expect(rules.maskedAncestors).toBeUndefined();
    expect(app).not.toMatch(/threadMasked|maskedAncestors|hasChildHere/);
  });
});
