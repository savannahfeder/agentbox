// "it should be default visible tho, no advanced section" (2026-10-17, on a
// shot of the Instructions page with the System prompt folded behind an
// "Advanced" toggle). The System prompt card is shown under the instructions,
// with no toggle.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync(new URL('../renderer/src/components/InstructionSettings.tsx', import.meta.url), 'utf8');

describe('the Instructions page', () => {
  it('shows the System prompt card with no Advanced toggle', () => {
    expect(page).not.toMatch(/Advanced|showAdvanced|instruction-advanced-toggle/);
    expect(page).toMatch(/instr-card instr-card-ours"><SharedPart section=\{system\}\/>/);
  });
});
