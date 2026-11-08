// A reply on a note the agent was sent never reached the agent. On a launch
// film, the note at 0:25 read "Sent to the agent"; the reply under it ("Also
// something about the visual: it doesn't make me want it...") said nothing, and
// the person could not tell whether the agent had it. Measured: noteToItsAgent
// returned false for every `reply` mark, and the Files page's mark() returned no
// thread for a reply, so neither door handed one on.
//
// Now a reply on a note that went to the agent goes the same way, as your reply
// on the thread, once, and is marked sent so the card can say so. A reply to a
// teammate, a thank-you, or a reply on a note the agent was never sent stays put.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mjs';
import { appFilesPlace } from '../main/files-place.mjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FileNoteCard } from '../renderer/src/components/FileNoteCard.tsx';

let store, dir, thread, woke, storeRoot, accountRoot;
const people = [{ id: 'u-sofia', name: 'Sofia Reyes' }];
const supervisor = { sessions: new Map(), wake: () => { woke++; } };
const hear = (mark) => noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark, nameOf: () => 'Maya', people });
const write = (mark) => { store.fileMark('website', thread.id, mark); return hear(mark); };
const film = (id, text) => ({ do: 'note', id, file: 'launch-film.mp4', place: { kind: 'time', s: 25 }, text });
const reply = (id, on, text) => ({ do: 'reply', id, on, file: 'launch-film.mp4', text });
const row = () => store.readItem('website', thread.id);
const noteOf = (id) => row().artifacts.notes.find((n) => n.id === id);

beforeEach(async () => {
  disk._internals.forgetFolds();
  woke = 0;
  storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-to-agent-'));
  accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Launch film', body: 'Make the launch film.' });
  fs.mkdirSync(path.join(dir, 'designs', thread.id), { recursive: true });
  fs.writeFileSync(path.join(dir, 'designs', thread.id, 'launch-film.mp4'), 'film');
  disk.updateWorkItem(dir, thread.id, { result: `Here it is: designs/${thread.id}/launch-film.mp4` }, { source: 'agent' });
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('a reply on a note the agent was sent', () => {
  beforeEach(async () => {
    expect(await write(film('n1', 'I still do not like the look of this.'))).toBe(true);
    disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
    woke = 0;
  });

  it('reaches the agent as your reply, with the note it answers and where that note is', async () => {
    expect(await write(reply('r1', 'n1', 'Show a beautiful inbox where things are happening.'))).toBe(true);
    const item = row();
    expect(item.status).toBe('open');
    expect(item.answer).toContain('Show a beautiful inbox where things are happening.');
    expect(item.answer).toContain('0:25');
    expect(item.answer).toContain('I still do not like the look of this.');
    expect(item.answer).toContain(`designs/${thread.id}/launch-film.mp4`);
    expect(item.answer).toContain('launch-film-v2.mp4');
    expect(item.wrote.answer.source).toBe('founder');
    expect(woke).toBe(1);
  });

  it('is marked sent, so the card can say it went', async () => {
    await write(reply('r1', 'n1', 'Show a beautiful inbox.'));
    expect(noteOf('n1').replies[0]).toMatchObject({ id: 'r1', sent: true });
  });

  it('goes once, and a second reply goes on its own', async () => {
    await write(reply('r1', 'n1', 'Show a beautiful inbox.'));
    expect(await hear(reply('r1', 'n1', 'Show a beautiful inbox.'))).toBe(false);
    await write(reply('r2', 'n1', 'And slower.'));
    expect(row().answer).toContain('And slower.');
    expect(row().answer).not.toContain('Show a beautiful inbox.');
    expect(woke).toBe(2);
  });

  it('a reply written to a teammate stays with them', async () => {
    expect(await write(reply('r1', 'n1', 'Sofia, what do you think?'))).toBe(false);
    expect(noteOf('n1').replies[0].sent).toBeUndefined();
    expect(woke).toBe(0);
  });

  it('a reply that only thanks starts nothing', async () => {
    expect(await write(reply('r1', 'n1', 'Thanks, looks great'))).toBe(false);
    expect(woke).toBe(0);
  });

  it('a reply on a note resolved since starts nothing', async () => {
    store.fileMark('website', thread.id, { do: 'resolve', on: 'n1' });
    expect(await write(reply('r1', 'n1', 'One more thing.'))).toBe(false);
    expect(woke).toBe(0);
  });
});

it('a reply on a note the agent was never sent stays where it is', async () => {
  expect(await write(film('n1', 'Sofia, can you take this one?'))).toBe(false);
  expect(await write(reply('r1', 'n1', 'Make it slower too.'))).toBe(false);
  expect(row().answer ?? null).toBe(null);
  expect(woke).toBe(0);
});

it('the card says which replies went to the agent', () => {
  const r = (id, text, more = {}) => ({ id, text, by: 'u-me', ts: 2, ...more });
  const note = { id: 'n1', file: 'launch-film.mp4', place: { kind: 'time', s: 25 }, text: 'Too dark', by: 'u-me', ts: 1, mentions: [], owner: null, uid: null, sent: true,
    replies: [r('r1', 'Brighter', { sent: true }), r('r2', 'Sofia, thoughts?')] };
  const html = renderToStaticMarkup(React.createElement(FileNoteCard, {
    note, wordsGone: false, active: false, settling: false, person: () => null, me: 'u-me', onGo: () => {}, onSettle: () => {}, nameOf: () => 'Sofia',
    replying: false, onReplying: () => {}, onReply: async () => true, canReply: true, held: null, onToAgent: () => {}, product: 'website',
  }));
  const replies = html.split('class="av-reply"').slice(1);
  expect(replies[0]).toContain('Sent to the agent');
  expect(replies[1]).not.toContain('Sent to the agent');
});

it('a reply written on the Files page names the thread, so it is sent from there too', async () => {
  const place = appFilesPlace({ store, accountRoot, storeRoot });
  const [file] = (await place.list()).files;
  const wrote = { product: 'website', id: thread.id };
  const note = await place.mark(file.key, film('n1', 'Too dark.'));
  expect(note).toMatchObject({ ok: true, wrote });
  expect(await place.mark(file.key, reply('r1', 'n1', 'Brighter.'))).toMatchObject({ ok: true, wrote });
  expect(await place.mark(file.key, { do: 'resolve', on: 'n1' })).not.toHaveProperty('wrote');
});
