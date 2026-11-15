// THE SHIP CARD CATCHES UP WITH A COMMIT THE LAST RUN MADE (F-161).
//
// QA, 2026-10-29: a first task stopped on the git identity question, the tester
// replied with a name and email, and the agent said "Committed the initials
// helper ... Commit 6b58c90". The card under it still read "Git does not know
// who you are, so this change was never committed" with "Commit it and ship"
// recommended, and only minutes later turned into "Ship it".
//
// The run's result reaches the row before the folder is read back on the git
// thread, and the pane stopped reading the folder the moment the run ended, so
// it kept the standing from the round before until something else touched the
// row. Now it keeps reading for two minutes after a result.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { FOLDER_SETTLES_MS, folderMayStillMove } from '../renderer/src/ship-offer.ts';

const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
const NOW = 9_000_000;
const ended = (ago) => ({ result: 'Committed.', wrote: { result: { ts: NOW - ago } } });

describe('the folder a finished run worked in', () => {
  it('is still read just after the result lands', () => {
    expect(folderMayStillMove(ended(0), NOW)).toBe(true);
    expect(folderMayStillMove(ended(30_000), NOW)).toBe(true);
    expect(folderMayStillMove(ended(FOLDER_SETTLES_MS - 1), NOW)).toBe(true);
  });

  it('is left alone once it has had time to settle', () => {
    expect(folderMayStillMove(ended(FOLDER_SETTLES_MS), NOW)).toBe(false);
    expect(folderMayStillMove(ended(60 * 60_000), NOW)).toBe(false);
  });

  it('is not read again for a row no run has answered on', () => {
    expect(folderMayStillMove({}, NOW)).toBe(false);
    expect(folderMayStillMove({ result: 'x' }, NOW)).toBe(false);
  });
});

describe('the pane', () => {
  it('keeps reading the change after the run ends, not only while it runs', () => {
    expect(focus).toContain('const settling = !!session || folderMayStillMove(item, Date.now());');
    expect(focus).toContain('if (!settling) return () => { live = false; };');
    expect(focus).toContain('const settled = session ? null : setTimeout(() => clearInterval(timer), FOLDER_SETTLES_MS);');
    expect(focus).not.toContain('if (!session) return () => { live = false; };');
  });
});
