// ENTER ON A FOCUSED BUTTON IN THE SETUP PRESSES THAT BUTTON (w-fbe5e95dea, 2026-11-10).
//
// A fourth-round tester tabbed to Back and pressed Enter, and the setup went
// forward. The rest of this file was the old practice tutorial starting on a
// plain list; that tutorial is gone (2026-11-21).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');

describe('the setup and a focused button', () => {
  it('lets Enter on a focused button press that button', () => {
    expect(split).toMatch(/inSetup && enterIsTheButtons\(e\)\) return;/);
  });
});
