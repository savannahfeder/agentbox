// A tester filed a thread in the wrong project and went to ⌘K for "Move to
// project…" (power-test-1, issue 20). Nothing in the app could do it, and
// "pro" offered only New project… and Projects….
//
// The whole thread cannot follow: its session traces sit under the project, its
// task folder is a git worktree in THAT project's repository with a branch
// named after it, and a branch cannot change repository. So a thread nothing
// has ever run on moves, which is the case the tester hit, and everything else
// is refused out loud.

import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { canMove, movedAway, movedHere, MOVE_KEYWORDS, RAN_ALREADY, whatMoves, whyItCannotMove } from '../shared/move-thread.mjs';
import { matchesQuery } from '../renderer/src/palette-rows.ts';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mjs';

let store, root;

const project = (slug, name) => {
  const dir = path.join(root, slug);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name }));
};

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'move-thread-'));
  project('web-app', 'Web app');
  project('infra', 'Infra');
  store = await new Store({ accountRoot: root, products: [] }).init();
});

describe('which threads may move', () => {
  it('one you have just typed, which is the case that was reported', () => {
    expect(whyItCannotMove({ status: 'open', epoch: 0 })).toBe(null);
  });

  it('not one an agent has ever had', () => {
    expect(whyItCannotMove({ status: 'open', epoch: 1 })).toBe(RAN_ALREADY);
    expect(whyItCannotMove({ status: 'open', epoch: 0, result: 'Done.' })).toBe(RAN_ALREADY);
    expect(whyItCannotMove({ status: 'open', epoch: 0, note: 'Reading the repo.' })).toBe(RAN_ALREADY);
  });

  it('not one a worker is inside right now, which no field on the row can say', () => {
    expect(canMove({ status: 'open', epoch: 0 }, { live: true })).toBe(false);
    expect(whyItCannotMove({ status: 'open', epoch: 0 }, { live: true })).toMatch(/Stop it first/);
  });

  it('not a finished one, and not a session running outside Agentbox', () => {
    expect(canMove({ status: 'done', epoch: 0 })).toBe(false);
    expect(canMove({ status: 'open', epoch: 0, agent: { name: 'claude' } })).toBe(false);
  });

  it('says why in a sentence every time it refuses', () => {
    for (const item of [null, { status: 'done' }, { epoch: 2 }, { agent: {} }]) {
      expect(typeof whyItCannotMove(item)).toBe('string');
    }
  });
});

describe('what a move carries', () => {
  it('everything you set', () => {
    const carried = whatMoves({
      title: 'Fix the login bug', body: 'It 500s.', priority: 7, labels: ['founder'],
      model: 'opus', engine: 'claude', effort: 'high', kind: 'directive', parent: 'w-dad',
    });
    expect(carried).toEqual({
      title: 'Fix the login bug', body: 'It 500s.', priority: 7, labels: ['founder'],
      model: 'opus', engine: 'claude', effort: 'high', kind: 'directive', parent: 'w-dad',
    });
  });

  it('and none of the life it had in the old project', () => {
    const carried = whatMoves({
      title: 'Fix the login bug', status: 'blocked', epoch: 3, result: 'Done.',
      note: 'Reading.', answer: 'go on', createdAt: 1, updatedAt: 2, answeredThrough: 2,
    });
    for (const field of ['status', 'epoch', 'result', 'note', 'answer', 'createdAt', 'updatedAt', 'answeredThrough']) {
      expect(carried[field], field).toBeUndefined();
    }
  });
});

describe('the move itself', () => {
  it('files the message in the other project and closes the old row', () => {
    const made = store.composeItem('web-app', { title: 'The nightly job writes to the wrong bucket', body: 'on weekends', model: 'opus' });
    const out = store.moveItem('web-app', made.id, 'infra');

    const landed = store.readItem('infra', out.item.id);
    expect(landed.title).toBe('The nightly job writes to the wrong bucket');
    expect(landed.body).toContain('on weekends');
    expect(landed.model).toBe('opus');
    expect(landed.status).toBe('open');

    const left = store.readItem('web-app', made.id);
    expect(left.status).toBe('done');
    expect(left.note).toBe(movedAway('Infra'));
  });

  it('keeps the founder label, so the moved thread still runs', () => {
    const made = store.composeItem('web-app', { title: 'Tidy the settings page' });
    const out = store.moveItem('web-app', made.id, 'infra');
    expect(store.readItem('infra', out.item.id).labels).toContain('founder');
  });

  it('gives it a new id, because two rows with one id is a row that is not drawn', () => {
    const made = store.composeItem('web-app', { title: 'Tidy the settings page' });
    const out = store.moveItem('web-app', made.id, 'infra');
    expect(out.item.id).not.toBe(made.id);
    expect(() => store.readItem('infra', made.id)).not.toThrow();
    expect(store.readItem('infra', made.id)).toBe(null);
  });

  // `composeItem` has no argument for these three, so without a second write
  // the store would drop them on the floor without saying so.
  it('carries the name you gave it, your context and the thread it was under', () => {
    const made = store.composeItem('web-app', { title: 'Tidy the settings page' });
    store.threadEdit('web-app', made.id, { label: 'Settings spacing', problem: 'The rows are too far apart.' });
    store.modules.workItemsDisk.updateWorkItem(store.productDir('web-app'), made.id, { parent: 'w-dad' }, { source: 'founder' });
    const out = store.moveItem('web-app', made.id, 'infra');
    const landed = store.readItem('infra', out.item.id);
    expect(landed.label).toBe('Settings spacing');
    expect(landed.problem).toBe('The rows are too far apart.');
    expect(landed.parent).toBe('w-dad');
  });

  it('says on the new thread where it came from, so neither end is a row that vanished', () => {
    const made = store.composeItem('web-app', { title: 'Tidy the settings page' });
    const out = store.moveItem('web-app', made.id, 'infra');
    expect(store.readItem('infra', out.item.id).body).toContain(movedHere('Web app'));
  });

  it('refuses a thread an agent has had, in the words the screen uses', () => {
    const made = store.composeItem('web-app', { title: 'Tidy the settings page' });
    store.answerItem('web-app', made.id, { status: 'blocked' });
    store.modules.workItemsDisk.updateWorkItem(store.productDir('web-app'), made.id, { result: 'Half done.' }, { source: 'agent' });
    expect(() => store.moveItem('web-app', made.id, 'infra')).toThrow(RAN_ALREADY);
  });

  it('refuses a move to the project it is already in', () => {
    const made = store.composeItem('web-app', { title: 'Tidy the settings page' });
    expect(() => store.moveItem('web-app', made.id, 'web-app')).toThrow(/already in that project/);
  });

  it('refuses a project that is not there, rather than making one', () => {
    const made = store.composeItem('web-app', { title: 'Tidy the settings page' });
    expect(() => store.moveItem('web-app', made.id, 'nowhere')).toThrow();
    expect(store.readItem('web-app', made.id).status).toBe('open');
  });
});

describe('where you reach for it', () => {
  const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
  const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
  const commands = app.slice(app.indexOf('itemCommands={(() => {'), app.indexOf('filtering={'));

  it('is one ⌘K row per project, the way ranking one already is', () => {
    expect(commands).toContain('`Move to ${p.name}`');
    expect(commands).toContain("p.slug !== target.product");
  });

  // A conversation with a person is not a project to file work in, and the
  // practice project runs nothing.
  it('offers the same projects the new thread card does, and never the practice one', () => {
    expect(commands).toContain('projectsOffered(rankedProducts)');
    expect(commands).toContain('!p.practice');
  });

  it('is found by every word somebody types reaching for it', () => {
    const row = { label: 'Move to Infra', keywords: MOVE_KEYWORDS };
    for (const query of ['move', 'project', 'wrong project', 'file', 'move to infra']) {
      expect(matchesQuery(query, row), query).toBe(true);
    }
  });

  // "pro" offered New project… and Projects… and nothing else, which is the
  // complaint. A thread that cannot move still answers the word.
  it('answers the word even when this thread cannot move, rather than matching nothing', () => {
    expect(commands).toContain("id: 'move-refused'");
    expect(commands).toContain('showToast(moveRefusal)');
  });

  it('hands the row to a named callback, like every other command', () => {
    expect(commands).toContain('void moveToProject(target, p.slug, p.name)');
    expect(commands).not.toContain('api.moveItem(');
  });

  it('asks the one question only the main process can answer', () => {
    expect(commands).toContain('live: liveIds.has(target.id)');
  });

  it('is on both front doors, so the browser build has it too', () => {
    expect(REQUEST_CHANNELS.moveItem).toBe('zero:move-item');
    const preload = fs.readFileSync(path.join(root, 'preload.cjs'), 'utf8');
    expect(preload).toContain("moveItem: (payload) => ipcRenderer.invoke('zero:move-item', payload)");
  });
});
