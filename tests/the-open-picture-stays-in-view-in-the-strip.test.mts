// The open picture's thumbnail is never scrolled out of sight.
//
// What broke: "I do not know which one I have selected." With 28 thumbnails the
// row ran wider than the window and nothing scrolled the open one into view.
// Measured on the screenshot sent with the report: 28 thumbnails across the full
// width, the open one 26th. The thumbnail's own look was judged fine as it is;
// only where it sits changes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const view = fs.readFileSync(new URL('../renderer/src/components/PictureView.tsx', import.meta.url), 'utf8');

describe('the open thumbnail', () => {
  it('is scrolled to the middle of the row whenever the open picture changes', () => {
    const scroll = view.slice(view.indexOf('const row = strip.current'));
    expect(scroll).toMatch(/row\.scrollTo\(\{ left: on\.offsetLeft - \(row\.clientWidth - on\.offsetWidth\) \/ 2/);
    expect(scroll.slice(0, scroll.indexOf('}, [index]);') + 12)).toMatch(/\}, \[index\]\);$/);
  });

  it('is named as the current one for a screen reader', () => {
    expect(view).toMatch(/aria-current=\{i === index \|\| undefined\}/);
  });
});
