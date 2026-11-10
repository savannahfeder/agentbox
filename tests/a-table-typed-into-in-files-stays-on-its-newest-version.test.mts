// A TABLE TYPED INTO IN FILES STAYS ON ITS NEWEST VERSION.
//
// A table saves each cell into its own file, and Files numbers each new state
// as a version. The big view stayed on the version it opened, so after the
// first cell it showed "v1 of 2", stopped taking typing, and the next cell was
// lost (measured 2026-11-06 driving a new table: "Ramp" saved, "Call on Friday"
// did not). The pane was also keyed by version, so each save drew it again
// and dropped the cursor.
import { it, expect, describe } from 'vitest';
import { paneKey, staysOnNewest } from '../renderer/src/table-follows.ts';

describe('a table being typed into', () => {
  it('follows to the newest version when the newest was the one open', () => {
    expect(staysOnNewest({ kind: 'table', wasNewest: true })).toBe(true);
  });

  it('stays on an older version someone picked on purpose', () => {
    expect(staysOnNewest({ kind: 'table', wasNewest: false })).toBe(false);
  });

  it('leaves a document on the page in hand, as before', () => {
    expect(staysOnNewest({ kind: 'markdown', wasNewest: true })).toBe(false);
    expect(staysOnNewest({ kind: null, wasNewest: true })).toBe(false);
  });

  it('keeps one pane while the file it writes is the same file', () => {
    expect(paneKey('table', { id: 'clients.csv', path: '/p/documents/clients.csv' })).toBe(paneKey('table', { id: 'clients.csv@2', path: '/p/documents/clients.csv' }));
  });

  it('draws a document again for each version, as before', () => {
    expect(paneKey('markdown', { id: 'a.md', path: '/p/a.md' })).not.toBe(paneKey('markdown', { id: 'a.md@2', path: '/p/a.md' }));
  });
});
