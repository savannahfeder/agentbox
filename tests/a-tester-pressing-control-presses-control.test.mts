// A TESTER PRESSING CONTROL PRESSES CONTROL.
//
// In the power test of 2026-11-02 a tester on Linux typed `app press Enter
// control` to send a reply and `app press k control` for the command bar.
// browse.mjs kept only the words meta, shift, ctrl and alt, so it dropped
// "control", pressed a bare Enter and a bare k, and still answered "Pressed
// control+Enter." Two issues were logged against the app ("the send button says
// Ctrl+Enter but Ctrl+Enter does not send") for keys that were never pressed.
// The usual names for each key now work, and a word that names no key is
// refused instead of dropped.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readModifiers } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

describe('a tester pressing control presses control', () => {
  it('control, as the tester typed it, is Ctrl', () => {
    expect(readModifiers(['control'])).toEqual({ mods: ['ctrl'], unknown: [] });
    expect(readModifiers(['Control'])).toEqual({ mods: ['ctrl'], unknown: [] });
  });

  it('the short names still work, and the Mac names mean the Mac keys', () => {
    expect(readModifiers(['meta', 'shift', 'ctrl', 'alt']).mods).toEqual(['meta', 'shift', 'ctrl', 'alt']);
    expect(readModifiers(['cmd']).mods).toEqual(['meta']);
    expect(readModifiers(['command']).mods).toEqual(['meta']);
    expect(readModifiers(['option']).mods).toEqual(['alt']);
    expect(readModifiers([]).mods).toEqual([]);
  });

  it('a word that names no key is refused, never dropped', () => {
    expect(readModifiers(['ctrl', 'hyper'])).toEqual({ mods: ['ctrl'], unknown: ['hyper'] });
    const browse = fs.readFileSync(new URL('../.claude/skills/verify-agentbox/scripts/browse.mjs', import.meta.url), 'utf8');
    expect(browse).toMatch(/readModifiers\(/);
    expect(browse).not.toMatch(/mods\.filter\(\(m\) => \['meta', 'shift', 'ctrl', 'alt'\]/);
  });
});
