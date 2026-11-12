// CLOSING A CONTINUED THREAD YOU DID NOT WRITE LEAVES NOTHING BEHIND.
//
// Continue it yourself opens the composer with the brief already written. Closing
// the card without a word of your own kept that brief as the plain card's draft,
// so the next N opened on somebody else's quoted thread, with no link back to it.
// Measured on the card's own rules: cardDraftPlace answered undefined, the plain
// card's slot, and cardDraftToKeep answered the whole seed.
//
// A hand-off already works this way, so a continued thread gets the same: its
// own draft, and the words it opened with are not a draft.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cardDraftPlace, cardDraftToKeep } from '../renderer/src/threads/composer-rules.ts';
import { continueStart } from '../renderer/src/threads/continue-thread.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const start = continueStart({
  title: 'Render', body: "Render\n\nI'm carrying on Dev's thread.", files: [{ name: 'a.png', srcPath: '/x/a.png' }], from: { personId: 'p-dev', threadId: 't1' },
});

describe('the words it opened with', () => {
  it('are not a draft when closed untouched', () => {
    expect(cardDraftToKeep(start.body, start)).toBe('');
  });
  it('nor when only the end of the box differs', () => {
    expect(cardDraftToKeep(`${start.body}\n`, start)).toBe('');
  });
  it('words you added are kept', () => {
    const typed = `${start.body}Take the first option.`;
    expect(cardDraftToKeep(typed, start)).toBe(typed);
  });
  it('a plain card with words in it is still a draft', () => {
    expect(cardDraftToKeep('Hello', { body: 'Hello' })).toBe('Hello');
  });
});

describe('where its draft lives', () => {
  it('apart from the plain card, so N never opens on it', () => {
    expect(cardDraftPlace(start)).toBeTruthy();
    expect(cardDraftPlace({ to: 'agent' })).toBeUndefined();
  });
  it('one to a thread being continued', () => {
    const other = continueStart({ title: '', body: '', files: [], from: { personId: 'p-dev', threadId: 't2' } });
    expect(cardDraftPlace(other)).not.toBe(cardDraftPlace(start));
  });
});

describe('the wiring', () => {
  it('the card opens on what you added, and an untouched card keeps none of the seed\'s files', () => {
    const card = read('renderer/src/threads/ThreadComposer.tsx');
    expect(card).toMatch(/const seeded = !!\(initial\?\.handFrom \|\| initial\?\.continueFrom\)/);
    expect(card).toMatch(/useState\(\(\) => \(initial\?\.handFrom \|\| initial\?\.continueFrom \? opened\.current\.text \|\| initial\.body/);
    expect(card).toMatch(/const unchanged = seeded && !kept/);
  });
});
