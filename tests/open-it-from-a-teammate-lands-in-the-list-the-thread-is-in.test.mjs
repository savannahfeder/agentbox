// The power test of 2026-10-25: with the Later tab last open, the founder
// pressed Open it on a teammate's card that said Waiting on you. The thread
// opened under "Later / ..." as "1 OF 20", though it was in Needs you, and
// she could not tell whether it was put off or waiting on her. Opening a
// thread from a teammate's chat kept whatever tab was up. It now moves to the
// tab the thread is in.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const { tabOfState } = await import('../renderer/src/threads/page-rules.ts');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('a thread opened from a teammate\'s chat', () => {
  it('opens in the tab that holds it', () => {
    expect(tabOfState('waiting')).toBe('inbox');
    expect(tabOfState('running')).toBe('progress');
    expect(tabOfState('scheduled')).toBe('snoozed');
    expect(tabOfState('done')).toBe('done');
    expect(tabOfState(null)).toBeNull();
  });

  it('is moved there by the teammates page\'s Open it', () => {
    const open = app.slice(app.indexOf('onOpenThread: (product, id) => {'), app.indexOf('onOpenThread: (product, id) => {') + 400);
    expect(open).toMatch(/const tab = tabOfState\(tabState\.get\(item\.id\) \?\? null\);\s*if \(tab\) setView\(tab\);/);
  });
});
