// THE PHONE'S SELECT BAR SAYS HOW MANY THREADS CLOSE CLOSES.
//
// The 2026-11-07 phone workday (issue 34): with two threads selected, the bar
// read "Cancel" and "Close", and Close beside Cancel read as "close this bar".
// A tester tapped it and closed both threads (Undo saved them). Measured in the
// phone preview: View and filters > Select threads > pick two.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { closeWords } from '../mobile/src/lib/tabs';

describe('the select bar', () => {
  it('names the threads', () => {
    expect(closeWords(2)).toBe('Close 2 threads');
    expect(closeWords(1)).toBe('Close 1 thread');
  });
  it('says only Close with nothing picked, when it cannot be pressed', () => {
    expect(closeWords(0)).toBe('Close');
  });
  it('is what the bar draws', () => {
    expect(fs.readFileSync('mobile/src/app/index.tsx', 'utf8')).toMatch(/closing \? 'Closing…' : closeWords\(picked\.size\)/);
  });
});
