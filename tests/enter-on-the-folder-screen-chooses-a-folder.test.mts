// ENTER ON THE FOLDER SCREEN CHOOSES A FOLDER (w-fbe5e95dea, 2026-11-10).
//
// A round-six tester ran "Set Agentbox up again" and pressed Enter on "Pick a
// folder for your first project", twice: nothing happened and no row showed a
// key. Nothing was lit until an arrow was pressed. With nothing lit, Enter
// now opens Choose a folder, which only opens the picker, and that row shows ↵.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const ob = fs.readFileSync(new URL('../renderer/src/components/Onboarding.tsx', import.meta.url), 'utf8');

describe('the folder screen with nothing lit', () => {
  it('takes Enter as Choose a folder', () => {
    expect(ob).not.toMatch(/if \(e\.key === 'Enter' && lit < 0\) \{ e\.preventDefault\(\); return; \}/);
    expect(ob).toMatch(/if \(e\.key === 'Enter' && lit < 0\) \{ e\.preventDefault\(\); pickFolder\(\); return; \}/);
  });
  it('draws ↵ on Choose a folder', () => {
    expect(ob).toMatch(/\{\(lit === \(recent\?\.length \?\? 0\) \|\| lit < 0\) && <Cap cap="↵" \/>\}/);
  });
});
