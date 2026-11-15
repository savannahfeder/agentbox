// A SLIDE-SHAPED PDF HAS A STRIP OF ITS SLIDES.
//
// The same deck opened as a .pptx had every slide small in a strip
// under it, and opened as a PDF had none, so a reviewer of the PDF could only
// step one slide at a time to find slide 9. Measured in PdfPages: no strip of
// any kind.
//
// The strip shows for a PDF of two pages or more, drawn small with the same Page,
// and pressing one goes to it. That holds for a portrait one too.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripFor } from '../renderer/src/artifact-pins.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('when a PDF has the strip', () => {
  it('has it when fitted and wider than tall, with two slides or more', () => {
    expect(stripFor({ fit: true, landscape: true, count: 2 })).toBe(true);
    expect(stripFor({ fit: true, landscape: true, count: 30 })).toBe(true);
  });
  it('not for one slide', () => {
    expect(stripFor({ fit: true, landscape: true, count: 1 })).toBe(false);
  });
  it('for a portrait document too, but not one read as wide as the pane', () => {
    expect(stripFor({ fit: true, landscape: false, count: 12 })).toBe(true);
    expect(stripFor({ fit: false, landscape: true, count: 12 })).toBe(false);
  });
});

describe('the wiring', () => {
  const pdf = read('renderer/src/components/PdfPages.tsx');
  it('draws each page small in the same strip the deck view uses, and goes to the one pressed', () => {
    expect(pdf).toMatch(/stripFor\(/);
    expect(pdf).toContain('deck-strip');
    expect(pdf).toContain('deck-thumb');
    expect(pdf).toMatch(/onClick=\{\(\) => go\(i \+ 1\)\}/);
  });
});
