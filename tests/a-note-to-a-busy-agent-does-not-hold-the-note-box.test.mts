// A comment on an agent's film could not be followed by another. The first
// note reached the agent; the second was written while the agent sat inside a
// long command (a render), and the note box's send button stayed greyed out:
// the note was saved, but saving it waited on noteToItsAgent, which waited for
// the agent to acknowledge the line at its next break, minutes away. Until then
// the note was not marked sent either, so "Send this note to the agent" showed
// beside it and pressing it would have told the agent the same note twice.
// Measured here with a running session whose input never acknowledges: the
// call never returned and the note stayed unsent.
//
// Now a note handed to a running agent counts as sent once it is on the
// agent's input, and the call returns without waiting for the agent's break.
import { it, expect, beforeEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { noteToItsAgent } from '../main/notes-wake.mts';

const HAND_OFF_MS = 30;
let store, dir, thread, steered, acknowledge;

const busySupervisor = () => ({
  sessions: new Map([[thread.id, {
    product: 'website',
    sessionId: 's1',
    child: {
      steer: (text) => { steered.push(text); return new Promise((resolve) => { acknowledge = resolve; }); },
    },
  }]]),
  _handledAnswers: new Set(),
  _answerKey: (item) => `${item.id}:${item.answer}`,
  _saveState() {},
  redeliverAnswer() {},
  deliverMidflightReply() {},
  wake() {},
});
const pin = (id, text) => ({ do: 'note', id, file: 'teaser.mp4', place: { kind: 'time', s: 15, x: 0.5, y: 0.5 }, text });
const hear = (supervisor, mark) => noteToItsAgent({ store, supervisor, product: 'website', id: thread.id, mark, nameOf: () => 'You', handOffMs: HAND_OFF_MS });
const note = (supervisor, mark) => { store.fileMark('website', thread.id, mark); return hear(supervisor, mark); };
const sentFlag = (id) => store.readItem('website', thread.id).artifacts.notes.find((n) => n.id === id).sent ?? false;
const inTime = (p, ms = 1000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('still waiting on the agent')), ms))]);

beforeEach(async () => {
  disk._internals.forgetFolds();
  steered = [];
  acknowledge = null;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'busy-agent-note-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  dir = path.join(accountRoot, 'website');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website' }));
  store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  thread = store.composeItem('website', { title: 'Launch teaser', body: 'Make the teaser film.' });
  disk.updateWorkItem(dir, thread.id, { result: `Here it is: designs/${thread.id}/teaser.mp4` }, { source: 'agent' });
});

describe('a note to an agent that is inside a long step', () => {
  it('returns before the agent reaches its next break, and the note reads as sent', async () => {
    const supervisor = busySupervisor();
    expect(await inTime(note(supervisor, pin('n1', 'No full screen code, just the usual artifact')))).toBe(true);
    expect(steered).toHaveLength(1);
    expect(steered[0]).toContain('No full screen code');
    expect(sentFlag('n1')).toBe(true);
  });

  it('is not told to the agent a second time when Send is pressed while it waits', async () => {
    const supervisor = busySupervisor();
    await inTime(note(supervisor, pin('n1', 'Tighter gap')));
    expect(await inTime(hear(supervisor, { do: 'toagent', on: ['n1'] }))).toBe(false);
    expect(steered).toHaveLength(1);
  });

  it('a second note right after the first goes on its own', async () => {
    const supervisor = busySupervisor();
    await inTime(note(supervisor, pin('n1', 'Tighter gap')));
    expect(await inTime(note(supervisor, pin('n2', 'Logo lower')))).toBe(true);
    expect(steered).toHaveLength(2);
    expect(steered[1]).toContain('Logo lower');
    expect(steered[1]).not.toContain('Tighter gap');
    expect(sentFlag('n2')).toBe(true);
  });

  it('is written into the thread once the agent takes it', async () => {
    const supervisor = busySupervisor();
    await inTime(note(supervisor, pin('n1', 'Tighter gap')));
    expect(store.readItem('website', thread.id).answer ?? '').not.toContain('Tighter gap');
    acknowledge({ accepted: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(store.readItem('website', thread.id).answer).toContain('Tighter gap');
  });
});

describe('what still waits for the answer', () => {
  it('an agent that takes the note at once: it is written into the thread before the call returns', async () => {
    const supervisor = busySupervisor();
    supervisor.sessions.get(thread.id).child.steer = (text) => { steered.push(text); return Promise.resolve({ accepted: true }); };
    expect(await inTime(note(supervisor, pin('n1', 'Tighter gap')))).toBe(true);
    expect(store.readItem('website', thread.id).answer).toContain('Tighter gap');
    expect(sentFlag('n1')).toBe(true);
  });

  it('a note that could not be saved as a reply: the error comes back and the note stays unsent', async () => {
    const idle = { sessions: new Map(), wake() {} };
    store.answerItem = () => { throw new Error('disk full'); };
    await expect(inTime(note(idle, pin('n1', 'Tighter gap')))).rejects.toThrow('disk full');
    expect(sentFlag('n1')).toBe(false);
  });
});
