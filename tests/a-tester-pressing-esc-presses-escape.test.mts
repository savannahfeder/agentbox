// A TESTER PRESSING "esc" PRESSES ESCAPE.
//
// Test day 2026-11-18: the startup tester ran `app press esc` in an open
// reply and logged that Escape "inserted esc in the reply composer". cdp.mjs
// knew a key only by its exact name (Escape), so any other word was typed
// as letters. Short names a person writes now mean their key, and a word that
// names no key is refused instead of typed.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { keyNamed } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

it('reads the names a person writes for a key', () => {
  expect(keyNamed('esc')).toBe('Escape');
  expect(keyNamed('ESC')).toBe('Escape');
  expect(keyNamed('return')).toBe('Enter');
  expect(keyNamed('down')).toBe('ArrowDown');
  expect(keyNamed('space')).toBe(' ');
});

it('keeps exact names and single characters as they are', () => {
  expect(keyNamed('Escape')).toBe('Escape');
  expect(keyNamed('ArrowDown')).toBe('ArrowDown');
  expect(keyNamed('n')).toBe('n');
  expect(keyNamed('N')).toBe('N');
});

it('names no key for a word that is not one', () => {
  expect(keyNamed('escp')).toBeNull();
  expect(keyNamed('hello')).toBeNull();
});

it("the tester's press refuses a word that is not a key rather than typing it", () => {
  const browse = fs.readFileSync(new URL('../.claude/skills/verify-agentbox/scripts/browse.mjs', import.meta.url), 'utf8');
  const press = browse.slice(browse.indexOf("verb === 'press'"), browse.indexOf("verb === 'pressat'"));
  expect(press).toMatch(/const named = keyNamed\(key \?\? ''\);/);
  expect(press).toMatch(/await t\.press\(named, mods\);/);
});
