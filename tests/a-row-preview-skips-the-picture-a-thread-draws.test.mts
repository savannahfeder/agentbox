// An answer that shows a picture names it on a line of its own, and the thread
// draws that line as the picture. The inbox row's preview printed it as text:
// "Per seat, or one flat price per team? designs/what-each-team-would-pay.png
// All three trial teams…" (seen in the demo copy's inbox, 2026-11-24).
import { describe, expect, it } from 'vitest';
import { previewText, searchText } from '../renderer/src/format.ts';

describe('a row preview', () => {
  it('leaves out a line that is only a picture, wherever it sits', () => {
    expect(previewText('**Per seat?**\n\ndesigns/what-each-team-would-pay.png\n\nAll three teams expected it.')).toBe('Per seat? All three teams expected it.');
    expect(previewText('Done.\n\nshots/after.jpeg')).toBe('Done.');
    expect(previewText('  designs/a.webp  \nThe rest')).toBe('The rest');
  });

  it('keeps a picture named inside a sentence, and a file that is not a picture', () => {
    expect(previewText('I saved designs/a.png beside the others.')).toBe('I saved designs/a.png beside the others.');
    expect(previewText('Open\nnotes/plan.md')).toBe('Open notes/plan.md');
  });

  it('while search still finds the picture by its name', () => {
    expect(searchText('Look\n\ndesigns/what-each-team-would-pay.png')).toContain('what-each-team-would-pay.png');
  });
});
