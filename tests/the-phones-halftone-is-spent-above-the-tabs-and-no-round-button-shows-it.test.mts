// THE PHONE'S HALFTONE IS SPENT ABOVE THE TABS AND NO ROUND BUTTON SHOWS IT
// (2026-11-22). On the iPhone 17 simulator the Light inbox's orange dots ran
// through "Chats" and "Files" and below them: the halftone was a 220pt square
// from the top, while the tabs start at the status bar plus the 56pt top bar
// (118pt there). The sliders button, at rest in the translucent `fill`, let
// the dots show through it beside the solid search, new-thread and settings
// buttons. Measured on screenshots of the running build.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f: string) => fs.readFileSync(f, 'utf8');
const cut = (src: string, from: string) => src.slice(src.indexOf(from), src.indexOf('\n}\n', src.indexOf(from)));
const wall = cut(read('mobile/src/ui/parts.tsx'), 'export function Wall(');
const filters = read('mobile/src/ui/Filters.tsx');

describe('the Light halftone', () => {
  const svg = wall.slice(wall.indexOf('color.halftone > 0'));
  it('ends where the tabs begin: the status bar and the top bar, on any phone', () => {
    expect(svg).toMatch(/<Svg style=\{\{ position: 'absolute', top: 0, right: 0 \}\} width=\{HALFTONE\} height=\{inset\.top \+ size\.topBar\}/);
  });
  it('is not a fixed square that runs past the tabs', () => {
    expect(svg).not.toMatch(/height=\{HALFTONE\}/);
  });
  it('fades over its own box, so the page colour is whole at its lower edge', () => {
    expect(svg).toMatch(/<RadialGradient id="f" cx="1" cy="0" r="1">/);
    expect(svg).not.toMatch(/gradientUnits="userSpaceOnUse"/);
  });
});

describe('the sliders button', () => {
  const button = cut(filters, 'export function ViewButton(');
  it('is solid at rest, as the other round buttons are', () => {
    expect(button).toMatch(/backgroundColor: open \? color\.graphite : pressed \? color\.picked : color\.round/);
    expect(button).not.toMatch(/color\.fill/);
  });
  it('leaves a choice inside the view sheet its soft fill: the sheet has no halftone under it', () => {
    expect(cut(filters, 'function Choice(')).toMatch(/pressed \? color\.picked : color\.fill/);
  });
});
