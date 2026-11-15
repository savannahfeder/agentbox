// A whole-file comment on an agent's .html page reached nobody.
// Dev wrote "tighten the dead bottom third ... add the state for 6
// open" on his agent's group-seat-picker.html in Files: no "Sent to the agent"
// under it, the agent did not start, and its thread still showed the old
// "Ship it / Discard" question five minutes later. Measured: the note looked
// its file up among the thread's pictures, films, PDFs and documents only
// (filesInLines), so a page was never an agent's file. The same pin on a
// picture went at once.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mts';

let store, dir, thread, woke;
const supervisor = { sessions: new Map(), wake: () => { woke++; } };
const note = (id, mark) => { store.fileMark('website', id, mark); return noteToItsAgent({ store, supervisor, product: 'website', id, mark, nameOf: () => 'Dev' }); };
const whole = (file, text) => ({ do: 'note', id: 'n1', file, place: { kind: 'whole' }, text });

beforeEach(async () => {
  disk._internals.forgetFolds();
  woke = 0;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'page-note-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Group seat picker page', body: 'Build the page.' });
  disk.updateWorkItem(dir, thread.id, { result: 'Built it: [group-seat-picker.html](group-bookings/group-seat-picker.html)\n\n1. Ship it\n2. Discard the change' }, { source: 'agent' });
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('a comment on a page an agent made', () => {
  it('starts the agent while its thread waits, and asks for the next version', async () => {
    expect(await note(thread.id, whole('group-seat-picker.html', 'Tighten the dead bottom third; add the state for 6 open'))).toBe(true);
    const item = store.readItem('website', thread.id);
    expect(item.status).toBe('open');
    expect(item.answer).toContain('Tighten the dead bottom third');
    expect(item.answer).toContain('group-seat-picker-v2.html');
    expect(item.artifacts.notes[0].sent).toBe(true);
    expect(woke).toBe(1);
  });

  it('a page named in code marks counts too', async () => {
    const other = store.composeItem('website', { title: 'Script', body: 'Write it.' });
    disk.updateWorkItem(dir, other.id, { result: 'Saved `out/report.html`' }, { source: 'agent' });
    expect(await note(other.id, whole('report.html', 'Bigger type'))).toBe(true);
  });
});

describe('what a page note does not start', () => {
  it('a page the person linked herself', async () => {
    const own = store.composeItem('website', { title: 'Mine', body: 'See [draft.html](attachments/draft.html)' });
    expect(await note(own.id, whole('draft.html', 'Tighter'))).toBe(false);
    expect(store.readItem('website', own.id).answer ?? null).toBe(null);
  });

  it('a page nobody named on the thread', async () => {
    expect(await note(thread.id, whole('elsewhere.html', 'Tighter'))).toBe(false);
  });
});
