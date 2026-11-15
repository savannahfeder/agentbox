// A WORD YOU CAN TAP ON THE PHONE IS ANNOUNCED AS A BUTTON.
//
// The reply box's sentence ("Medium priority. In Auto Mode. On Opus 5.5.")
// opens the priority, mode and model sheets from its underlined words
// (ui/parts.tsx `Pickable`). They were bare Text with onPress, so VoiceOver did
// not call them buttons, and two synthetic testers on 2026-11-08, who find
// what to tap by its role, logged that none of them could be tapped.
import fs from 'node:fs';
import path from 'node:path';
import { it, expect } from 'vitest';

it('the reply box\'s underlined words carry the button role', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'mobile', 'src', 'ui', 'parts.tsx'), 'utf8');
  const pickable = src.slice(src.indexOf('export function Pickable'), src.indexOf('export function Pickable') + 400);
  expect(pickable).toContain('onPress={onPress}');
  expect(pickable).toMatch(/\b(accessibilityRole|role)="button"/);
});
