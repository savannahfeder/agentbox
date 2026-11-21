// A LONG OPTION IN A TEAMMATE CHAT STAYS INSIDE ITS BUTTON.
//
// A power tester (2026-11-16) saw a teammate's option, "Review wording and
// endpoint needs together", wrap to two lines that ran above and below its
// border. `.tq-chip` had a fixed 30px height, so any label wider than the chat
// column spilled out. Measured by reading the rule; the one-line chip keeps its
// 30px.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/teammates/teammates.css', import.meta.url), 'utf8');
const rule = css.match(/\n\.tq-chip \{([^}]*)\}/)?.[1] ?? '';

describe('a teammate chat option button', () => {
  it('grows to fit a label that wraps', () => {
    expect(rule).not.toMatch(/(^|[;\s])height:/);
    expect(rule).toMatch(/min-height:\s*30px/);
  });

  it('keeps wrapped lines inside its padding', () => {
    expect(rule).toMatch(/padding:\s*\d+px 12px/);
    expect(rule).not.toMatch(/padding:\s*0 12px/);
  });
});
