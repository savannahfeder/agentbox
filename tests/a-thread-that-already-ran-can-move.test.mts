// A THREAD THAT ALREADY RAN CAN MOVE (w-8b637c7802).
//
// Two testers sent a thread to the wrong project because the card kept the
// last pick. The agent answered within seconds, and from then on ⌘K said "Only
// a thread nothing has run on can move. This one has a history here." The only
// way out was to type it again in the right project. Measured through the
// store and the rule ⌘K draws from.
//
// The branch and task folder stay where they are. It is refused while an agent
// is in it, and when it changed code in its old project, which a move would
// strand. What it carries is tests/a-moved-thread-keeps-its-answer-and-leaves-no-copy-in-done.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { CHANGED_HERE, movedAway, movedHere, whatMoves, whyItCannotMove } from '../shared/move-thread.mts';
import { SHIP_FAILED } from '../shared/not-shipped.mts';
import { belongsInInbox } from '../renderer/src/list-rules.ts';

let store, root;
const project = (slug, name) => {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name }));
};
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'move-ran-'));
  project('backend', 'Backend');
  project('frontend', 'Frontend');
  store = await new Store({ accountRoot: root, products: [] }).init();
});

const answered = (title) => {
  const made = store.composeItem('backend', { title, model: 'opus' });
  // Later than your words, as a real answer is: in the same millisecond it is not news.
  store.modules.workItemsDisk.updateWorkItem(store.productDir('backend'), made.id, { result: 'There is no ./store in this repo.' }, { source: 'agent', now: Date.now() + 1000 });
  return store.readItem('backend', made.id);
};

describe('which threads may move', () => {
  it('one an agent has answered', () => {
    expect(whyItCannotMove({ status: 'open', epoch: 2, result: 'Done.' })).toBe(null);
    expect(whyItCannotMove({ status: 'blocked', epoch: 1, note: 'Reading the repo.' })).toBe(null);
  });

  it('not while an agent is in it', () => {
    expect(whyItCannotMove({ status: 'open', epoch: 1 }, { live: true })).toMatch(/Stop it first/);
  });

  it('not one whose work did not ship, which would leave it behind', () => {
    const note = `${SHIP_FAILED}the tests failed.`;
    expect(whyItCannotMove({ status: 'open', epoch: 1, note, wrote: { note: { ts: 2 } } })).toBe(CHANGED_HERE);
  });

  it('not a finished one', () => {
    expect(whyItCannotMove({ status: 'done', epoch: 1, result: 'Done.' })).toMatch(/finished/);
  });
});

describe('what it carries when it ran', () => {
  it('your message, and none of the labels that belonged to its run', () => {
    const carried = whatMoves({ title: 'explain this error', body: 'from settings.tsx', labels: ['founder', 'ship', 'clean', 'repeat:r-1'], epoch: 2, result: 'Done.' });
    expect(carried.title).toBe('explain this error');
    expect(carried.body).toBe('from settings.tsx');
    expect(carried.labels).toEqual(['founder']);
  });
});

describe('the move', () => {
  it('opens it in the new project with its answer, and closes the old one saying where it went', () => {
    const was = answered('explain this error: cannot find module ./store from settings.tsx');
    const out = store.moveItem('backend', was.id, 'frontend');

    const landed = store.readItem('frontend', out.item.id);
    expect(landed.title).toBe(was.title);
    expect(landed.status).toBe(was.status);
    expect(landed.labels).toContain('founder');
    expect(landed.result).toBe('There is no ./store in this repo.');
    expect(landed.body).toContain(movedHere('Backend'));

    const left = store.readItem('backend', was.id);
    expect(left.status).toBe('done');
    expect(left.note).toBe(movedAway('Frontend'));
    expect(left.result).toBe('There is no ./store in this repo.');
  });

  // Closed as the app, the old row read as an agent finishing your thread and
  // stayed in Needs you beside the moved one, marked DONE.
  it('is in Needs you once, as the moved thread, and Z can still reopen the old row', () => {
    const was = answered('explain this error');
    const out = store.moveItem('backend', was.id, 'frontend');
    const left = store.readItem('backend', was.id);
    expect(belongsInInbox(left)).toBe(false);
    expect(belongsInInbox(store.readItem('frontend', out.item.id))).toBe(true);
    store.answerItem('backend', was.id, { status: 'open' });
    expect(store.readItem('backend', was.id).status).toBe('open');
  });
});

describe('the door it goes through', () => {
  const ipc = fs.readFileSync(path.join(import.meta.dirname, '..', 'main/ipc.mts'), 'utf8');
  const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:move-item'"), ipc.indexOf("ipcMain.handle('zero:team-route'"));

  it('reads the thread’s task folder for code it changed before moving it', () => {
    expect(handler).toMatch(/whereTheWorkStands\(/);
    expect(handler).toMatch(/CHANGED_HERE/);
  });
});
