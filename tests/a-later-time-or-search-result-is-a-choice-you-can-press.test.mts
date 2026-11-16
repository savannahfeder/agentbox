// A Later time or a search result is a choice a tool can find and press.
//
// What broke: in the overnight Cloud test (2026-11-16, round three) a tester
// tried 8 times to click "In 30 minutes" or "Tomorrow" in Later and 7 times
// to click a thread found by Search. Each time the only pressable things were
// the text box and Close: the rows were bare boxes with a click handler and
// no role, so nothing reading the page (a screen reader, the testers' driver)
// knew they were choices. The tester had to type a time or use the arrow keys.
//
// The rule: every row of the Later list and of ⌘K / Search is an option in a
// listbox, and the row the keys are on says it is selected.

import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchedulePicker } from '../renderer/src/components/SchedulePicker.tsx';
import { Palette } from '../renderer/src/components/Palette.tsx';

const rows = (html: string) => [...html.matchAll(/<div[^>]*class="palette-item[^"]*"[^>]*>/g)].map((m) => m[0]);

describe('the Later list', () => {
  const html = renderToStaticMarkup(h(SchedulePicker<number>, {
    title: 'Later',
    placeholder: 'Try: 3h',
    hintWhenRefused: 'try 3h',
    options: [{ label: 'In 30 minutes', value: 1, hint: 'MON 3:03 AM' }, { label: 'Tomorrow', value: 2, hint: 'TUE 8:00 AM' }],
    parse: () => null,
    previewOf: String,
    onChoose: () => {},
    onClose: () => {},
  }));

  it('draws each time as an option inside a listbox', () => {
    expect(html).toContain('role="listbox"');
    expect(rows(html)).toHaveLength(2);
    for (const row of rows(html)) expect(row).toContain('role="option"');
  });

  it('marks only the row the keys are on as selected', () => {
    expect(rows(html).map((r) => r.includes('aria-selected="true"'))).toEqual([true, false]);
  });
});

describe('⌘K and Search', () => {
  const html = renderToStaticMarkup(h(Palette, { products: [], onClose: () => {} } as unknown as Parameters<typeof Palette>[0]));

  it('draws each row as an option inside a listbox', () => {
    expect(html).toContain('role="listbox"');
    expect(rows(html).length).toBeGreaterThan(3);
    for (const row of rows(html)) expect(row).toContain('role="option"');
  });

  it('marks only the row the keys are on as selected', () => {
    expect(rows(html).filter((r) => r.includes('aria-selected="true"'))).toHaveLength(1);
  });

  it('leaves section labels out of the choices', () => {
    for (const label of html.matchAll(/<div class="palette-section"[^>]*>/g)) expect(label[0]).not.toContain('role="option"');
  });
});
