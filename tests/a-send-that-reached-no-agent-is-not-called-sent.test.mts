// A SEND THAT REACHED NO AGENT IS NOT CALLED SENT.
//
// Reported on 2026-11-22 with a screenshot of a picture opened big: the notes
// box said "Sent to your agent" while the same note sat under Unsent, with
// "1 comment not sent to your agent" and Send 1 beside it. Read off
// main/ipc.mts: a Send is a `toagent` mark, and when main finds nothing it
// can hand over (it skips a note whose version it cannot find, or one the
// agent did not make), noteToItsAgent returns false and the handler answered
// { ok: true } all the same. The window shows "Sent to your agent" on that
// answer and keeps the note under Unsent, because `sent` was never written.
// One cause of the missing version was fixed on 2026-11-23 (main reads the
// runs' logs now); this is the silence that hid it.
//
// Must NOT be an error: a note already sent or resolved, a note kept for
// Send, a Send that did reach the agent, a direct conversation.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent, notesLeftUnsent } from '../main/notes-wake.mts';

let store, dir, thread, D;
const supervisor = { sessions: new Map(), wake: () => {} };
const people = [];
const send = async (m) => {
  store.fileMark('website', thread.id, m);
  const handed = await noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark: m, nameOf: () => 'Ana', people });
  return { handed, left: notesLeftUnsent({ store, product: 'website', id: thread.id, mark: m, people }) };
};
const note = (id, file, text = 'Less space under the headline') => ({ do: 'note', id, file, v: 1, place: { kind: 'whole' }, text, wait: true });

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'send-reached-nobody-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Pricing page', body: 'Redo the pricing hero.' });
  D = `designs/${thread.id}`;
  disk.updateWorkItem(dir, thread.id, { result: `Two ways:\n\n${D}/hero-a.png\n\n${D}/hero-b.png` }, { source: 'agent' });
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('a Send main could hand nothing of', () => {
  it('leaves its note unsent, and says so', async () => {
    store.fileMark('website', thread.id, note('n1', 'hero-c.png'));
    const out = await send({ do: 'toagent', on: ['n1'] });
    expect(out.handed).toBe(false);
    expect(out.left).toEqual(['n1']);
  });

  it('names only the notes that did not go, when some did', async () => {
    store.fileMark('website', thread.id, note('n1', 'hero-a.png'));
    store.fileMark('website', thread.id, note('n2', 'hero-c.png'));
    const out = await send({ do: 'toagent', on: ['n1', 'n2'] });
    expect(out.handed).toBe(true);
    expect(out.left).toEqual(['n2']);
  });
});

describe('not an error', () => {
  it('a Send that reached the agent', async () => {
    store.fileMark('website', thread.id, note('n1', 'hero-a.png'));
    const out = await send({ do: 'toagent', on: ['n1'] });
    expect(out).toEqual({ handed: true, left: [] });
  });

  it('a second Send of a note already sent', async () => {
    store.fileMark('website', thread.id, note('n1', 'hero-a.png'));
    await send({ do: 'toagent', on: ['n1'] });
    expect((await send({ do: 'toagent', on: ['n1'] })).left).toEqual([]);
  });

  it('a note resolved, or one this thread does not hold', async () => {
    store.fileMark('website', thread.id, note('n2', 'hero-c.png'));
    store.fileMark('website', thread.id, { do: 'resolve', on: 'n2' });
    expect((await send({ do: 'toagent', on: ['n2', 'elsewhere'] })).left).toEqual([]);
  });

  it('a note being kept, which is no Send', async () => {
    expect((await send(note('n1', 'hero-c.png'))).left).toEqual([]);
    expect((await send({ ...note('n2', 'hero-c.png'), wait: false })).left).toEqual([]);
  });

  it('a thread that is a direct conversation', async () => {
    store.fileMark('website', thread.id, note('n1', 'hero-c.png'));
    const listed = store.listProducts.bind(store);
    store.listProducts = () => listed().map((p) => (p.slug === 'website' ? { ...p, team: { direct: true } } : p));
    expect((await send({ do: 'toagent', on: ['n1'] })).left).toEqual([]);
  });
});

describe('both doors a note is written through', () => {
  const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
  const handler = (name) => ipc.slice(ipc.indexOf(`'${name}'`), ipc.indexOf('ipcMain.handle(', ipc.indexOf(`'${name}'`) + 1));
  for (const door of ['zero:file-mark', 'zero:files-place-mark']) {
    it(`${door} answers a Send that reached nobody as not sent`, () => {
      const h = handler(door);
      expect(h).toMatch(/notesLeftUnsent\(/);
      expect(h).toMatch(/ok: false, error: notReached\(/);
    });
  }
});
