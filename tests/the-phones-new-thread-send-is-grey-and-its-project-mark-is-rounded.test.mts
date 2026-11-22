// The desktop's new thread card sends from a grey split button, the text
// colour at 15% with a split of the ground at 55% (thread-composer.css
// `.tc-send`), and its project mark is a round dot (`.tc-swatch i`). The
// phone's New thread form kept an orange Send with white words and a square
// mark. Found by the phone parity audit of 2026-11-21.
//
// 2026-11-22: the redesign made Send the round ink key every box on the phone
// sends from (a-new-thread-on-the-phone-starts-with-the-words). It is still
// not orange, and the mark is still round.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const form = fs.readFileSync('mobile/src/ui/NewThreadForm.tsx', 'utf8');
const css = fs.readFileSync('renderer/src/threads/thread-composer.css', 'utf8');
const send = form.slice(form.indexOf('export function SendButtons('), form.indexOf('\n}\n', form.indexOf('export function SendButtons(')));

describe("the phone's New thread form", () => {
  it('sends from a key that is not orange, with no colour typed into it', () => {
    expect(send).not.toMatch(/color\.accent/);
    expect(send).not.toMatch(/'#fff'/);
    expect(send).toMatch(/<SendKey /);
    // The key reads the palette while it draws, so a theme change reaches it (ui/theme.ts).
    const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
    const key = parts.slice(parts.indexOf('export function SendKey('), parts.indexOf('\n}\n', parts.indexOf('export function SendKey(')));
    expect(key).toMatch(/backgroundColor: color\.graphite/);
    expect(key).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
  // `--radius` is 6px, which on a 9px mark clamps to a round dot.
  it('marks the project with the round dot the desktop draws', () => {
    expect(css).toMatch(/\.tc-swatch i \{ width: 9px; height: 9px;[^}]*border-radius: var\(--radius\)/);
    expect(form).toMatch(/const Swatch = [^\n]*width: 9, height: 9, borderRadius: 4\.5,/);
  });
});
