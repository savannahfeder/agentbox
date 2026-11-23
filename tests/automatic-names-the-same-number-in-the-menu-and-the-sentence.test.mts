// AUTOMATIC NAMES THE SAME NUMBER IN THE MENU AND THE SENTENCE.
//
// Test day 2026-11-18: the startup tester set "How many run at once" to 2 and
// read "You set this. Automatic would run 1 on this computer." beside a menu
// offering "Automatic (2 agents)". The menu took `agentsTotal`, what the
// computer runs now, which is the number set by hand; the sentence took
// `agentsAutoTotal`, what Automatic would choose. With a number set, the menu
// now names what Automatic would choose too, and both Running pages use it.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { agentCountOptions } from '../renderer/src/components/Settings.tsx';

it('with a number set by hand, Automatic in the menu is what Automatic would run', () => {
  expect(agentCountOptions({ slotsMax: 12, agentsAuto: false, agentsTotal: 2, agentsAutoTotal: 1 })[0])
    .toEqual({ value: 'auto', label: 'Automatic (1 agent)' });
});

it('on Automatic, it is what runs now, as before', () => {
  expect(agentCountOptions({ slotsMax: 12, agentsAuto: true, agentsTotal: 3, agentsAutoTotal: 3 })[0].label).toBe('Automatic (3 agents)');
  expect(agentCountOptions({ slotsMax: 12, agentsTotal: 6 })[0].label).toBe('Automatic (6 agents)');
});

it('both Running pages build the menu with it', () => {
  const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
  expect(settings).not.toMatch(/label: `Automatic \(\$\{say\(w\.agentsTotal\)\}\)`/);
  expect(settings.match(/agentCountOptions\(/g)?.length).toBeGreaterThanOrEqual(3);
});
