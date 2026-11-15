// THE REPLY BOX'S PRIORITY, MODE AND MODEL ARE THREE BUTTONS ON THE PHONE.
//
// QA batch 014 (M-47, Android, 2026-11-10): the accessibility tree held one
// plain, non-clickable text, "Medium priority. In Auto Mode. On opus.", and a
// tap where "opus" sat opened nothing. The three words were presses on spans
// nested inside one Text, and Android folds nested Text into a single view, so
// neither a screen reader nor a tester's tap could reach the model. Measured
// from the UI dumps in that report; pinned here on the composer's source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
const composer = page.slice(page.indexOf('function Dock('), page.indexOf('function Summary('));

describe("the reply box's choices", () => {
  it('are each a ChoiceButton that names what it changes', () => {
    expect(composer).toMatch(/<ChoiceButton[^>]*said=\{`Priority: /);
    expect(composer).toMatch(/<ChoiceButton[^>]*said=\{`Mode: /);
    expect(composer).toMatch(/<ChoiceButton[^>]*said=\{`Model: /);
    expect(composer).toMatch(/setSheet\('priority'\)/);
    expect(composer).toMatch(/setSheet\('mode'\)/);
    expect(composer).toMatch(/setSheet\('model'\)/);
  });
  it('no longer sit as presses inside one text', () => {
    expect(composer).not.toMatch(/<Pickable/);
  });
});

describe('ChoiceButton', () => {
  const button = parts.slice(parts.indexOf('export function ChoiceButton'), parts.indexOf('export function ChoiceButton') + 700);
  it('is a pressable view of its own, a button, with its own label', () => {
    expect(button).toMatch(/<Pressable/);
    expect(button).toMatch(/accessibilityRole="button"/);
    expect(button).toMatch(/accessibilityLabel=\{said\}/);
  });
});
