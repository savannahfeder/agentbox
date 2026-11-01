// One pin showed twice in its thread. Sofia's pin on
// group-seat-picker-v4.png read first as hers, "Note on group-seat-picker-v4.png,
// Pin 1", and then again as a message signed "You", in bigger type: "Notes on
// /Users/.../store/accounts/.../designs/w-.../group-seat-picker-v4.png: - Pin 1,
// 27% across ... Make these changes and save the result as ...-v5.png". She
// never wrote that, and a teammate reading the thread would think she writes
// prompts with folder paths in them. Measured: the instruction the agent is
// handed was saved as an ordinary reply, and the thread drew every reply.
//
// Now the delivered instruction carries the ids of the notes it came from
// (`fromNotes`). The agent still gets every word of it; the thread draws only
// the pin.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { noteToItsAgent } from '../main/notes-wake.mjs';
import { threadEvents } from '../renderer/src/thread-history';

let store, dir, thread;
const supervisor = { sessions: new Map(), wake: () => {} };
const lines = () => disk.readItemHistory(dir, thread.id);
const events = () => threadEvents(lines());

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-once-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Seat picker', body: 'Draw the seat picker.' });
  disk.updateWorkItem(dir, thread.id, { result: `v4: designs/${thread.id}/group-seat-picker-v4.png` }, { source: 'agent' });
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('her pin on her agent\'s picture', () => {
  it('shows once, as her pin, and the agent still gets the whole instruction', async () => {
    const mark = { do: 'note', id: 'n1', file: 'group-seat-picker-v4.png', place: { kind: 'pin', x: 0.27, y: 0.8 }, text: 'Tighten the bottom third' };
    store.fileMark('website', thread.id, mark);
    expect(await noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark, nameOf: () => 'Sofia' })).toBe(true);

    const said = events().filter((e) => e.message);
    expect(said.filter((e) => e.words?.includes('Tighten the bottom third'))).toHaveLength(1);
    expect(said.some((e) => /Notes on|Make these changes/.test(e.words ?? ''))).toBe(false);

    const item = store.readItem('website', thread.id);
    expect(item.answer).toMatch(/^Notes on designs\/.+group-seat-picker-v4\.png:/);
    expect(item.answer).toContain('group-seat-picker-v5.png');
    expect(item.status).toBe('open');
    // A conversation between people does not count it as her message either.
    expect((item.said ?? []).some((s) => s.text.includes('Make these changes'))).toBe(false);
  });

  it('a reply she types herself still shows', async () => {
    store.answerItem('website', thread.id, { answer: 'Also the copper line' });
    expect(events().some((e) => e.said === 'You replied' && e.words === 'Also the copper line')).toBe(true);
  });
});

describe("a teammate's note told to the agent", () => {
  it('shows only as their note, not again as a hand-over', () => {
    store.fileMark('website', thread.id, { do: 'note', id: 'n2', file: 'group-seat-picker-v4.png', place: { kind: 'whole' }, text: 'Bigger seats' });
    store.tellItem('website', thread.id, { text: 'Sofia left notes on group-seat-picker-v4.png ...\n\nNotes on designs/x.png:\n- Whole file: Bigger seats', from: { teammate: 'p-sofia', name: 'Sofia' }, fromNotes: ['n2'] });
    expect(events().some((e) => e.from === 'Sofia')).toBe(false);
    expect(store.readItem('website', thread.id).answer).toContain('Bigger seats');
  });

  it('a teammate\'s own hand-over still shows as theirs', () => {
    store.tellItem('website', thread.id, { text: 'Take this one on', from: { teammate: 'p-sofia', name: 'Sofia' } });
    expect(events().some((e) => e.from === 'Sofia' && e.words === 'Take this one on')).toBe(true);
  });
});
