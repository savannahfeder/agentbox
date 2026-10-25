// THE TOAST KEEPS CLEAR OF THE APPROVAL CARD'S BUTTONS.
//
// Found by a tester on the Linux box, 2026-10-23 (F-30): file a task whose
// agent asks for permission straight away, and the "Started in ..." toast lands
// on top of Allow and Deny until it goes. Both sit in the bottom right corner,
// and the toast is at z-index 310 against the card's 90, so the toast wins and
// the two buttons you are reaching for are under it. Photographed on this
// branch: the card at 440px wide, right 22 / bottom 22, and the toast at 360px
// wide, right 30 / bottom 30.
//
// It is the fault the composer already has a rule for, and NOT the same fix.
// The composer's toast goes to the top of the window because the dock grows
// with the draft, so no height is safe; and it can take the top because its own
// card is covering what is up there anyway. An approval card is a FIXED 440px
// wide and only grows downwards, so the place that is always clear is beside
// it, and taking the top would put a five-second toast over New thread instead.
// Photographed both ways in the built renderer at 1512x944 before choosing.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('renderer/src/styles.css');
const app = read('renderer/src/App.tsx');
const px = (rule, prop) => Number(rule.match(new RegExp(`${prop}:\\s*(\\d+)px`))?.[1] ?? NaN);

describe('the toast while an approval is waiting', () => {
  const rule = css.match(/\n\.app\.asking \.toast \{[^}]*\}/)?.[0] ?? '';

  it('stands beside the card rather than over it', () => {
    expect(rule).toMatch(/right:\s*480px/);
    // And stays at the bottom, which is where every other toast is read.
    expect(rule).not.toMatch(/bottom:/);
  });

  it('clears the whole card, measured off the card\'s own rule', () => {
    const card = css.match(/\n\.approvals \{[^}]*\}/)?.[0] ?? '';
    expect(px(card, 'width')).toBe(440);
    expect(px(card, 'right')).toBe(22);
    // Beside it with air between, not merely past its left edge.
    expect(px(rule, 'right')).toBeGreaterThan(px(card, 'right') + px(card, 'width'));
  });

  it('goes up instead when the window is too narrow to stand beside it', () => {
    const narrow = css.match(/@media \(max-width: 920px\) \{\s*\n\s*\.app\.asking \.toast \{[^}]*\}/)?.[0] ?? '';
    expect(narrow).toMatch(/bottom:\s*auto/);
    expect(narrow).toMatch(/top:\s*74px/);
    // 480 of offset and 360 of toast is 840, so 920 is the floor that fits.
    expect(px(css.match(/\n\.toast \{[\s\S]*?\n\}/)?.[0] ?? '', 'width')).toBe(360);
  });

  it('wears that class exactly while a card is on screen', () => {
    expect(app).toMatch(/cardOnScreen \? ' asking' : ''/);
    // Off the same queue the card itself is drawn from, so the two cannot
    // disagree about whether anything is being asked.
    expect(app).toMatch(/const stage = approvalStage\(/);
    expect(app).toMatch(/const cardOnScreen = !!stage\.card/);
    expect(app).toMatch(/const \{ card: a, verdict, waiting \} = stage;/);
  });
});
