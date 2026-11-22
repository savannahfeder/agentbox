// THE PHONE'S FIRST SCREENS ARE SOFT AND THE MAIN BUTTON IS INK (2026-11-22).
// Sign-in and the first run had 8px-cornered outlined buttons and fields, a
// sans heading, and an orange slab for the main button with near-black words
// on it, the desktop's sign-in page at phone width. Part of "a redesign of
// everything". Measured by reading ui/Onboarding.tsx and ui/Field.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const first = fs.readFileSync('mobile/src/ui/Onboarding.tsx', 'utf8');
const field = fs.readFileSync('mobile/src/ui/Field.tsx', 'utf8');
const fn = (name: string) => first.slice(first.indexOf(`export function ${name}(`), first.indexOf('\n}\n', first.indexOf(`export function ${name}(`)));

describe('a first-run screen', () => {
  it('is headed large and heavy', () => {
    expect(fn('Head')).toMatch(/fontFamily: font\.semibold, fontSize: 3\d/);
  });
  it('takes its corners from the phone\'s own, not a pair of its own', () => {
    expect(first).not.toMatch(/export const CORNER/);
    expect(field).not.toMatch(/CORNER/);
  });
});

describe('a button on a first-run screen', () => {
  const btn = fn('Btn');
  it('is a pill 54 tall with no outline', () => {
    expect(btn).toMatch(/height: 54, borderRadius: corner\.pill/);
    expect(btn).not.toMatch(/borderWidth/);
  });
  it('is ink when it is the main one, so the orange stays for what is live', () => {
    expect(btn).toMatch(/kind === 'primary' \? color\.graphite/);
    expect(btn).toMatch(/kind === 'primary' \? color\.ink/);
    expect(btn).not.toMatch(/color\.accent|#1a1817/);
  });
  it('is still dimmed while it cannot be pressed', () => {
    expect(btn).toMatch(/opacity: disabled \? 0\.[34]/);
  });
});

describe('a field you type in', () => {
  it('is a soft filled box 54 tall, ringed in ink while you are in it', () => {
    expect(field).toMatch(/height: 54/);
    expect(field).toMatch(/borderRadius: corner\.small \+ 4/);
    expect(field).toMatch(/borderColor: focused \? color\.text : 'transparent'/);
  });
  it('can still show a password', () => {
    expect(field).toMatch(/accessibilityLabel=\{shown \? 'Hide password' : 'Show password'\}/);
  });
});
