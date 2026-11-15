// A REPLY IN THE THREAD TAKES YOUR WAITING COMMENTS WITH IT.
//
// Comments on an agent's pictures wait for Send, and Send was only in the
// picture view, one picture at a time. A person left comments on three
// pictures, closed them, and typed "continue" in the thread: the reply went,
// the three comments stayed "Not sent", and the agent never heard them. They
// thought it was a bug. Measured on main: zero:answer wrote the typed words
// alone and nothing marked the notes sent.
//
// Now the reply carries every comment of yours still waiting, from every
// picture, in one message, notes first and your words last. The thread draws
// your words as you typed them, and the comments stop saying they wait.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent, replyWithWaitingNotes, waitingNotes } from '../main/notes-wake.mts';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { messageKind } from '../renderer/src/threads/message-kind.ts';

let store, dir, thread;
const people = [{ id: 'u-maya', name: 'Maya Chen' }];
const nameOf = () => 'Sam';
const pin = (id, file, text, more = {}) => ({ do: 'note', id, file, place: { kind: 'pin', x: 0.5, y: 0.5 }, text, wait: true, ...more });
const carry = (answer, me = null) => replyWithWaitingNotes({ store, product: 'website', id: thread.id, answer, me, nameOf, people });
const row = () => store.readItem('website', thread.id);
const lines = () => disk.readItemHistory(dir, thread.id, { max: Number.MAX_SAFE_INTEGER });
// What zero:answer does with what carry() returns.
const reply = (answer) => {
  const withNotes = carry(answer);
  if (withNotes) {
    store.answerItem('website', thread.id, { answer: withNotes.answer, fromNotes: withNotes.fromNotes, typed: answer });
    store.fileMark('website', thread.id, { do: 'sent', on: withNotes.fromNotes });
  } else store.answerItem('website', thread.id, { answer });
};

beforeEach(async () => {
  disk._internals.forgetFolds();
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-carries-notes-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Onboarding', body: 'Design onboarding.' });
  disk.updateWorkItem(dir, thread.id, { result: `Two screens: designs/${thread.id}/step-1.png and designs/${thread.id}/step-2.png` }, { source: 'agent' });
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

describe('what the agent is told', () => {
  it('your waiting comments on every picture, then your words last', () => {
    store.fileMark('website', thread.id, pin('n1', 'step-1.png', 'Lose the grey strip'));
    store.fileMark('website', thread.id, pin('n2', 'step-2.png', 'Keep the sidebar'));
    const out = carry('continue');
    expect(out.fromNotes).toEqual(['n1', 'n2']);
    expect(out.answer).toContain('Lose the grey strip');
    expect(out.answer).toContain('Keep the sidebar');
    expect(out.answer).toContain(`designs/${thread.id}/step-1.png`);
    expect(out.answer).toContain(`designs/${thread.id}/step-2.png`);
    expect(out.answer.endsWith('\n\ncontinue')).toBe(true);
  });

  it('nothing waiting leaves the reply as it was', () => {
    expect(carry('continue')).toBeNull();
    store.fileMark('website', thread.id, pin('n1', 'step-1.png', 'Lose the grey strip'));
    store.fileMark('website', thread.id, { do: 'sent', on: ['n1'] });
    expect(carry('continue')).toBeNull();
  });

  it('leaves out a resolved comment, one written to a teammate, and one on a file the agent did not make', () => {
    store.fileMark('website', thread.id, pin('n1', 'step-1.png', 'Old point'));
    store.fileMark('website', thread.id, { do: 'resolve', on: 'n1' });
    store.fileMark('website', thread.id, pin('n2', 'step-1.png', '@Maya what do you think?', { mentions: ['u-maya'] }));
    store.fileMark('website', thread.id, pin('n3', 'not-in-the-thread.png', 'Nobody made this'));
    expect(carry('continue')).toBeNull();
  });

  it("leaves out a teammate's comment: only yours ever start your agent", () => {
    disk.setLineAuthor('u-maya');
    try { store.fileMark('website', thread.id, pin('n1', 'step-1.png', 'Ignore this part')); } finally { disk.setLineAuthor(null); }
    const maya = row().artifacts.notes.find((n) => n.id === 'n1');
    expect(maya.by).toBe('u-maya');
    expect(carry('continue', null)).toBeNull();
    expect(carry('continue', 'u-maya')).not.toBeNull();
  });

  it('a slash command or a withdrawal carries nothing', () => {
    store.fileMark('website', thread.id, pin('n1', 'step-1.png', 'Lose the grey strip'));
    expect(carry('/compact')).toBeNull();
    expect(carry('(withdrawn)')).toBeNull();
    expect(carry('  ')).toBeNull();
  });
});

describe('after the reply', () => {
  beforeEach(() => {
    store.fileMark('website', thread.id, pin('n1', 'step-1.png', 'Lose the grey strip'));
    store.fileMark('website', thread.id, pin('n2', 'step-2.png', 'Keep the sidebar'));
    reply('continue');
  });

  it('the run is handed the comments and your words in one answer', () => {
    const item = row();
    expect(item.status).toBe('open');
    expect(item.answer).toContain('Lose the grey strip');
    expect(item.answer).toContain('Keep the sidebar');
    expect(item.answer.endsWith('continue')).toBe(true);
  });

  it('the thread draws your words as you typed them, once', () => {
    const yours = threadEvents(lines()).filter((e) => e.field === 'answer');
    expect(yours.map((e) => e.words)).toEqual(['continue']);
  });

  it('the comments no longer wait, and the next reply carries nothing', () => {
    const notes = threadEvents(lines()).filter((e) => e.fileMark?.kind === 'note');
    expect(notes.map((e) => messageKind(e).why)).toEqual([undefined, undefined]);
    expect(carry('and another thing')).toBeNull();
  });
});

describe('in the thread, before the reply', () => {
  it('a waiting comment says it goes with your next reply', () => {
    store.fileMark('website', thread.id, pin('n1', 'step-1.png', 'Lose the grey strip'));
    const note = threadEvents(lines()).find((e) => e.fileMark?.kind === 'note');
    expect(messageKind(note).why).toBe('Goes with your next reply');
  });
});

describe('notes sent from the picture alone still draw no reply', () => {
  it('an answer made only of notes draws nothing of its own', () => {
    store.fileMark('website', thread.id, pin('n1', 'step-1.png', 'Lose the grey strip'));
    store.answerItem('website', thread.id, { answer: 'Notes on step-1.png: ...', fromNotes: ['n1'] });
    expect(threadEvents(lines()).filter((e) => e.field === 'answer')).toEqual([]);
  });
});

describe('Send back to agent, with no words', () => {
  it('hands over the same comments a reply would', async () => {
    store.fileMark('website', thread.id, pin('n1', 'step-1.png', 'Lose the grey strip'));
    store.fileMark('website', thread.id, pin('n2', 'step-2.png', 'Keep the sidebar'));
    const on = waitingNotes({ store, product: 'website', id: thread.id, me: null, people });
    expect(on).toEqual(['n1', 'n2']);
    const mark = { do: 'toagent', on };
    store.fileMark('website', thread.id, mark);
    const supervisor = { sessions: new Map(), wake: () => {} };
    expect(await noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark, nameOf, people })).toBe(true);
    expect(row().answer).toContain('Lose the grey strip');
    expect(row().answer).toContain('Keep the sidebar');
    expect(waitingNotes({ store, product: 'website', id: thread.id, me: null, people })).toEqual([]);
  });
});

describe('the app uses it', () => {
  const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
  const handler = (name, next) => ipc.slice(ipc.indexOf(`ipcMain.handle('${name}'`), ipc.indexOf(`ipcMain.handle('${next}'`));
  it('zero:answer sends the carried answer and marks the comments sent', () => {
    const answer = handler('zero:answer', 'zero:set-product-order');
    expect(answer).toMatch(/replyWithWaitingNotes\(/);
    expect(answer).toMatch(/typed: answer/);
    expect(answer).toMatch(/do: 'sent', on: withNotes\.fromNotes/);
  });
  it('zero:reopen hands the waiting comments to the agent', () => {
    const reopen = handler('zero:reopen', 'zero:instruction-read');
    expect(reopen).toMatch(/waitingNotes\(/);
    expect(reopen).toMatch(/noteToItsAgent\(/);
  });
});
