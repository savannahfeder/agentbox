// A RELOAD SWEEPS A PRACTICE PROJECT NOTHING IS USING (w-fbe5e95dea, 2026-11-10).
//
// Reloading the window mid-tutorial left its practice threads in Needs you and
// In progress with nothing to end them; only a relaunch swept them. The old walk
// was resumed after a reload; it is gone (2026-11-21), so the first snapshot after
// a load sweeps any practice project the walkthrough is not running on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const practice = { slug: 'practice', practice: true };

describe('the first snapshot after a load', () => {
  const at = app.indexOf('const sweptPractice = useRef(false);');
  const effect = app.slice(at, at + 900);
  it('sweeps a practice project no walkthrough is running', () => {
    expect(effect).toMatch(/if \(!snap \|\| sweptPractice\.current\) return;/);
    expect(effect).toMatch(/snap\.products\.some\(\(p\) => p\.practice\)/);
    expect(effect).toMatch(/api\.firstRunPracticeEnd\(\)/);
  });
});
