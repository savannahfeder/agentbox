// THE BUTTONS UNDER AN ANSWER STAY INSIDE THE COLUMN (w-f702d60afe, 2026-11-21).
//
// A walk-through measured "Send back to agent" and "Ask for help or a review"
// ending 27px past the reply box's right edge on a narrow column. They wrap.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');

describe('.focus-actions', () => {
  it('wraps rather than running past the column', () => {
    expect(css).toMatch(/\n\.focus-actions \{\n  display: flex;\n  flex-wrap: wrap;/);
  });
});
