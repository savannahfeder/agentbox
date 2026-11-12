// THE INVITE STEP OPENS WITH THE CURSOR IN ITS FIRST BOX (w-1e52420829, 2026-11-12).
//
// Walking the setup by keyboard: "Invite your team." came up with the cursor
// nowhere, so the team's name was typed into nothing, and Enter answered "Name
// your team first." without going to the box. Every other step of the setup
// can be done without the mouse.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { inviteCursor } from '../renderer/src/setup-split.ts';

const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');

describe('where the cursor is when the invite step opens', () => {
  it('is the team’s name while there is no team', () => {
    expect(inviteCursor(false)).toBe('to-email');
  });
  it('is the email box once the team has a name, which has no name box to go to', () => {
    expect(inviteCursor(true)).toBe('add');
  });
  it('is put there on arrival, and only on the invite step', () => {
    expect(split).toMatch(/if \(step !== 'invite'\) return;\s*document\.querySelector<HTMLInputElement>\(`\.setup-split input\[data-ss-enter="\$\{inviteCursor\(!!p\.snap\?\.team\?\.team\)\}"\]`\)\?\.focus\(\);/);
  });
  it('goes back to the name when Enter finds it empty', () => {
    expect(split).toMatch(/setError\('Name your team first\.'\); document\.querySelector<HTMLInputElement>\('\.setup-split input\[data-ss-enter="to-email"\]'\)\?\.focus\(\); return;/);
  });
});
