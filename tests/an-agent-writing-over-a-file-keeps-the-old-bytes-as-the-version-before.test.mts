// AN AGENT WRITING OVER A FILE KEEPS THE OLD BYTES AS THE VERSION BEFORE.
//
// Sofia: her agent redid Maya's investor deck and wrote it over
// october-investor-deck.pdf. Files kept saying "1 version", then "v1 of 2" was
// already the redesign: Maya's original was gone. Measured from the code: a
// version was a path, so new bytes at an old path replaced the old version.
// Every set of bytes Files sees is now kept as it was, so a write over a path
// is the next version and the one before still opens.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { appFilesPlace } from '../main/files-place.mjs';

async function aMac() {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'over-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  const dir = path.join(accountRoot, 'app');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'app', name: 'App' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const place = appFilesPlace({ store, accountRoot, storeRoot });
  const put = (rel, bytes) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); return f; };
  const thread = async (title, ...notes) => {
    const t = store.composeItem('app', { title, body: 'x' });
    for (const note of notes) await disk.updateWorkItem(dir, t.id, { note }, { source: 'agent' });
    return t;
  };
  return { place, put, thread };
}
const deckOf = (list) => list.files.find((f) => f.name === 'deck.pdf');
const bytesAt = async (m, key) => {
  const view = await m.place.open(key);
  return view.lines.map((l) => {
    const p = l.patch.note.match(/\]\((.+)\)$/)[1];
    return fs.readFileSync(p, 'utf8');
  });
};

describe('new bytes at a path Files has seen', () => {
  it('are the next version, and the old bytes still open as the one before', async () => {
    const m = await aMac();
    m.put('designs/deck.pdf', "Maya's portrait deck");
    await m.thread('Deck', 'The deck: [deck.pdf](designs/deck.pdf)');
    expect(deckOf(await m.place.list()).versions).toBe(1);
    m.put('designs/deck.pdf', 'the cream redesign');
    const list = await m.place.list();
    expect(deckOf(list).versions).toBe(2);
    expect(await bytesAt(m, deckOf(list).key)).toEqual(["Maya's portrait deck", 'the cream redesign']);
  });

  it('the same bytes written again are no new version', async () => {
    const m = await aMac();
    m.put('designs/deck.pdf', 'one');
    await m.thread('Deck', '[deck.pdf](designs/deck.pdf)');
    await m.place.list();
    m.put('designs/deck.pdf', 'one');
    expect(deckOf(await m.place.list()).versions).toBe(1);
  });

  it('a third write keeps both before it, in the order they were seen', async () => {
    const m = await aMac();
    m.put('designs/deck.pdf', 'one');
    await m.thread('Deck', '[deck.pdf](designs/deck.pdf)');
    await m.place.list();
    m.put('designs/deck.pdf', 'two');
    await m.place.list();
    m.put('designs/deck.pdf', 'three');
    const list = await m.place.list();
    expect(await bytesAt(m, deckOf(list).key)).toEqual(['one', 'two', 'three']);
  });
});
