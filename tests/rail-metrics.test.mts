// Every company's rail shows the same shape, and the empty slots say so.
//
// A product with an empty dashboard ledger drew a name, a stage pill and
// nothing else, which beside a product that had written some metrics read as a
// poorer panel rather than as a younger company. The founder asked for the
// opposite: "make sure all companies have the stuff in the sidebar... if it
// doesnt have this info just say so, at least it'll encourage people to connect
// analytics" (2026-08-12).
//
// The line this must not cross is the dashboard's: absence of data and a real
// zero never look the same, and nothing may invent a figure. What is asserted
// here is only the QUESTION, which is true of every company whether or not
// anyone has answered it.

import { describe, expect, it } from 'vitest';
import { railHeadline, railIntent, railRows, railValue } from '../renderer/src/rail-metrics.ts';

describe('railHeadline', () => {
  it('prints a measured number as written', () => {
    const h = railHeadline({ label: 'Weekly active', value: '12' }, 'launched');
    expect(h).toEqual({ value: '12', label: 'Weekly active', unit: '', unmeasured: false });
  });

  it('still gives an empty product the card, with a dash where the number goes', () => {
    // The blue panel is what every other company gets, so withholding it made
    // the youngest products look like the broken ones.
    for (const empty of [null, undefined, { label: 'Weekly active', value: '', unmeasured: true }]) {
      const h = railHeadline(empty, 'launched');
      expect(h.unmeasured).toBe(true);
      expect(h.value).toBe('—');
    }
  });

  it('never lets the empty card read as a figure', () => {
    // An em dash cannot be mistaken for zero, for a count, or for a
    // measurement. That is the whole reason it is the placeholder and a "0"
    // never could be.
    const h = railHeadline(null, 'launched');
    expect(h.value).not.toMatch(/\d/);
    expect(h.value).not.toBe('0');
    expect(h.unit).toMatch(/no metrics recorded yet/);
  });

  it('names the thing that would fill it, differently before and after launch', () => {
    expect(railHeadline(null, 'prelaunch').label).toBe('Steps to launch');
    expect(railHeadline(null, 'launched').label).toBe('Weekly active');
    expect(railHeadline(null, 'prelaunch').unit).toMatch(/no path recorded yet/);
  });
});

describe('railRows', () => {
  it('fills an empty product with named, visibly empty metrics', () => {
    const rows = railRows([]);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.unmeasured)).toBe(true);
    expect(rows.map((r) => r.label)).toEqual(['Next milestone', 'Signups this week', 'Revenue', 'Churn']);
  });

  it('never invents a value for one', () => {
    // The whole risk of a skeleton is that a placeholder reads as a figure, so
    // the test is not "contains no digit" but "does not read as a
    // measurement": it says unmeasured first, and what follows is an
    // instruction rather than a quantity.
    for (const row of railRows([])) {
      expect(row.value).toBe('');
      expect(railValue(row)).toMatch(/^unmeasured\b/);
      expect(railValue(row)).not.toMatch(/^unmeasured, [\d$]/);
      expect(railValue(row)).not.toMatch(/\b\d+(\.\d+)?%/);
      expect(railValue(row)).not.toMatch(/\$\s?\d/);
    }
  });

  it('says what would fill each empty slot', () => {
    const byLabel = Object.fromEntries(railRows([]).map((r) => [r.label, railValue(r)]));
    expect(byLabel['Signups this week']).toBe('unmeasured, connect analytics');
    expect(byLabel.Revenue).toBe('unmeasured, connect payments');
  });

  it('puts the product\'s own metrics first and keeps them intact', () => {
    const real = [{ label: 'Real users', value: '4' }, { label: 'Revenue', value: '$147 MRR' }];
    const rows = railRows(real);
    expect(rows[0]).toEqual({ label: 'Real users', value: '4' });
    expect(rows[1]).toEqual({ label: 'Revenue', value: '$147 MRR' });
    expect(rows).toHaveLength(4);
  });

  it('does not ask a question the product has already answered', () => {
    const rows = railRows([{ label: 'revenue', value: '$147 MRR' }]);
    expect(rows.filter((r) => r.label.toLowerCase() === 'revenue')).toHaveLength(1);
  });

  it('does not pad a product that has outgrown the questions', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((l) => ({ label: l, value: '1' }));
    const rows = railRows(many);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => !r.unmeasured)).toBe(true);
  });

  it('survives a null from a product whose ledger has not been read', () => {
    expect(railRows(null)).toHaveLength(4);
    expect(railRows(undefined)).toHaveLength(4);
  });
});

describe('railIntent', () => {
  it('shows a recorded next move as written', () => {
    expect(railIntent('Ship the pricing page.')).toEqual({ text: 'Ship the pricing page.', unmeasured: false });
  });

  it('says there is none rather than inventing one or hiding the section', () => {
    // The app reflects a next move, it does not derive one. Making one up here
    // would be a fabricated fact about the founder's own company.
    for (const empty of [null, undefined, '', '   ']) {
      expect(railIntent(empty)).toEqual({ text: 'Not recorded yet.', unmeasured: true });
    }
  });
});
