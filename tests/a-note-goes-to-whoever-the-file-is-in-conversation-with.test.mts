// A NOTE GOES TO WHOEVER THE FILE IS IN CONVERSATION WITH, AND APPROVING A
// TEAMMATE'S FILE ONLY APPROVES IT.
//
// A tester wanted a teammate's review of a design and got "1 comment not sent to
// your agent", Unsent, Not sent and "Goes with your next reply": she could not
// tell whether Sam and Theo would see it. A note under Theo's reply did the same,
// and Approve on a file set her own agent off. Measured in noteSendWords and
// ArtifactView `send`: on a teammate's thread a file with no maker on its line
// read as nobody's ("Comment"); on her own thread a version Theo made, or a file
// Theo had already noted, still defaulted to her agent; and notes-wake's
// approvalToItsAgent told her agent "Proceed as you proposed" for any version an
// agent made, Theo's included.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { noteSendWords, whereANoteGoes, whoTalksOnFile } from '../renderer/src/artifact-pins.ts';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const people = [{ id: 'u-lena', name: 'Lena Ortiz' }, { id: 'u-theo', name: 'Theo Park' }, { id: 'u-sam', name: 'Sam Rivera' }];
const nameOf = (id) => people.find((p) => p.id === id)?.name.split(' ')[0] ?? 'A teammate';
const base = { people, me: 'u-lena', agentMade: true, toAgent: true, owner: 'u-lena', threadOwner: 'u-lena', talking: [] };
const goes = (text, more = {}) => whereANoteGoes({ ...base, text, ...more });
const words = (text, more = {}) => noteSendWords({ ...base, nameOf, text, ...more });

describe("on a teammate's thread or file", () => {
  const theirs = { toAgent: false, owner: null, threadOwner: 'u-theo' };
  it('goes to the teammate whose thread it is, even when the file names no maker', () => {
    expect(goes('Tighten the header', theirs)).toEqual({ to: 'person', person: 'u-theo' });
    expect(words('Tighten the header', theirs)).toBe('Send to Theo');
    expect(words('', theirs)).toBe('Send to Theo');
  });
  it('goes to whoever made that version, when it is another teammate', () => {
    expect(goes('Tighten the header', { ...theirs, owner: 'u-sam' })).toEqual({ to: 'person', person: 'u-sam' });
  });
  it('never to your agent, tagged or not', () => {
    expect(words('@agent tighten the header', theirs)).toBe('Send to Theo');
  });
  it("Theo's version in your own thread, or his file in Files, goes to Theo", () => {
    expect(words('Tighten the header', { owner: 'u-theo' })).toBe('Send to Theo');
    expect(words('Tighten the header', { owner: 'u-theo', threadOwner: null })).toBe('Send to Theo');
  });
  it('a note naming someone else goes to them', () => {
    expect(words('Sam, can you check this?', theirs)).toBe('Send to Sam');
  });
});

describe("on your own thread's file", () => {
  it('with nobody else on it, is a note for your agent that waits for Send', () => {
    expect(goes('Make the bar orange')).toEqual({ to: 'agent', now: false });
    expect(words('Make the bar orange')).toBe('Note for your agent');
    expect(words('')).toBe('Note for your agent');
  });
  it('tagging your agent sends it now', () => {
    expect(goes('@agent make the bar orange')).toEqual({ to: 'agent', now: true });
    expect(words('@agent make the bar orange')).toBe('Send to your agent');
  });
  it('with a teammate in the conversation about it, offers the teammate first', () => {
    expect(goes('Looks right to me?', { talking: ['u-theo'] })).toEqual({ to: 'person', person: 'u-theo' });
    expect(words('Looks right to me?', { talking: ['u-theo'] })).toBe('Send to Theo');
  });
  it('and @agent still reaches your agent there', () => {
    expect(goes('@agent make the bar orange', { talking: ['u-theo'] })).toEqual({ to: 'agent', now: true });
  });
  it('a thank-you starts nothing', () => {
    expect(goes('Thanks, looks good')).toEqual({ to: 'file' });
  });
  it('a file you attached yourself, with nobody else on it, is only a comment', () => {
    expect(words('Tighten this', { agentMade: false })).toBe('Comment');
    expect(words('Tighten this', { agentMade: false, talking: ['u-sam'] })).toBe('Send to Sam');
  });
});

describe('who is in the conversation about a file', () => {
  const note = (id, by, ts, more = {}) => ({ id, file: 'v1', place: { kind: 'whole' }, text: 'x', by, ts, mentions: [], replies: [], ...more });
  it('is everyone else who noted any version of it, or replied under a note, newest first', () => {
    const notes = [note('a', 'u-sam', 1), note('b', 'u-lena', 2, { replies: [{ id: 'r', by: 'u-theo', ts: 5, text: 'ok' }] }), note('c', 'u-sam', 3, { file: 'v2' })];
    expect(whoTalksOnFile(notes, ['v1', 'v2'], 'u-lena')).toEqual(['u-theo', 'u-sam']);
  });
  it('must NOT count notes on other files, or your own', () => {
    expect(whoTalksOnFile([note('a', 'u-sam', 1, { file: 'other' }), note('b', 'u-lena', 2)], ['v1'], 'u-lena')).toEqual([]);
  });
});

describe('every note box takes its words and its addressee from the one rule', () => {
  it('the big view', () => {
    const view = read('renderer/src/components/ArtifactView.tsx');
    expect(view).toMatch(/whereANoteGoes\(/);
    expect(view).toMatch(/goes\.to === 'person' \? \[goes\.person\] : \[\]/);
  });
  it('the notes beside the chat', () => {
    const side = read('renderer/src/components/NotesSidebar.tsx');
    expect(side).toMatch(/whereANoteGoes\(/);
    expect(side).toMatch(/aria-label=\{sendWords\}/);
  });
  it("a teammate's thread names its owner, and a conversation its people", () => {
    expect(read('renderer/src/threads/TeammateThread.tsx')).toMatch(/ownerOfRow=\{personId\}/);
    expect(read('renderer/src/components/ThreadArtifacts.tsx')).toMatch(/talkingWith=\{/);
  });
});

describe('Approve', () => {
  let store, dir, thread, woke;
  const supervisor = { sessions: new Map(), wake: () => { woke++; } };
  const approve = (file) => { store.fileMark('website', thread.id, { do: 'approve', file }); return noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark: { do: 'approve', file } }); };

  beforeEach(async () => {
    disk._internals.forgetFolds();
    woke = 0;
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'approve-theirs-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    dir = path.join(accountRoot, 'website');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
    store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    disk.setLineAuthor('u-lena');
    thread = store.composeItem('website', { title: 'Hero', body: 'Design the hero.' });
    disk.updateWorkItem(dir, thread.id, { result: `**Ship this hero?**\n\ndesigns/${thread.id}/1-hero.png` }, { source: 'agent' });
    disk.setLineAuthor('u-theo');
    disk.updateWorkItem(dir, thread.id, { result: `My take: designs/${thread.id}/theo-hero.png` }, { source: 'agent' });
    disk.setLineAuthor('u-lena');
    disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
  });
  afterEach(() => { disk.setLineAuthor(null); });

  it("on a teammate's version only approves it: your agent hears nothing and nothing starts", async () => {
    expect(await approve('theo-hero.png')).toBe(false);
    expect(store.readItem('website', thread.id).status).toBe('blocked');
    expect(woke).toBe(0);
  });
  it("on your own agent's version is still the go-ahead it waited for", async () => {
    expect(await approve('1-hero.png')).toBe(true);
    expect(woke).toBe(1);
  });
  it("on a teammate's thread is written to their copy, never to an agent here", () => {
    const page = read('renderer/src/threads/TeammateThread.tsx');
    const view = page.slice(page.indexOf('<ArtifactView'), page.indexOf('onNewVersion', page.indexOf('<ArtifactView')));
    expect(view).toMatch(/api\.teamMarkFile/);
    expect(view).not.toMatch(/api\.fileMark\(/);
  });
});
