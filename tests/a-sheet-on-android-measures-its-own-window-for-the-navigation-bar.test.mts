// A SHEET ON ANDROID MEASURES ITS OWN WINDOW FOR THE NAVIGATION BAR.
//
// QA batch 014 (M-36, Android 11, 2026-11-07): the model sheet's only row sat
// under the navigation bar, 8 px of it on screen. The UI dump puts the sheet's
// bottom at the screen's bottom with no room for the bar. React Native draws a
// modal as its own edge-to-edge window on Android, and the sheet's bottom room
// came from the insets read outside that window. react-native-safe-area-context
// asks for a provider at the root of each modal; this pins it on the sheet.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const sheet = parts.slice(parts.indexOf('export function Sheet('), parts.indexOf('export const SheetHead'));

describe('Sheet', () => {
  it('gives its body a safe-area provider of its own on Android', () => {
    expect(sheet).toMatch(/Platform\.OS === 'android' \? <SafeAreaProvider>\{body\}<\/SafeAreaProvider>/);
  });
  it('reads its bottom room inside the modal, not outside it', () => {
    const outer = sheet.slice(0, sheet.indexOf('function SheetBody'));
    const inner = sheet.slice(sheet.indexOf('function SheetBody'));
    expect(outer).not.toMatch(/useSafeAreaInsets\(\)/);
    expect(inner).toMatch(/useSafeAreaInsets\(\)/);
    expect(inner).toMatch(/paddingBottom: 16 \+ inset\.bottom/);
  });
});
