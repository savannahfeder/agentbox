// On the phone app, Undo on a just-sent New thread withdrew the thread and the
// words and picture were gone: the New thread form sent with no `undone`, so
// nothing put the draft back, unlike a reply (thread/[product]/[id].tsx) or the
// desktop card (App.tsx `restoreComposeDraft`). Found from a phone report, read
// in mobile/src/ui/NewThreadForm.tsx `sendNow`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readDraftOf, restoreDraftOf, saveDraftOf, takeDraftOf } from '../mobile/src/lib/drafts';

function fakeStore() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
}

const sent = { text: 'Image attachment not working on mobile', files: [{ name: 'IMG_1328.png', dataBase64: 'iVBORw0KGgo=' }], priority: 'high' };

describe('Undo on a new thread sent from the phone', () => {
  it('puts the words, the picture and the priority back in the New thread box', () => {
    const store = fakeStore();
    saveDraftOf('new', sent, store);
    takeDraftOf('new', store);
    expect(readDraftOf('new', store).text).toBe('');
    expect(restoreDraftOf('new', sent, store)).toBe(true);
    expect(readDraftOf('new', store)).toEqual(sent);
  });

  it('does not write over a new thread started since', () => {
    const store = fakeStore();
    saveDraftOf('new', { text: 'Something newer', files: [], priority: null }, store);
    expect(restoreDraftOf('new', sent, store)).toBe(false);
    expect(readDraftOf('new', store).text).toBe('Something newer');
  });

  it('is asked for by the New thread form, and the New thread page opens again with it', () => {
    const form = fs.readFileSync(new URL('../mobile/src/ui/NewThreadForm.tsx', import.meta.url), 'utf8');
    const send = form.slice(form.indexOf('const sendNow = async'), form.indexOf('// Busy is drawn a frame late'));
    expect(send).toMatch(/const undone = \(\) => \{ if \(draft\.restore\(sending\)\) reopen\?\.\(\); \};/);
    expect(send).toMatch(/c\.send\(\{ kind: 'new'[^\n]*, null, \{ undone \}\);/);
    const page = fs.readFileSync(new URL('../mobile/src/app/new.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/useNewThread\(close, \(\) => router\.push\('\/new'\)\)/);
  });
});
