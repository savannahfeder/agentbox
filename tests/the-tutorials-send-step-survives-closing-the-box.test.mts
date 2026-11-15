// THE TUTORIAL'S SEND STEP SURVIVES CLOSING THE BOX (w-fbe5e95dea, 2026-11-10).
//
// A third-round tester pressed Escape on the tutorial's "Press Cmd Enter or
// click Send" step: the New thread box closed, the card still said to send,
// and N, the key that opens the box, was held by the walk because it was not
// the key the card named. Stuck. With the box shut, the card says to press N
// and N is the key it waits for; the draft is kept, so the box reopens with it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { coach } from '../renderer/src/onboarding.ts';

describe("the tutorial's send step", () => {
  it('asks for Cmd Enter while the box is open', () => {
    expect(coach('task', 0, { composing: true })?.key).toBe('⌘↵');
  });
  it('asks for N once the box has been closed', () => {
    expect(coach('task', 0, { composing: false })?.key).toBe('N');
  });
  it('is told whether the box is open, by both callers', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const ob = fs.readFileSync(new URL('../renderer/src/components/Onboarding.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/coach\(run\.step, 0, \{[^}]*composing: modal === 'compose'/);
    expect(app).toMatch(/composing=\{modal === 'compose'\}/);
    expect(ob).toMatch(/coach\(run\.step, [^)]*\{[^}]*composing,/);
  });
});
