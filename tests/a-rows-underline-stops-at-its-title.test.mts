// A ROW'S UNDERLINE STOPS AT ITS TITLE (w-f702d60afe, 2026-11-20).
//
// The founder, on a shared thread in the inbox: "The underline is a little
// weird here because it breaks at the icon." The selected row's underline is
// a text decoration on `.subject`. The marks after the title were plain inline
// boxes, so the line ran under the title, skipped the people icon (a picture
// takes no decoration) and picked up again under the count beside it. Read in
// the screenshot of the inbox with "Add an idempotency key to POST /payments"
// shared with one person: the line broke at the icon and went on under "1".
//
// A decoration is not drawn into an inline-block, so every mark is one, and
// the line ends where the title does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const rule = (sel: string) => {
  const m = new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[2] : '';
};

describe("the marks after a row's title", () => {
  for (const mark of ['.th-lock', '.th-shared', '.th-shared-n', '.th-pin']) {
    it(`${mark} is an inline-block, so the underline is not drawn under it`, () => {
      expect(rule(mark)).toMatch(/display:\s*inline-block/);
    });
  }

  it('the title itself still carries the underline', () => {
    const styles = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
    expect(styles).toMatch(/\.row \.subject \{\s*text-decoration: underline/);
  });
});
