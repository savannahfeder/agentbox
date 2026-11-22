// A SHEET ON THE PHONE RISES OVER THE KEYBOARD AND DRAGS FROM ITS HANDLE.
//
// What broke (iOS Simulator, 2026-11-22): in the Later sheet a tap on the
// typed-time box brought the keyboard up over the box, the typing and every
// preset, because the only keyboard room was a KeyboardAvoidingView inside the
// sheet's own scroll view, which cannot move the sheet. And a drag that started
// on the grab handle did nothing: nothing under the handle answers a touch, so
// iOS never offered the move to the sheet; a drag from a row did work. Read from
// the Sheet in ui/parts.tsx and TypingSheet in ui/Later.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const body = parts.slice(parts.indexOf('function SheetBody('), parts.indexOf('export const SheetHead'));
const later = fs.readFileSync('mobile/src/ui/Later.tsx', 'utf8');
const typing = later.slice(later.indexOf('export function TypingSheet('), later.indexOf('export function TimeBox('));

describe('a sheet and the keyboard', () => {
  it('stands the whole sheet on the keyboard, outside its scroll view', () => {
    const avoid = body.indexOf('<KeyboardAvoidingView');
    expect(avoid).toBeGreaterThan(-1);
    expect(avoid).toBeLessThan(body.indexOf('<ScrollView'));
    expect(body).toMatch(/<KeyboardAvoidingView behavior="padding" pointerEvents="box-none"/);
  });
  it('lets a tap above the sheet still reach the dimmed screen that closes it', () => {
    expect(body.indexOf('accessibilityLabel="Close"')).toBeLessThan(body.indexOf('<KeyboardAvoidingView'));
  });
  it('shrinks the sheet to the room left over the keyboard instead of running off the top', () => {
    expect(body).toMatch(/flexShrink: 1/);
  });
  it('no longer leans on a keyboard view inside the scroll', () => {
    expect(typing).not.toMatch(/KeyboardAvoidingView/);
  });
});

describe('the grab handle', () => {
  it('takes the touch itself, so a drag that starts on it moves the sheet', () => {
    expect(body).toMatch(/onStartShouldSetPanResponder: \(\) => true/);
    const handle = body.slice(body.indexOf('{...grip.panHandlers}'), body.indexOf('width: 36, height: 5'));
    expect(handle.length).toBeGreaterThan(0);
  });
  it('does not take a touch that starts on a row, which stays a press', () => {
    const rows = body.slice(body.indexOf('const pan = '), body.indexOf('const grip = '));
    expect(rows).not.toMatch(/onStartShouldSetPanResponder/);
  });
});
