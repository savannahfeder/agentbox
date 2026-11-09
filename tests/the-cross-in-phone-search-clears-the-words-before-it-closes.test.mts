// THE CROSS IN PHONE SEARCH CLEARS THE WORDS BEFORE IT CLOSES.
//
// The 2026-11-07 phone workday (issue 28): after a search found nothing, a
// tester typed again and got "lead listfounders", because the only cross
// closed search and nothing emptied the box; she had to close search and open
// it again. Measured in the phone preview: Search, type, look for a way to
// clear.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('the cross in search', () => {
  const src = fs.readFileSync('mobile/src/app/search.tsx', 'utf8');
  it('empties the box and keeps the cursor in it while there are words', () => {
    expect(src).toMatch(/if \(!q\) \{ router\.back\(\); return; \}\n\s*setQ\(''\); setAll\(false\); box\.current\?\.focus\(\);/);
    expect(src).toMatch(/<TextInput ref=\{box\}/);
  });
  it('says which it will do', () => {
    expect(src).toMatch(/onPress=\{cross\} accessibilityLabel=\{q \? 'Clear search' : 'Close search'\}/);
  });
});
