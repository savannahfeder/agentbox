// A DOTTED WORD YOU CAN CHANGE IS A BUTTON ON THE PHONE.
//
// The 2026-11-07 phone workday (issue 1): "Opus 5.5" on New thread, and the
// same dotted word in every reply box, looked like a link and "did nothing".
// The picker opened on a real touch at its spot, but the word was plain text
// with a press handler, so neither the testers' `phone look` nor a screen
// reader could find it as something to tap. Measured with `phone look` in the
// preview: To, Project and Priority were listed, Model was not.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('Pickable', () => {
  const src = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
  const pickable = src.slice(src.indexOf('export function Pickable'), src.indexOf('export function Pickable') + 400);
  it('says it is a button', () => {
    expect(pickable).toMatch(/role="button"/);
  });
  // New thread's choices are chips since 2026-11-22, each one button that says what it is.
  it('is never inside another button, which the web build refuses as a button in a button', () => {
    const form = fs.readFileSync('mobile/src/ui/NewThreadForm.tsx', 'utf8');
    expect(form).not.toMatch(/<Pickable/);
    expect(form).toMatch(/<ChoiceButton said=\{`To: \$\{to\}`\} onPress=\{\(\) => setSheet\('to'\)\}/);
    expect(form).toMatch(/<ChoiceButton said=\{`Model: /);
    const chip = src.slice(src.indexOf('export function ChoiceButton('), src.indexOf('\n}\n', src.indexOf('export function ChoiceButton(')));
    expect(chip).toMatch(/accessibilityRole="button" accessibilityLabel=\{said\}/);
    expect(chip.match(/<Pressable/g)).toHaveLength(1);
  });
  it('stays text, so it can sit inside a sentence', () => {
    expect(pickable).toMatch(/<T onPress=/);
    expect(pickable).not.toMatch(/<Pressable/);
  });
});
