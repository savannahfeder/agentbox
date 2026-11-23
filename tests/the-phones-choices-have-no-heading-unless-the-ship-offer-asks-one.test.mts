// On a thread's page the desktop draws the agent's numbered choices bare: the
// card has a heading only when it is the app's own ship offer with a question
// of its own (Focus.tsx `bare={!shipAsk?.headed}`, `ask = shipAsk ? shipAsk.ask
// : askLine`). The phone headed every choice card with the agent's question,
// which mostly repeated the bold answer right above it ("Three versions of the
// inbox are in the folder below…" twice on one screen). Found by the phone
// parity audit of 2026-11-21, beside the desktop's phone layout.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const focus = fs.readFileSync('renderer/src/components/Focus.tsx', 'utf8');
const thread = fs.readFileSync('mobile/src/lib/thread.ts', 'utf8');

describe("the phone's choices", () => {
  it('are bare on the desktop unless the ship offer is headed', () => {
    expect(focus).toMatch(/bare=\{!shipAsk\?\.headed\}/);
    expect(focus).toMatch(/const ask = shipAsk \? shipAsk\.ask : askLine;/);
  });
  it('take a heading only from a headed ship offer, never from the agent\'s question', () => {
    expect(thread).toMatch(/ask: shipAsk\?\.headed \? shipAsk\.ask : '',/);
    expect(thread).not.toMatch(/ask: live \? askHeading\(item\)/);
  });
});
