// A reply on a note the agent was sent never reached the agent. On a launch
// film, the note at 0:25 read "Sent to the agent"; the reply under it ("Also
// something about the visual: it doesn't make me want it...") said nothing, and
// the person could not tell whether the agent had it. Measured: noteToItsAgent
// returned false for every `reply` mark, and Send or @agent on a note already
// sent passed on nothing, so no reply under a sent note could ever reach it.
//
// Comments now wait for Send or @agent (a-comment-waits-until-you-send-it-or-tag-your-agent),
// and so does a reply: yours under a note the agent has counts as not sent, and
// Send or @agent hands it over, once, marked sent so the card says so.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mts';
import { notesToSendTheAgent } from '../renderer/src/artifact-pins.ts';
import { FileNoteCard } from '../renderer/src/components/FileNoteCard.tsx';

let store, dir, thread, woke;
const people = [{ id: 'u-sofia', name: 'Sofia Reyes' }];
const supervisor = { sessions: new Map(), wake: () => { woke++; } };
const hear = (mark) => noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark, nameOf: () => 'Maya', people });
const write = (mark) => { store.fileMark('website', thread.id, mark); return hear(mark); };
const send = (...on) => write({ do: 'toagent', on });
const film = (id, text) => ({ do: 'note', id, file: 'launch-film.mp4', place: { kind: 'time', s: 25 }, text });
const reply = (id, on, text) => ({ do: 'reply', id, on, file: 'launch-film.mp4', text });
const row = () => store.readItem('website', thread.id);
const noteOf = (id) => row().artifacts.notes.find((n) => n.id === id);
const version = () => ({ id: 'launch-film.mp4', path: `designs/${thread.id}/launch-film.mp4`, name: 'launch-film.mp4', agent: '' });
const waiting = () => notesToSendTheAgent(row().artifacts, version(), 1, people, null);

beforeEach(async () => {
  disk._internals.forgetFolds();
  woke = 0;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-to-agent-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Launch film', body: 'Make the launch film.' });
  disk.updateWorkItem(dir, thread.id, { result: `Here it is: designs/${thread.id}/launch-film.mp4` }, { source: 'agent' });
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('a reply under a note the agent was sent', () => {
  beforeEach(async () => {
    expect(await write(film('n1', 'I still do not like the look of this.'))).toBe(true);
    disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
    woke = 0;
  });

  it('waits, and counts as not sent', async () => {
    expect(await write(reply('r1', 'n1', 'Show a beautiful inbox.'))).toBe(false);
    expect(woke).toBe(0);
    expect(waiting()).toEqual(['n1']);
  });

  it('Send hands it to the agent as your reply, with the note it answers and where that note is', async () => {
    await write(reply('r1', 'n1', 'Show a beautiful inbox where things are happening.'));
    expect(await send('n1')).toBe(true);
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

  it('is marked sent, so the card says it went and Send has nothing left', async () => {
    await write(reply('r1', 'n1', 'Show a beautiful inbox.'));
    await send('n1');
    expect(noteOf('n1').replies[0]).toMatchObject({ id: 'r1', sent: true });
    expect(waiting()).toEqual([]);
    expect(await send('n1')).toBe(false);
  });

  it('a second reply goes on its own', async () => {
    await write(reply('r1', 'n1', 'Show a beautiful inbox.'));
    await send('n1');
    await write(reply('r2', 'n1', '@agent and slower.'));
    expect(await send('n1')).toBe(true);
    expect(row().answer).toContain('@agent and slower.');
    expect(row().answer).not.toContain('Show a beautiful inbox.');
    expect(woke).toBe(2);
  });

  it('a reply written to a teammate stays with them', async () => {
    await write(reply('r1', 'n1', 'Sofia, what do you think?'));
    expect(waiting()).toEqual([]);
    expect(await send('n1')).toBe(false);
    expect(woke).toBe(0);
  });

  it('a reply that only thanks starts nothing', async () => {
    await write(reply('r1', 'n1', 'Thanks, looks great'));
    expect(await send('n1')).toBe(false);
  });

  it('a teammate\'s reply alone puts nothing in your Send', async () => {
    store.fileMark('website', thread.id, reply('r1', 'n1', 'Make it slower'));
    const marks = row().artifacts;
    marks.notes[0].replies[0].by = 'u-sofia';
    expect(notesToSendTheAgent(marks, version(), 1, people, 'u-me')).toEqual([]);
  });

  it('a note resolved since sends nothing', async () => {
    await write(reply('r1', 'n1', 'One more thing.'));
    store.fileMark('website', thread.id, { do: 'resolve', on: 'n1' });
    expect(await send('n1')).toBe(false);
    expect(woke).toBe(0);
  });
});

it('a note sent with its replies marks them sent too, so they are not sent again', async () => {
  await write({ ...film('n1', 'Too dark.'), wait: true });
  await write(reply('r1', 'n1', 'And brighter titles.'));
  expect(await send('n1')).toBe(true);
  expect(row().answer).toContain('And brighter titles.');
  expect(noteOf('n1').replies[0].sent).toBe(true);
  expect(await send('n1')).toBe(false);
});

it('the card says which replies went to the agent', () => {
  const r = (id, text, more = {}) => ({ id, text, by: 'u-me', ts: 2, ...more });
  const note = { id: 'n1', file: 'launch-film.mp4', place: { kind: 'time', s: 25 }, text: 'Too dark', by: 'u-me', ts: 1, mentions: [], owner: null, uid: null, sent: true,
    replies: [r('r1', 'Brighter', { sent: true }), r('r2', 'Sofia, thoughts?')] };
  const html = renderToStaticMarkup(React.createElement(FileNoteCard, {
    note, wordsGone: false, active: false, settling: false, person: () => null, me: 'u-me', onGo: () => {}, onSettle: () => {}, nameOf: () => 'Sofia',
    replying: false, onReplying: () => {}, onReply: async () => true, canReply: true, held: null, product: 'website',
  }));
  const replies = html.split('class="av-reply"').slice(1);
  expect(replies[0]).toContain('Sent to the agent');
  expect(replies[1]).not.toContain('Sent to the agent');
});
