// The power test of 2026-10-25 opened Settings > Claude Code and read "No
// usage reading yet" under a login used all afternoon. Opening the page had
// already started a usage read, which takes up to 30 seconds, but only a
// press of Refresh showed "Refreshing…": the page's own read looked like
// nothing at all. Measured by running the page's read against the stand-in
// Claude Code, which answers no usage request and so runs the full 30 s.
// Every read now shows as one, and a login with no figure yet says it is
// being read.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
const read = page.slice(page.indexOf('const readAccounts = useCallback('), page.indexOf('const readAccounts = useCallback(') + 400);

describe('reading each login\'s usage', () => {
  it('shows as a read in progress whether the page or Refresh started it', () => {
    expect(read).toMatch(/setRefreshing\(true\);\s*try \{/);
    expect(read).toMatch(/finally \{ setRefreshing\(false\); \}/);
    expect(read).not.toMatch(/if \(refresh\) setRefreshing/);
  });

  it('says a login with no figure yet is being read, rather than that it has none', () => {
    expect(page).toMatch(/if \(engine !== 'codex'\) return refreshing \? \{ \.\.\.tile, none: 'Reading its usage…' \} : tile;/);
  });
});
