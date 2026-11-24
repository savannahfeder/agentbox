// A new version's preview never shows the agent's sentence with a file name cut out of it.
//
// What broke: an agent wrote "Saved [clinic-checkout-v2.html](...) as the next
// version of [clinic-checkout.html](...)." The big view takes the words a
// message puts beside a file as its label, with file names taken out, so the
// bar read "Saved as the next version of ." with a blank where the old file
// belonged. Measured on the testers' own ledger lines (two copies, two files).
import { describe, it, expect } from 'vitest';
import { labelSaidFor } from '../shared/file-label.mts';

const said = (text: string) => [{ id: 'l1', ts: 1, source: 'agent', patch: { note: text } }];
const label = (text: string, path: string) => labelSaidFor(said(text), [path]);

describe('a line that names two files', () => {
  it('is no label for either when it is a sentence about both', () => {
    const text = 'Saved [clinic-checkout-v2.html](designs/w-a/clinic-checkout-v2.html) as the next version of [clinic-checkout.html](attachments/mw-clinic-checkout.html).';
    expect(label(text, 'designs/w-a/clinic-checkout-v2.html')).toBeNull();
    expect(label(text, 'attachments/mw-clinic-checkout.html')).toBeNull();
  });

  it('is no label when the other file is named bare', () => {
    expect(label('Saved [empty-bookings-v2.html](designs/w-b/empty-bookings-v2.html) as the next version of empty-bookings.html.', 'designs/w-b/empty-bookings-v2.html')).toBeNull();
  });

  it('still labels a file it names twice, by its link and its path', () => {
    expect(label('Option 2: ![Option 2](designs/a/2.png) designs/a/2.png', 'designs/a/2.png')).toBe('Option 2: Option 2');
  });
});

describe('a line that names one file', () => {
  it('still labels it', () => {
    expect(label('1. Faces only: designs/a/1.png', 'designs/a/1.png')).toBe('Faces only');
    expect(label('Before:\n/designs/a/1.png', 'designs/a/1.png')).toBe('Before');
  });
});
