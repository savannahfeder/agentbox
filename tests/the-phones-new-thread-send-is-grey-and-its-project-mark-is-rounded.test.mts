// The desktop's new thread card sends from a grey split button, the text
// colour at 15% with a split of the ground at 55% (thread-composer.css
// `.tc-send`), and its project mark is a round dot (`.tc-swatch i`). The
// phone's New thread form kept an orange Send with white words and a square
// mark. Found by the phone parity audit of 2026-11-21.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const form = fs.readFileSync('mobile/src/ui/NewThreadForm.tsx', 'utf8');
const css = fs.readFileSync('renderer/src/threads/thread-composer.css', 'utf8');
const send = form.slice(form.indexOf('export function SendButtons('), form.indexOf('\n}\n', form.indexOf('export function SendButtons(')));

describe("the phone's New thread form", () => {
  it('sends from the grey button the desktop draws', () => {
    expect(css).toMatch(/--send-fill: color-mix\(in srgb, var\(--text\) 15%, transparent\)/);
    expect(send).not.toMatch(/color\.accent/);
    expect(send).not.toMatch(/'#fff'/);
    expect(send).toMatch(/backgroundColor: SEND_FILL/);
    // Inside the button: a theme change rewrites `color` in place (ui/theme.ts).
    expect(send).toMatch(/const SEND_FILL = `\$\{color\.text\}26`/);
    expect(send).toMatch(/const SEND_SPLIT = `\$\{color\.bg\}8c`/);
    expect(send).toMatch(/<Caret tint=\{color\.text\} \/>/);
  });
  // `--radius` is 6px, which on a 9px mark clamps to a round dot.
  it('marks the project with the round dot the desktop draws', () => {
    expect(css).toMatch(/\.tc-swatch i \{ width: 9px; height: 9px;[^}]*border-radius: var\(--radius\)/);
    expect(form).toMatch(/const Swatch = [^\n]*width: 9, height: 9, borderRadius: 4\.5,/);
  });
});
