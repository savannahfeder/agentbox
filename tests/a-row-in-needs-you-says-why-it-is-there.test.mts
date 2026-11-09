// A ROW IN NEEDS YOU SAYS WHY IT IS THERE.
//
// Three people trying the inbox layouts on 2026-11-02 each stopped at the same
// thing: four of five Needs you rows had an empty Status column, so they could
// not tell "the agent finished, look at it" from "the agent is stuck", and
// went looking for a finished thread under Done. The column was left empty on
// purpose, because "Waiting on you" only repeats the tab. A thread whose agent
// answered now says Answered there; a teammate's words still say Waiting on you.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cellUnderTab } from '../renderer/src/threads/page-rules.ts';

describe('the Status word under a tab', () => {
  it('says Answered for an agent thread waiting on you in Needs you', () => {
    expect(cellUnderTab('Waiting on you', 'inbox', { fromPeople: false })).toBe('Answered');
    expect(cellUnderTab('Waiting', 'inbox', { fromPeople: false })).toBe('Answered');
  });

  it('keeps Waiting on you for a teammate who is waiting on you', () => {
    expect(cellUnderTab('Waiting on you', 'inbox', { fromPeople: true })).toBe('Waiting on you');
  });

  it('still drops In progress under the In progress tab, and leaves other words alone', () => {
    expect(cellUnderTab('In progress', 'progress', { fromPeople: false })).toBeNull();
    expect(cellUnderTab('Stopped', 'inbox', { fromPeople: false })).toBe('Stopped');
  });

  it('is what the inbox row draws', () => {
    expect(fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/threads/Pages.tsx'), 'utf8')).toMatch(/cellUnderTab\(worded\.word, tab, \{ fromPeople: !!waits \|\| peopleWaitOnYou \}\)/);
  });
});
