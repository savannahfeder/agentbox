// A LONG DOCUMENT GETS AN OUTLINE OF ITS HEADINGS.
//
// A markdown file opened beside a thread or big was one column of text with no
// way to see its shape or jump to a section: the Lumen handbook (nine sections,
// four subsections) had to be scrolled end to end to find "On call". Measured
// in the app: no outline anywhere, on either surface. These hold the rules the
// outline is drawn from, and which section is lit as she scrolls.
import { describe, it, expect } from 'vitest';
import { outlineOf, outlineShows, sectionAt } from '../renderer/src/doc-outline';

const h = (level, text) => ({ level, text });

describe('the outline is built from the headings', () => {
  it('leaves the title out and keeps sections and their subsections, in order', () => {
    const out = outlineOf([h(1, 'Lumen handbook'), h(2, 'Getting started'), h(2, 'The booking engine'), h(3, 'Time zones'), h(2, 'Payments')]);
    expect(out).toEqual([
      { at: 1, depth: 0, text: 'Getting started' },
      { at: 2, depth: 0, text: 'The booking engine' },
      { at: 3, depth: 1, text: 'Time zones' },
      { at: 4, depth: 0, text: 'Payments' },
    ]);
  });

  it('points each entry at its own heading, so a click lands on the right one', () => {
    const out = outlineOf([h(2, 'One'), h(4, 'Too deep'), h(2, 'Two')]);
    expect(out.map((e) => e.at)).toEqual([0, 2]);
  });

  it('does not list a fourth level, an empty heading, or extra spaces', () => {
    expect(outlineOf([h(2, '  Plans   and prices '), h(2, '   '), h(4, 'Small print')]))
      .toEqual([{ at: 0, depth: 0, text: 'Plans and prices' }]);
  });

  it('takes the shallowest level it has as the top, when a document starts at h3', () => {
    expect(outlineOf([h(3, 'A'), h(3, 'B')]).map((e) => e.depth)).toEqual([0, 0]);
  });

  it('keeps a second h1 as a section, since only the first is the title', () => {
    expect(outlineOf([h(1, 'Title'), h(1, 'Appendix'), h(2, 'Glossary')]).map((e) => [e.text, e.depth]))
      .toEqual([['Appendix', 0], ['Glossary', 1]]);
  });
});

describe('only a document with somewhere to go gets one', () => {
  it('shows with three sections, not with two', () => {
    expect(outlineShows(outlineOf([h(2, 'A'), h(2, 'B'), h(2, 'C')]))).toBe(true);
    expect(outlineShows(outlineOf([h(1, 'Title'), h(2, 'A'), h(2, 'B')]))).toBe(false);
  });
});

describe('the section she is reading is the one lit', () => {
  const tops = [0, 400, 900];
  it('is the last heading above the reading line', () => {
    expect(sectionAt(tops, 450)).toBe(1);
    expect(sectionAt(tops, 900)).toBe(2);
    expect(sectionAt(tops, 5000)).toBe(2);
  });
  it('is none before the first heading', () => {
    expect(sectionAt([120, 400], 60)).toBe(-1);
  });
});
