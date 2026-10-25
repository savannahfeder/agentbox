// A LONG PICKER ON THE PHONE APP SCROLLS INSIDE ITS SHEET, as the phone
// site's does.
//
// Codex's parity audit (finding 18): the site caps every picker sheet at 72%
// of the screen and scrolls inside it (phone.css `.tc-menu`); the app's sheet
// had neither, so with enough projects the list ran off the top of the screen
// and the ones up there could not be picked. The sheet is React Native, which
// these tests do not draw, so they read its source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync(new URL('../mobile/src/ui/parts.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
const sheet = parts.slice(parts.indexOf('export function Sheet('), parts.indexOf('export const SheetHead'));

describe('a picker sheet', () => {
  it('is no taller than the site\'s, 72% of the screen', () => {
    expect(css).toMatch(/\.tc-menu \{[^}]*max-height: 72vh; overflow-y: auto;/);
    expect(sheet).toMatch(/maxHeight: height \* 0\.72/);
  });

  it('scrolls its rows, padding and all, and a tap on a row works with the keyboard up', () => {
    expect(sheet).toMatch(/<ScrollView[^>]*keyboardShouldPersistTaps="handled"[^>]*contentContainerStyle=\{\{ paddingTop: 10, paddingHorizontal: 8, paddingBottom: 16 \+ inset\.bottom/);
  });
});
