// Notes on a document the agent made could not be sent once you had typed in
// it. Reported on an agent's interview answers: two notes, no Send, no "Send
// all", no "Not sent", and "Add a note" instead of "Add a note, or @ your
// agent". Measured in the real file view in Chromium: the agent's v1 showed
// "Send 2" and "Send all"; your edited v2 of it showed neither, and main
// refused the notes too, because an edited version carries no agent and every
// check asked the version itself.
//
// A version you edited now belongs to the agent whose file it was
// (agentOfVersion). A file you attached, and your edit of it, still has none.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mts';
import { agentOfVersion, threadFiles } from '../shared/artifact-marks.mts';
import { notesToSendTheAgentAnywhere } from '../renderer/src/artifact-pins.ts';
import { fileFamilyFor } from '../renderer/src/notes-sidebar.ts';

const v = (id, extra = {}) => ({ id, ...extra });

describe('whose agent hears notes on a version', () => {
  it("the agent's own version", () => {
    expect(agentOfVersion([v('a.md', { agent: '' })], 'a.md')).toBe('');
  });
  it('your edit of it', () => {
    expect(agentOfVersion([v('a.md', { agent: 'Ada' }), v('a-v2.md', { edited: true })], 'a-v2.md')).toBe('Ada');
  });
  it('your second edit after the first', () => {
    expect(agentOfVersion([v('a.md', { agent: '' }), v('a-v2.md', { edited: true }), v('a-v3.md', { edited: true })], 'a-v3.md')).toBe('');
  });
  it("the agent's own later version after your edit is still its own", () => {
    expect(agentOfVersion([v('a.md', { agent: '' }), v('a-v2.md', { edited: true }), v('a-v3.md', { agent: 'Ada' })], 'a-v3.md')).toBe('Ada');
  });
  it('not a file you attached', () => {
    expect(agentOfVersion([v('a.md')], 'a.md')).toBeNull();
  });
  it('not your edit of a file you attached', () => {
    expect(agentOfVersion([v('a.md'), v('a-v2.md', { edited: true })], 'a-v2.md')).toBeNull();
  });
  it('not a version that is not there', () => {
    expect(agentOfVersion([v('a.md', { agent: '' })], 'b.md')).toBeNull();
  });
});

let store, dir, thread, woke;
const supervisor = { sessions: new Map(), wake: () => { woke++; } };
const lines = () => disk.readItemHistory(dir, thread.id, { max: Number.MAX_SAFE_INTEGER });

beforeEach(async () => {
  disk._internals.forgetFolds();
  woke = 0;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-to-agent-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'yc');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'yc', name: 'YC' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('yc', { title: 'Interview answers', body: 'Write my interview answers.' });
  disk.updateWorkItem(dir, thread.id, { result: 'Here they are: [interview-answers.md](yc/interview-answers.md)' }, { source: 'agent' });
  disk.updateWorkItem(dir, thread.id, { status: 'blocked' }, { source: 'system' });
});

const edit = (to) => store.fileMark('yc', thread.id, { do: 'edit', file: 'interview-answers.md', path: to });
const note = (id, file, v) => ({ do: 'note', id, file, v, place: { kind: 'quote', text: 'Coding agents work on your computer' }, text: 'Need more technical details here.', wait: true });
const row = () => store.readItem('yc', thread.id);

describe('a note on your edit of the agent’s document', () => {
  it('counts as not sent, so Send and Send all are offered', () => {
    edit('yc/interview-answers-v2.md');
    store.fileMark('yc', thread.id, note('n1', 'interview-answers-v2.md', 2));
    const fams = threadFiles([{ path: 'yc/interview-answers.md', by: null, at: 1, agent: '' }, { path: 'yc/interview-answers-v2.md', by: null, at: 2, edited: true }]);
    expect(fams[0].versions.map((x) => x.id)).toEqual(['interview-answers.md', 'interview-answers-v2.md']);
    expect(notesToSendTheAgentAnywhere(row().artifacts, fams, 'interview-answers-v2.md', [], null).ids).toEqual(['n1']);
  });

  it('the notes beside the chat offer Send on it too', () => {
    edit('yc/interview-answers-v2.md');
    expect(fileFamilyFor(lines(), 'yc/interview-answers-v2.md').agent).toBe('');
  });

  it('Send hands it to the agent, naming the edited copy to read', async () => {
    edit('yc/interview-answers-v2.md');
    const mark = note('n1', 'interview-answers-v2.md', 2);
    store.fileMark('yc', thread.id, mark);
    store.fileMark('yc', thread.id, { do: 'toagent', on: ['n1'] });
    expect(await noteToItsAgent({ store, supervisor, product: 'yc', id: thread.id, mark: { do: 'toagent', on: ['n1'] }, nameOf: () => 'You' })).toBe(true);
    expect(row().answer).toContain('Need more technical details here.');
    expect(row().answer).toContain('yc/interview-answers-v2.md');
    expect(row().artifacts.notes.find((n) => n.id === 'n1').sent).toBe(true);
    expect(woke).toBe(1);
  });

  it('a file you attached and then edited still sends nothing', async () => {
    const mine = store.composeItem('yc', { title: 'Look at this', body: 'See [notes.md](yc/notes.md)' });
    store.fileMark('yc', mine.id, { do: 'edit', file: 'notes.md', path: 'yc/notes-v2.md' });
    store.fileMark('yc', mine.id, note('m1', 'notes-v2.md', 2));
    expect(await noteToItsAgent({ store, supervisor, product: 'yc', id: mine.id, mark: { do: 'toagent', on: ['m1'] } })).toBe(false);
    expect(woke).toBe(0);
  });
});
