// THE STUCK-AGENT WARNING AGREES WITH THE ROW THAT SAYS ANSWERED (w-34443a206b).
//
// A tester on 2026-11-22 pressed L on a thread whose Needs you row said
// Answered, and the Later box said "This agent is waiting on your answer".
// Both were about the same thread: the row means the agent has answered and
// offers a pick, which is exactly when the warning fires. Read side by side,
// "Answered" and "waiting on your answer" said opposite things. The warning
// now says the agent has answered and waits on you, in the row's own word.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stoppedWaiting, stoppedWarning } from '../renderer/src/stopped-agent.ts';
import { asksForYourWords, cellUnderTab } from '../renderer/src/threads/page-rules.ts';

const offered = {
  id: 'w-offer', product: 'p',
  result: '**Ship it?**\n\n## Options\n1. Ship it (recommended)\n2. Change the headline first',
  wrote: { result: { ts: 2 } },
};

describe('a thread stopped on a pick', () => {
  it('is the row that says Answered, and the one the warning is for', () => {
    expect(cellUnderTab('Waiting on you', 'inbox', { fromPeople: false, asks: asksForYourWords(offered) })).toBe('Answered');
    expect(stoppedWaiting(offered)).toBe(true);
  });

  it('is warned about in words that agree with Answered', () => {
    for (const key of ['E', 'L'] as const) {
      const said = stoppedWarning(key);
      expect(said).not.toMatch(/your answer/);
      expect(said).toMatch(/has answered and waits on you/);
      expect(said).toMatch(/leaves it stuck/);
    }
  });

  // Drawn on 2026-11-23: the toast's one line cut it at "waits on you, …".
  it('is drawn whole, its line wrapping rather than cut', () => {
    const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
    expect(read('renderer/src/App.tsx')).toMatch(/\$\{toast\.goes\.warns \? ' toast-warns' : ''\}/);
    expect(read('renderer/src/styles.css')).toMatch(/\.toast-warns \.toast-line \{ white-space: normal; \}/);
  });

  it('still names what each key costs', () => {
    expect(stoppedWarning('E', { pressAgain: false })).toBe('This agent has answered and waits on you, so marking it done leaves it stuck.');
    expect(stoppedWarning('L', { pressAgain: false })).toBe('This agent has answered and waits on you, so putting it off leaves it stuck.');
  });
});
