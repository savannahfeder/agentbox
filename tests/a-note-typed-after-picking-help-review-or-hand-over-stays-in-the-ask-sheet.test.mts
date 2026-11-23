// Picking Help, Review or Hand over in the ask sheet left the keyboard on that button, so the
// note typed next went to the thread's reply box to the agent and the ask went out with none.
// Seen three times by one tester (issues 29 and 12); checked here on the key rule and its wiring.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { keyOnAnOpenThread } from '../renderer/src/reply-keys';

const read = (p: string) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');

it('a letter, a digit or punctuation is kept from the thread while an ask sheet is open over the thread', () => {
  for (const key of ['H', 'i', '1', '.', 'e', 'j']) {
    expect(keyOnAnOpenThread({ key, justChanged: false, sheetOpen: true })).toBe('the sheet');
    expect(keyOnAnOpenThread({ key, justChanged: false, hasOptions: true, stillTyping: true, sheetOpen: true })).toBe('the sheet');
  }
});

it('keys that are not typing still reach the window while the sheet is open', () => {
  for (const key of ['Escape', 'Enter', 'ArrowDown', 'Tab', ' ']) {
    expect(keyOnAnOpenThread({ key, justChanged: false, sheetOpen: true })).toBe('shortcut');
  }
});

it('with no sheet open a letter still goes to the reply box', () => {
  expect(keyOnAnOpenThread({ key: 'H', justChanged: false })).toBe('to the box');
  expect(keyOnAnOpenThread({ key: 'H', justChanged: false, sheetOpen: false })).toBe('to the box');
});

it('the app asks whether an ask sheet is open and drops the key when it is', () => {
  const app = read('App.tsx');
  expect(app).toMatch(/keyOnAnOpenThread\(\{[^}]*sheetOpen: !!document\.querySelector\('\.th-menu\[role="dialog"\]'\)/);
  expect(app).toMatch(/if \(means === 'the sheet'\) \{ e\.preventDefault\(\); return; \}/);
});

it('picking Help, Review or Hand over puts the keyboard in the note', () => {
  const sheet = read('threads/SharePanel.tsx');
  const give = sheet.slice(sheet.indexOf('export function GiveSheet'), sheet.indexOf('export function CopiedSheet'));
  expect(give).toMatch(/role="radio"[^\n]*onClick=\{\(\) => \{[^}]*noteBox\.current\?\.focus\(\)/);
  expect(give).toMatch(/<textarea ref=\{noteBox\} className="sh-note"/);
});
