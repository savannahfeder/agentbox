// THE COUNTS ON THE INBOX'S TABS SIT ON THE SAME LINE AS THEIR WORDS (2026-10-28).
//
// On the web app on a phone, "in menu the numbers are misaligned": each tab's
// count floated up beside its word like a small raised number. The tabs had
// moved to the top that day, but each tab still centred its word and its count
// as two boxes, and a smaller box centred beside a larger one sits high.
// Measured in Chrome at 402px with the iPhone's text a step up: the count's
// baseline was 2px above the word's (1px at the default size). The phone app,
// and the desktop's own tabs, set the count on the word's line.
//
// So the phone's tabs line the two up by their baseline, and centre that line
// in the bar's 44px with a line height, as the desktop's tabs do in theirs.
// After: 0px apart at both text sizes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync('renderer/src/phone.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const phone = css.slice(css.indexOf('@media (max-width: 700px), (max-height: 520px)'));
const rules = [...phone.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
const last = (piece, prop) => {
  const body = rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
  const all = [...body.matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))];
  return all.length ? all[all.length - 1][1].trim() : undefined;
};

describe("a tab's count on the web app on a phone", () => {
  it("sits on its word's line, not centred beside it", () => {
    expect(last('.tm-tab', 'align-items')).toBe('baseline');
  });
  it('and that line is centred in the 44px bar, so the word does not move', () => {
    // 42px: the tab's 44px less its 2px mark at the foot.
    expect(last('.tm-tab', 'height')).toBe('100%');
    expect(last('.tm-tab', 'line-height')).toBe('42px');
  });
  it("keeps the count's own box from stretching the line", () => {
    expect(last('.tm-tab b', 'line-height')).toBe('1');
  });
  it('leaves the desktop tabs as they were, already on one line', () => {
    const team = fs.readFileSync('renderer/src/team/team.css', 'utf8');
    expect(team).toMatch(/\.tm-tab \{[^}]*align-items: baseline/);
  });
});
