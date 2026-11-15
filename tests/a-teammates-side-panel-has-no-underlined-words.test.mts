// "The way we have underlined text on the right sidebar doesn't really vibe
// with me. I think that might make it a little bit weak." (2026-10-25). The
// side panel's Model and Works in values kept the composer's dotted underline
// through every redesign after that, because the menus are the composer's own
// (`compose-word`). In the panel the value is plain text with a small chevron
// that says it opens, as the round-6 picture drew "Opus 5.5, high ⌄".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/teammates/teammates.css', import.meta.url), 'utf8');

describe('a value you can change in the teammate side panel', () => {
  it('has no underline, in the panel only', () => {
    expect(css).toMatch(/\.tq-details \.compose-word \{[^}]*text-decoration: none;/);
    expect(css).not.toMatch(/(^|\n)\.compose-word \{/);
  });

  it('carries a small chevron instead, so it still reads as a menu', () => {
    expect(css).toMatch(/\.tq-details \.compose-word::after \{[^}]*border-right: 1\.25px solid currentColor;[^}]*transform: rotate\(45deg\)/);
  });
});
