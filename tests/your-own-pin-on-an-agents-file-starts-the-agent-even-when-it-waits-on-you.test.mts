// A pin on an agent's file did not wake the agent while its thread waited on an
// open question. Sofia pinned "soon" at 0:05 on her
// agent's launch-teaser-v7.mp4, then a spot on group-seat-picker-v2.png, then on
// v3: three times the note sat under the agent's old question, the thread stayed
// "Waiting on you", and nothing ran for 4 to 10 minutes until she answered the
// question. Measured: the owner's own notes only reached the agent when she
// pressed "Send these notes to the agent"; a teammate's note (Sofia pinning
// Dev's picture) ran in 4 minutes because only those were told to the agent.
//
// Now the owner's note on a file an agent made is sent as her reply, the one a
// typed reply is: it carries the pin's spot, time and version, opens a waiting
// thread, and the supervisor's next tick starts the run through spawnWorker.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mts';

let store, dir, thread, woke;
const supervisor = { sessions: new Map(), wake: () => { woke++; } };
const hear = (mark) => noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark, nameOf: () => 'Sofia' });
const note = (mark) => { store.fileMark('website', thread.id, mark); return hear(mark); };
const pin = (id, file, text, place = { kind: 'pin', x: 0.4, y: 0.6 }) => ({ do: 'note', id, file, place, text });
const row = () => store.readItem('website', thread.id);

beforeEach(async () => {
  disk._internals.forgetFolds();
  woke = 0;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'own-pin-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Launch teaser', body: 'Make the teaser film.' });
  disk.updateWorkItem(dir, thread.id, { result: `Here it is: designs/${thread.id}/launch-teaser-v7.mp4 and designs/${thread.id}/seat-picker.png\n\n1. Keep "coming soon"\n2. Say "launching in two weeks"` }, { source: 'agent' });
  // Waiting on you: the agent asked and stopped.
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('her pin on a file her agent made', () => {
  it('reaches the agent as her reply while the thread waits on its question, with the time and the next version', async () => {
    expect(await note(pin('n1', 'launch-teaser-v7.mp4', 'Change it to launching in two weeks', { kind: 'time', s: 5, x: 0.5, y: 0.3 }))).toBe(true);
    const item = row();
    expect(item.status).toBe('open');
    expect(item.answer).toContain('Pin 1 at 0:05');
    expect(item.answer).toContain('Change it to launching in two weeks');
    expect(item.answer).toContain('launch-teaser-v8.mp4');
    expect(item.wrote.answer.source).toBe('founder');
    expect(woke).toBe(1);
  });

  it('carries the spot on a picture', async () => {
    await note(pin('n1', 'seat-picker.png', 'Darker cream'));
    expect(row().answer).toMatch(/Pin 1, 40% across and 60% down: Darker cream/);
  });

  it('also reaches a thread that is not waiting on her', async () => {
    disk.updateWorkItem(dir, thread.id, { status: 'open' }, { source: 'system' });
    expect(await note(pin('n1', 'seat-picker.png', 'Darker cream'))).toBe(true);
    expect(row().answer).toContain('Darker cream');
  });

  it('is sent once, and a second pin is its own reply', async () => {
    await note(pin('n1', 'seat-picker.png', 'Darker cream'));
    expect(await hear(pin('n1', 'seat-picker.png', 'Darker cream'))).toBe(false);
    expect(row().artifacts.notes.find((n) => n.id === 'n1').sent).toBe(true);
    await note(pin('n2', 'seat-picker.png', 'Tighter gap'));
    expect(row().answer).toContain('Tighter gap');
    expect(row().answer).not.toContain('Darker cream');
    expect(woke).toBe(2);
  });
});

describe('what starts nothing', () => {
  it('a pin on a picture she attached herself', async () => {
    const own = store.composeItem('website', { title: 'Logo', body: 'Here: [logo.png](attachments/logo.png)' });
    store.fileMark('website', own.id, pin('n1', 'logo.png', 'Nice'));
    expect(await noteToItsAgent({ store, supervisor, product: 'website', id: own.id, mark: pin('n1', 'logo.png', 'Nice') })).toBe(false);
    expect(store.readItem('website', own.id).answer ?? null).toBe(null);
  });

  // An approval does start the agent: tests/approving-an-agents-file-sends-its-thread-back-to-work.
  it('a resolve', async () => {
    store.fileMark('website', thread.id, pin('n1', 'seat-picker.png', 'Darker cream'));
    store.fileMark('website', thread.id, { do: 'sent', on: ['n1'] });
    expect(await note({ do: 'resolve', on: 'n1' })).toBe(false);
    expect(row().status).toBe('blocked');
    expect(woke).toBe(0);
  });

  it('a pin she resolved before it went', async () => {
    store.fileMark('website', thread.id, pin('n1', 'seat-picker.png', 'Darker cream'));
    store.fileMark('website', thread.id, { do: 'resolve', on: 'n1' });
    expect(await hear(pin('n1', 'seat-picker.png', 'Darker cream'))).toBe(false);
  });
});

it('both doors a note is written through send it on', () => {
  const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
  const handler = (name) => ipc.slice(ipc.indexOf(`'${name}'`), ipc.indexOf('ipcMain.handle(', ipc.indexOf(`'${name}'`) + 1));
  expect(handler('zero:file-mark')).toMatch(/noteToItsAgent\(/);
  expect(handler('zero:files-place-mark')).toMatch(/noteToItsAgent\(/);
});
