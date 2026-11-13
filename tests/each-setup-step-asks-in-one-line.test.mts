// EACH SETUP STEP ASKS IN ONE LINE (w-fbe5e95dea, 2026-11-10).
//
// The founder cut the grey second line from the chats step ("too much text,
// rows go over etc looks messy") and from the account step ("feels too
// cluttered"). Walking every screen in both themes afterwards, the invite,
// AI teammates, look and finished steps still carried one, so the setup read
// two ways. Every step but the folder one, whose second line says agents can
// change the files, now has a heading alone, short enough for one line.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PRO_PITCH } from '../renderer/src/setup-split.ts';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
const heads = [...split.matchAll(/head = \['([^']*)', '([^']*)'\];/g)].map((m) => ({ ask: m[1], under: m[2] }));

describe('the headings of the setup', () => {
  it('are found, one per step', () => {
    expect(heads.map((h) => h.ask)).toEqual([
      'Add your recent agents.',
      'Pick a folder for your first project.',
      'Pick a plan.',
      'Invite your team.',
      'Add your own AI teammates.',
      'Pick your look.',
      'You’re set up.',
    ]);
  });
  it('have no second line, except where it warns that agents change your files', () => {
    for (const h of heads) {
      if (h.ask.startsWith('Pick a folder')) expect(h.under).toBe('Agents can read and change the files in it.');
      else expect(h.under).toBe('');
    }
  });
  it('fit on one line of the steps column', () => {
    for (const h of heads.filter((x) => !x.under)) expect(h.ask.length).toBeLessThanOrEqual(26);
  });
  it('include the purchase page’s, from its own words, alone and on one line', () => {
    expect(split).toMatch(/head = \[PRO_PITCH\.head, ''\];/);
    expect(PRO_PITCH.head.length).toBeLessThanOrEqual(28);
  });
  it('still say the AI teammates are yours, not the team’s', () => {
    expect(heads.find((h) => /AI teammates/.test(h.ask))!.ask).toMatch(/your own/);
  });
});
