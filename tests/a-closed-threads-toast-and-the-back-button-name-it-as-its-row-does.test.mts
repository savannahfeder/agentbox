// Closing "Add POST /payments route for appointments" with E toasted "Done: add a POST /payments route that…",
// and Back read the first words too: both used item.title, not the row's name (tester issue 74).
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { rowTitle } from '../renderer/src/list-rules';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const closing = app.slice(app.indexOf('const undid = [{ product: item.product, id: item.id, words: UNDID_CLOSING }];'), app.indexOf('const reopenDone = useCallback'));

it('the row names a thread by its label, not the words it was started with', () => {
  const item = { title: 'add a POST /payments route that records a payment for an appointment', label: 'Add POST /payments route for appointments', wrote: { label: { ts: 2 } } };
  expect(rowTitle(item)).toBe('Add POST /payments route for appointments');
});

it('the close toast and its undo name the thread as its row does', () => {
  expect(closing).toContain('`${DONE.verb}: ${clipToSentence(rowTitle(item), TOAST_TITLE)}`');
  expect(closing).toContain('label: `Reopened: ${clipToSentence(rowTitle(item), TOAST_TITLE)}`');
  expect(closing).not.toMatch(/clipToSentence\(item\.title/);
});

it('back and forward name a thread as its row does', () => {
  const stop = app.slice(app.indexOf('const threadName = '), app.indexOf('useEffect(', app.indexOf('const stopName = (s: TrailStop)')));
  expect(stop).toMatch(/: threadName\(s\);/);
  expect(stop).not.toMatch(/selectable\.find\([^\n]*\?\.title/);
  expect(stop).toMatch(/const thread = selectable\.find\(\(i\) => i\.id === s\.id && i\.product === s\.product\);\s*return thread \? rowTitle\(thread\) : 'the thread';/);
});
