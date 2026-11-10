// A RELOAD MID-TUTORIAL TAKES THE PRACTICE THREADS AWAY (w-fbe5e95dea, 2026-11-10).
//
// Driving a copy through the tutorial and reloading the window on the answer
// step: the tutorial was gone, and its five practice threads stayed in Needs
// you and In progress with nothing to end them. Only a relaunch of the app
// swept them (Store.init). The first snapshot after a load with no tutorial
// running now sweeps them too.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('the first snapshot after a load', () => {
  it('sweeps a practice project no tutorial is running', () => {
    const at = app.indexOf('const sweptPractice = useRef(false);');
    expect(at).toBeGreaterThan(-1);
    const effect = app.slice(at, at + 700);
    expect(effect).toMatch(/if \(!snap \|\| sweptPractice\.current\) return;/);
    expect(effect).toMatch(/snap\.products\.some\(\(p\) => p\.practice\)/);
    expect(effect).toMatch(/!run && !forcedRun\.current/);
    expect(effect).toMatch(/api\.firstRunPracticeEnd\(\)/);
  });
});
