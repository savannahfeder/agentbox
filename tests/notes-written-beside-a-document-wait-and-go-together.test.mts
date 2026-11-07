// NOTES WRITTEN BESIDE A DOCUMENT WAIT, AND GO TO THE AGENT TOGETHER (w-4ad34d6a27, 2026-11-03).
//
// What was asked: reading a long draft full screen, you leave several notes
// and want the agent to get them in one go. Each of your notes used to reach
// the agent the moment it was added, so three notes meant three replies: an
// idle agent started three turns, a working one was steered three times and
// could start editing before it saw the rest. Measured by reading the code:
// noteToItsAgent sent a reply per note, and "Send these notes to the agent"
// (a `toagent` mark) also looped one reply per note.
//
// Now a note written in the document's notes sidebar carries `wait`, and stays
// put until Send, which tells the agent every waiting note on a file as one
// message. A note from the big viewer, without `wait`, still goes at once.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { noteToItsAgent, wakeForNotes } from '../main/notes-wake.mjs';
import { cleanMark, notesForItsAgent } from '../shared/artifact-marks.mjs';

let store, dir, thread, woke;
const supervisor = { sessions: new Map(), wake: () => { woke++; } };
const hear = (mark) => noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark, nameOf: () => 'Sam' });
const mark = (m) => { store.fileMark('website', thread.id, m); return hear(m); };
const quote = (id, words, text, extra = {}) => ({ do: 'note', id, file: 'pricing-answers.md', place: { kind: 'quote', text: words }, text, ...extra });
const row = () => store.readItem('website', thread.id);

beforeEach(async () => {
  disk._internals.forgetFolds();
  woke = 0;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-wait-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Pricing answers', body: 'Collect the answers.' });
  disk.updateWorkItem(dir, thread.id, { result: 'They are in pricing-answers.md and in seat-picker.png' }, { source: 'agent' });
});

describe('a note marked to wait', () => {
  it('keeps its wait through the mark and the fold', () => {
    expect(cleanMark(quote('n1', 'per room', 'Say the price', { wait: true })).wait).toBe(true);
    expect(cleanMark(quote('n1', 'per room', 'Say the price', { wait: 'yes' })).wait).toBeUndefined();
    store.fileMark('website', thread.id, quote('n1', 'per room', 'Say the price', { wait: true }));
    expect(row().artifacts.notes[0].wait).toBe(true);
  });

  it('does not reach the agent when it is added', async () => {
    expect(await mark(quote('n1', 'per room', 'Say the price', { wait: true }))).toBe(false);
    expect(row().answer ?? null).toBe(null);
    expect(row().artifacts.notes[0].sent).toBeUndefined();
    expect(woke).toBe(0);
  });

  it('goes with the others as one message when Send is pressed', async () => {
    await mark(quote('n1', 'phone time and double bookings', 'Lead with double bookings', { wait: true }));
    await mark(quote('n2', 'per room, not per seat', 'Say what a room costs', { wait: true }));
    await mark(quote('n3', 'move a flight', 'Move this line up', { wait: true }));
    expect(await mark({ do: 'toagent', on: ['n1', 'n2', 'n3'] })).toBe(true);
    const answer = row().answer;
    for (const words of ['Lead with double bookings', 'Say what a room costs', 'Move this line up']) expect(answer).toContain(words);
    expect(answer.match(/Notes on /g)).toHaveLength(1);
    expect(row().artifacts.notes.every((n) => n.sent)).toBe(true);
    expect(woke).toBe(1);
  });

  it('sends notes on two files as one message too', async () => {
    await mark(quote('n1', 'per room', 'Say the price', { wait: true }));
    await mark({ do: 'note', id: 'n2', file: 'seat-picker.png', place: { kind: 'whole' }, text: 'Darker cream', wait: true });
    await mark({ do: 'toagent', on: ['n1', 'n2'] });
    expect(row().answer).toContain('Notes on pricing-answers.md');
    expect(row().answer).toContain('Notes on seat-picker.png');
    expect(row().artifacts.notes.every((n) => n.sent)).toBe(true);
    expect(woke).toBe(1);
  });
});

describe('what is unchanged', () => {
  it('a note without wait still reaches the agent the moment it is added', async () => {
    expect(await mark(quote('n1', 'per room', 'Say the price'))).toBe(true);
    expect(row().answer).toContain('Say the price');
  });

  it('a note already sent is not sent again by Send', async () => {
    await mark(quote('n1', 'per room', 'Say the price'));
    expect(await mark({ do: 'toagent', on: ['n1'] })).toBe(false);
  });
});

describe("a teammate's waiting note", () => {
  const lines = () => disk.readItemHistory(dir, thread.id);
  const theirs = (extra = {}) => ({ id: 'n1', file: 'pricing-answers.md', place: { kind: 'whole' }, text: 'Show yearly', by: 'p-maya', ts: 1, mentions: [], ...extra });

  it('is not told to the agent until somebody sends it', () => {
    const marks = { notes: [theirs({ wait: true })] };
    expect(notesForItsAgent(lines(), marks, { me: 'p-sam' })).toHaveLength(0);
    expect(notesForItsAgent(lines(), { notes: [theirs({ wait: true, toAgent: true })] }, { me: 'p-sam' })).toHaveLength(1);
    expect(notesForItsAgent(lines(), { notes: [theirs()] }, { me: 'p-sam' })).toHaveLength(1);
  });

  it('does not wake the thread while it waits', async () => {
    const team = { state: () => ({ me: { id: 'p-sam' }, people: [{ id: 'p-maya', name: 'Maya' }] }) };
    const told = [];
    const withNotes = (notes) => ({
      listProducts: () => store.listProducts(),
      productDir: (slug) => store.productDir(slug),
      fileMark: () => {},
      listItems: () => [{ ...row(), artifacts: { notes, approvals: [], seen: {} } }],
    });
    const tell = async (...a) => { told.push(a); };
    expect(await wakeForNotes({ store: withNotes([theirs({ wait: true })]), team, tell })).toBe(0);
    expect(await wakeForNotes({ store: withNotes([theirs({ wait: true, toAgent: true })]), team, tell })).toBe(1);
    expect(told).toHaveLength(1);
  });
});
